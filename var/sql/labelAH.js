// label_server.js
const express      = require("express");
const { createClient } = require("@supabase/supabase-js");
const QRCode       = require("qrcode");
const fs           = require("fs");
const path         = require("path");
const PDFDocument  = require("pdfkit");
const { createCanvas } = require("canvas");
const pdfjsLib     = require("pdfjs-dist");
const fetch        = require("node-fetch");

require("dotenv").config();

const app       = express();
const port      = process.env.PORT || 50;
const BRIDGE_API = "http://137.184.148.164:5090/api/print-image";
const PRINT_QUEUE = "D520_raw"; // default printer queue

// Supabase setup
const supabaseUrl     = "http://137.184.148.164:8000";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase        = createClient(supabaseUrl, supabaseAnonKey);

// PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
  require("pdfjs-dist/build/pdf.worker.js");

// ensure output directory exists
const ensureDirectoryExists = (filePath) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

// your existing element-driven config... (unchanged)
const elementsConfig = [
  { name:"sidebar", type:"text", text:"DTH ITEM",
    font:"Helvetica-Bold", fontSize:0.2, fontColor:"black", fillColor:"white",
    bounds:{width:0.8,height:1.0}, position:{x:0.01,y:1.0}, rotation:270 },
  { name:"item_name", type:"text", table:"home_depot_items", lookupColumn:"material_id",
    returnColumn:"item_desc", truncate:20, font:"Helvetica-Bold", fontSize:0.15,
    fontColor:"black", bounds:{width:0.55,height:0.4}, position:{x:0.12,y:0.05} },
  { name:"order_id", type:"text", table:"home_depot_order_history", lookupColumn:"order_id",
    returnColumn:"order_id", font:"Helvetica", fontSize:0.10, fontColor:"black",
    bounds:{width:0.55,height:0.1}, position:{x:0.12,y:0.65} },
  { name:"sku", type:"text", table:"home_depot_items", lookupColumn:"material_id",
    returnColumn:"internal_sku", fallbackColumn:"temp_internal_sku", generateFallback:true,
    font:"Helvetica", fontSize:0.10, fontColor:"black",
    bounds:{width:0.55,height:0.1}, position:{x:0.12,y:0.77} },
  { name:"location", type:"text", text:"Bay 1 | Shelf 4 | Bin 18",
    font:"Helvetica", fontSize:0.075, fontColor:"black",
    bounds:{width:0.55,height:0.1}, position:{x:0.12,y:0.88} },
  { name:"qr_code", type:"qr", sourceElement:"sku",
    bounds:{width:0.4,height:0.7}, position:{x:0.6,y:0.0} },
  { name:"divider", type:"line", orientation:"vertical",
    position:{x:0.1,y:0.05}, length:0.9, thickness:5, color:"black", style:"solid" },
];

