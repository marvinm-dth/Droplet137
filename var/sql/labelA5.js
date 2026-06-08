// labelA4.js
require("dotenv").config();

const express     = require("express");
const { createClient } = require("@supabase/supabase-js");
const QRCode      = require("qrcode");
const fs          = require("fs");
const path        = require("path");
const PDFDocument = require("pdfkit");
const fetch       = require("node-fetch");
const { createCanvas } = require("canvas");
const pdfjsLib    = require("pdfjs-dist/build/pdf.js");

// PDF.js worker (for Node)
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/build/pdf.worker.js");

const app  = express();
const port = process.env.PORT || 50;

const supabaseUrl     = "http://137.184.148.164:8000";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase        = createClient(supabaseUrl, supabaseAnonKey);

const BRIDGE_URL    = "http://137.184.148.164:5090/api/print-image";
const PRINTER_QUEUE = process.env.PRINTER_QUEUE || "D520_raw";

// Ensure directory exists
function ensureDirectoryExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Elements configuration (including your divider)
const elementsConfig = [
  /* … your existing elements … */,
  {
    name: "divider",
    type: "line",
    orientation: "vertical",
    position: { x:0.55, y:0.05 },
    length: 0.9,
    thickness: 2,
    color: "black",
    style: "solid"
  },
];

// Fetch dynamic text data
async function fetchElementData(el, lookupValue) {
  if (!el.table || !el.returnColumn) return el.text || "";
  const { data, error } = await supabase
    .from(el.table)
    .select(el.returnColumn)
    .eq(el.lookupColumn, lookupValue)
    .single();
  let val = data?.[el.returnColumn];
  if (!val && el.fallbackColumn) {
    const { data: fb } = await supabase
      .from(el.table)
      .select(el.fallbackColumn)
      .eq(el.lookupColumn, lookupValue)
      .single();
    val = fb?.[el.fallbackColumn];
  }
  if (!val && el.generateFallback) {
    val = `DTH${Math.floor(1e7 + Math.random()*9e7)}`;
    await supabase
      .from(el.table)
      .update({ [el.fallbackColumn]: val })
      .eq(el.lookupColumn, lookupValue);
  }
  if (el.truncate && val?.length > el.truncate) val = val.substring(0, el.truncate);
  return val || el.text || "";
}

// Render elements into the PDF
async function renderElements(doc, config, ctx, dims) {
  for (const el of config) {
    // skip bad configs
    if (!el.position || typeof el.position.x !== "number") continue;

    const x = el.position.x * dims.width;
    const y = el.position.y * dims.height;
    const w = (el.bounds?.width  || 0) * dims.width;
    const h = (el.bounds?.height || 0) * dims.height;
    const content = await fetchElementData(el, ctx[el.lookupColumn]);
    ctx[el.name] = content;

    switch(el.type) {
      case "box":
        if (el.fillColor) doc.rect(x,y,w,h).fill(el.fillColor);
        if (el.outlineColor) {
          doc.lineWidth(el.outlineThickness||1)
             .strokeColor(el.outlineColor)
             .rect(x,y,w,h)
             .stroke();
        }
        break;
      case "text":
        if (el.fillColor) doc.rect(x,y,w,h).fill(el.fillColor);
        doc.fillColor(el.fontColor||"black")
           .font(el.font)
           .fontSize(el.fontSize * dims.height)
           .save();
        if (el.rotation) doc.rotate(el.rotation,{origin:[x,y]});
        doc.text(content, x, y, { width:w, height:h }).restore();
        break;
      case "qr":
        const buf = await QRCode.toBuffer(content||"UNKNOWN");
        doc.image(buf, x, y, { width:w, height:h });
        break;
      case "line":
        doc.save();
        doc.lineWidth(el.thickness||1)
           .strokeColor(el.color||"black")
           .undash();
        if (el.style==="dashed") doc.dash(5);
        else if (el.style==="dotted") doc.dash(1,{space:3});
        else if (el.style==="dot-dash") doc.dash(5,{space:3,phase:2});
        if (el.orientation==="vertical")
          doc.moveTo(x,y).lineTo(x, y + el.length * dims.height);
        else
          doc.moveTo(x,y).lineTo(x + el.length * dims.width, y);
        doc.stroke().restore();
        break;
    }
  }
}

// Create a 2×1″ PDF (600×300 px)
async function createPdf(order) {
  const filePath = `./pdf/${order.order_id}.pdf`;
  ensureDirectoryExists(filePath);

  const doc = new PDFDocument({ size:[600,300], margin:0 });
  doc.pipe(fs.createWriteStream(filePath));

  for (let i=1; i<=order.order_qty_requested; i++) {
    if (i>1) doc.addPage({size:[600,300],margin:0});
    await renderElements(doc, elementsConfig, order, {width:600,height:300});
  }

  doc.end();
  return filePath;
}

// Convert PDF pages to PNG and print each
async function sendToPrinter(pdfPath) {
  const data = fs.readFileSync(pdfPath);
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const viewport= page.getViewport({ scale:300/72 });
    const canvas  = createCanvas(viewport.width, viewport.height);
    const ctx     = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    const imageData = canvas.toBuffer("image/png").toString("base64");

    await fetch(BRIDGE_URL, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({
        imageData,
        queue: PRINTER_QUEUE,
        cut: true
      })
    });
  }
}

// Poll pending orders → generate → update → print
async function pollPendingOrders() {
  const { data: orders, error } = await supabase
    .from("home_depot_order_history")
    .select("order_id, order_qty_requested, material_id")
    .is("label_pdf_url", null);

  if (error) {
    console.error("Fetch Error:", error);
    return;
  }

  for (const order of orders) {
    try {
      const pdfPath = await createPdf(order);
      await supabase
        .from("home_depot_order_history")
        .update({ label_pdf_url: pdfPath })
        .eq("order_id", order.order_id);

      // now send each page as an image to the printer bridge
      await sendToPrinter(pdfPath);

      console.log("Printed order", order.order_id);
    } catch (e) {
      console.error(`Error for order ${order.order_id}:`, e);
    }
  }
}

// Run every second
setInterval(pollPendingOrders, 1000);

app.listen(port, ()=>{
  console.log(`Label printer client listening on port ${port}`);
});
