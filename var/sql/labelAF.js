// labelAC_final.js

require("dotenv").config();

const express             = require("express");
const { createClient }    = require("@supabase/supabase-js");
const QRCode              = require("qrcode");
const fs                  = require("fs");
const path                = require("path");
const PDFDocument         = require("pdfkit");
const fetch               = require("node-fetch");
const { createCanvas }    = require("canvas");
const pdfjsLib            = require("pdfjs-dist/es5/build/pdf.js");

const app  = express();
const port = process.env.PORT || 50;

// Supabase client
const supabase = createClient(
  "http://137.184.148.164:8000",
  process.env.SUPABASE_ANON_KEY
);

// Printer bridge settings
const BRIDGE_URL    = "http://137.184.148.164:5090/api/print-image";
const PRINTER_QUEUE = process.env.PRINTER_QUEUE || "D520_raw";

// Label dimensions (2"×1" @300dpi → 600×300px)
const DPI    = 300;
const WIDTH  = 2 * DPI;   // 600
const HEIGHT = 1 * DPI;   // 300

// Ensure a directory exists
function ensureDirectoryExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Element definitions
const elementsConfig = [
  {
    name: "sidebar",
    type: "text",
    text: "DTH ITEM",
    font: "Helvetica-Bold",
    fontSize: 0.2,
    fontColor: "black",
    fillColor: "white",
    bounds: { width: 0.8, height: 1.0 },
    position: { x: 0.01, y: 1.0 },
    rotation: 270,
  },
  {
    name: "item_name",
    type: "text",
    table: "home_depot_items",
    lookupColumn: "material_id",
    returnColumn: "item_desc",
    truncate: 20,
    font: "Helvetica-Bold",
    fontSize: 0.15,
    fontColor: "black",
    bounds: { width: 0.55, height: 0.4 },
    position: { x: 0.12, y: 0.05 },
  },
  {
    name: "order_id",
    type: "text",
    table: "home_depot_order_history",
    lookupColumn: "order_id",
    returnColumn: "order_id",
    font: "Helvetica",
    fontSize: 0.10,
    fontColor: "black",
    bounds: { width: 0.55, height: 0.1 },
    position: { x: 0.12, y: 0.65 },
  },
  {
    name: "sku",
    type: "text",
    table: "home_depot_items",
    lookupColumn: "material_id",
    returnColumn: "internal_sku",
    fallbackColumn: "temp_internal_sku",
    generateFallback: true,
    font: "Helvetica",
    fontSize: 0.10,
    fontColor: "black",
    bounds: { width: 0.55, height: 0.1 },
    position: { x: 0.12, y: 0.77 },
  },
  {
    name: "location",
    type: "text",
    text: "Bay 1 | Shelf 4 | Bin 18",
    font: "Helvetica",
    fontSize: 0.075,
    fontColor: "black",
    bounds: { width: 0.55, height: 0.1 },
    position: { x: 0.12, y: 0.88 },
  },
  {
    name: "qr_code",
    type: "qr",
    sourceElement: "sku",
    bounds: { width: 0.4, height: 0.7 },
    position: { x: 0.6, y: 0.0 },
  },
  {
    name: "divider",
    type: "line",
    orientation: "vertical",
    position: { x: 0.55, y: 0.05 },
    length: 0.9,
    thickness: 2,
    color: "black",
    style: "solid",
  },
];

// Fetch element data from Supabase
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
  if (el.truncate && val?.length > el.truncate) {
    val = val.substring(0, el.truncate);
  }
  return val || el.text || "";
}

// Render all elements on a PDF page
async function renderElements(doc, config, ctx, dims) {
  for (const el of config) {
    const x = el.position.x * dims.width;
    const y = el.position.y * dims.height;
    const w = (el.bounds?.width  || 0) * dims.width;
    const h = (el.bounds?.height || 0) * dims.height;

    const content = await fetchElementData(el, ctx[el.lookupColumn]);
    ctx[el.name] = content;

    if (el.type === "text") {
      if (el.fillColor) doc.rect(x,y,w,h).fill(el.fillColor);
      doc.fillColor(el.fontColor || "black")
         .font(el.font)
         .fontSize(el.fontSize * dims.height)
         .save();
      if (el.rotation) doc.rotate(el.rotation, { origin:[x,y] });
      doc.text(content, x, y, { width:w, height:h }).restore();
      continue;
    }

    if (el.type === "qr") {
      const buf = await QRCode.toBuffer(content || "UNKNOWN");
      doc.image(buf, x, y, { width:w, height:h });
      continue;
    }

    if (el.type === "line") {
      doc.save();
      doc.lineWidth(el.thickness || 1)
         .strokeColor(el.color || "black")
         .undash();
      if (el.style === "dashed")     doc.dash(5);
      else if (el.style === "dotted") doc.dash(1,{space:3});
      else if (el.style === "dot-dash") doc.dash(5,{space:3,phase:2});
      if (el.orientation === "vertical")
        doc.moveTo(x,y).lineTo(x, y + el.length * dims.height);
      else
        doc.moveTo(x,y).lineTo(x + el.length * dims.width, y);
      doc.stroke().restore();
      continue;
    }
  }
}

// Generate the PDF (2"×1" @300dpi)
async function createPdf(order) {
  const filePath = `./pdf/${order.order_id}.pdf`;
  ensureDirectoryExists(filePath);

  const doc = new PDFDocument({ size:[WIDTH, HEIGHT], margin:0 });
  doc.pipe(fs.createWriteStream(filePath));

  for (let i=1; i<=order.order_qty_requested; i++) {
    if (i > 1) doc.addPage({ size:[WIDTH,HEIGHT], margin:0 });
    await renderElements(doc, elementsConfig, order, { width: WIDTH, height: HEIGHT });
  }

  doc.end();
  return filePath;
}

// Convert PDF → PNG buffers via pdfjs + canvas
async function pdfToPNGBuffers(pdfPath) {
  const raw = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjsLib.getDocument({ data: raw });
  const pdf = await loadingTask.promise;
  const buffers = [];

  for (let p=1; p<=pdf.numPages; p++) {
    const page    = await pdf.getPage(p);
    const vp      = page.getViewport({ scale: DPI/72 });
    const canvas  = createCanvas(vp.width, vp.height);
    const ctx     = canvas.getContext("2d");
    await page.render({ canvasContext:ctx, viewport:vp }).promise;
    buffers.push(canvas.toBuffer("image/png"));
  }

  return buffers;
}

// Send each page image to the printer bridge
async function sendToPrinter(pdfPath) {
  const pngBuffers = await pdfToPNGBuffers(pdfPath);
  for (const buf of pngBuffers) {
    await fetch(BRIDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageData: buf.toString("base64"),
        queue:     PRINTER_QUEUE,
        cut:       true
      })
    });
  }
}

// Main loop: poll, generate, update, print
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

      await sendToPrinter(pdfPath);
      console.log("Printed order", order.order_id);
    } catch (e) {
      console.error(`Error order ${order.order_id}:`, e);
    }
  }
}

setInterval(pollPendingOrders, 1000);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