// fetch a single field (with fallback and truncate)
async function fetchElementData(el, lookupValue) {
  if (!el.table || !el.returnColumn) return el.text||"";
  let { data, error } = await supabase
    .from(el.table)
    .select(el.returnColumn)
    .eq(el.lookupColumn, lookupValue)
    .single();
  let val = data?.[el.returnColumn];
  if (!val && el.fallbackColumn) {
    let { data: fb } = await supabase
      .from(el.table)
      .select(el.fallbackColumn)
      .eq(el.lookupColumn, lookupValue)
      .single();
    val = fb?.[el.fallbackColumn];
  }
  if (!val && el.generateFallback) {
    val = `DTH${Math.floor(10000000 + Math.random()*90000000)}`;
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

// render all elements into PDFKit doc
async function renderElements(doc, config, ctx, dims) {
  for (let el of config) {
    const x = el.position.x * dims.width;
    const y = el.position.y * dims.height;
    const w = (el.bounds?.width||0)  * dims.width;
    const h = (el.bounds?.height||0) * dims.height;
    let content = await fetchElementData(el, ctx[el.lookupColumn]);
    ctx[el.name] = content;

    if (el.type==="box") {
      if (el.fillColor) doc.rect(x,y,w,h).fill(el.fillColor);
      if (el.outlineColor) {
        doc.lineWidth(el.outlineThickness||1)
           .strokeColor(el.outlineColor)
           .rect(x,y,w,h).stroke();
      }
      continue;
    }
    if (el.type==="text") {
      if (el.fillColor) doc.rect(x,y,w,h).fill(el.fillColor);
      doc.fillColor(el.fontColor||"black")
         .font(el.font)
         .fontSize(el.fontSize * dims.height)
         .save();
      if (el.rotation) doc.rotate(el.rotation,{origin:[x,y]});
      doc.text(content, x,y,{width:w,height:h}).restore();
      continue;
    }
    if (el.type==="qr") {
      let buf = await QRCode.toBuffer(content||"UNKNOWN");
      doc.image(buf,x,y,{width:w,height:h});
      continue;
    }
    if (el.type==="line") {
      doc.save()
         .lineWidth(el.thickness||1)
         .strokeColor(el.color||"black")
         .undash();
      if (el.style==="dashed") doc.dash(5);
      else if (el.style==="dotted") doc.dash(1,{space:3});
      else if (el.style==="dot-dash") doc.dash(5,{space:3,phase:2});
      if (el.orientation==="vertical") {
        doc.moveTo(x,y).lineTo(x,y + el.length * dims.height);
      } else {
        doc.moveTo(x,y).lineTo(x + el.length * dims.width, y);
      }
      doc.stroke().restore();
      continue;
    }
  }
}

// unchanged: create 2×1″ PDF at 300 DPI (600×300px)
async function createPdf(order) {
  const filePath = `./pdf/${order.order_id}.pdf`;
  ensureDirectoryExists(filePath);
  const doc = new PDFDocument({ size:[600,300], margin:0 });
  doc.pipe(fs.createWriteStream(filePath));
  for (let i=1; i<=order.order_qty_requested; i++) {
    if (i>1) doc.addPage({size:[600,300],margin:0});
    await renderElements(doc, elementsConfig, order, { width:600, height:300 });
  }
  doc.end();
  return filePath;
}

// rasterize via pdfjs-dist + node-canvas
async function rasterizePdfToPngs(pdfPath) {
  let loadingTask = pdfjsLib.getDocument(pdfPath);
  let pdf = await loadingTask.promise;
  let buffers = [];
  for (let i=1; i<=pdf.numPages; i++) {
    let page = await pdf.getPage(i);
    let vp = page.getViewport({ scale:300/72 });
    let canvas = createCanvas(vp.width, vp.height);
    let ctx = canvas.getContext("2d");
    await page.render({ canvasContext:ctx, viewport:vp }).promise;
    buffers.push(canvas.toBuffer("image/png"));
  }
  return buffers;
}

// POST each page PNG to your Pi bridge
async function sendToPrinter(pdfPath) {
  let pages = await rasterizePdfToPngs(pdfPath);
  for (let imgBuf of pages) {
    let payload = {
      imageData: "data:image/png;base64," + imgBuf.toString("base64"),
      queue: PRINT_QUEUE,
      cut: true
    };
    let res = await fetch(BRIDGE_API, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.error("Print failed:", await res.text());
    }
  }
}

// main poll loop
async function pollPendingOrders() {
  let { data: orders, error } = await supabase
    .from("home_depot_order_history")
    .select("order_id,order_qty_requested,material_id")
    .is("label_pdf_url", null);

  if (error) return console.error("Fetch Error:", error);
  for (let order of orders) {
    try {
      let pdfPath = await createPdf(order);
      await sendToPrinter(pdfPath);
      await supabase
        .from("home_depot_order_history")
        .update({ label_pdf_url: pdfPath })
        .eq("order_id", order.order_id);
      console.log(`Done order ${order.order_id}`);
    } catch (e) {
      console.error(`Error for order ${order.order_id}:`, e);
    }
  }
}

// kick it off
setInterval(pollPendingOrders, 1000);
app.listen(port, () => console.log(`Server running on port ${port}`));
