// labelPrinter.js
// ───────────────────────────────────────────────
// 1) npm install express @supabase/supabase-js qrcode pdfkit pdf-to-img node-fetch@2 dotenv
// 2) node labelPrinter.js
// ───────────────────────────────────────────────

require("dotenv").config();

const express     = require("express");
const { createClient } = require("@supabase/supabase-js");
const QRCode      = require("qrcode");
const fs          = require("fs");
const path        = require("path");
const PDFDocument = require("pdfkit");
const fetch       = require("node-fetch"); // v2 API

const app  = express();
const port = process.env.PORT || 50;

// Supabase client
const supabaseUrl    = "http://137.184.148.164:8000";
const supabaseAnonKey= process.env.SUPABASE_ANON_KEY;
const supabase       = createClient(supabaseUrl, supabaseAnonKey);

// Print bridge endpoint
const PRINT_BRIDGE = "http://137.184.148.164:5090/api/print-image";

// Ensure directory exists
function ensureDirectoryExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ——— Your data-driven element definitions ———
const elementsConfig = [
  {
    name: "sidebar",
    type: "text",
    text: "DTH ITEM",
    font: "Helvetica-Bold",
    fontSize: 0.32,      // relative to label height
    fontColor: "black",
    fillColor: "white",
    bounds: { width: 0.1, height: 1.0 },
    position: { x: 0.0, y: 0.0 },
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
    fontSize: 0.10,
    fontColor: "black",
    bounds: { width: 0.55, height: 0.3 },
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
    position: { x: 0.1, y: 0.05 },
    length: 0.9,
    thickness: 5,
    color: "black",
    style: "solid",
  },
];

// ——— Fetch data for an element if it’s table-driven ———
async function fetchElementData(el, lookupValue) {
  if (!el.table || !el.returnColumn) return el.text || "";
  const { data, error } = await supabase
    .from(el.table)
    .select(el.returnColumn)
    .eq(el.lookupColumn, lookupValue)
    .single();
  let val = data?.[el.returnColumn] || "";
  // fallback logic
  if (!val && el.fallbackColumn) {
    const { data: fb } = await supabase
      .from(el.table)
      .select(el.fallbackColumn)
      .eq(el.lookupColumn, lookupValue)
      .single();
    val = fb?.[el.fallbackColumn] || "";
  }
  if (!val && el.generateFallback) {
    val = `DTH${Math.floor(10000000 + Math.random() * 90000000)}`;
    await supabase
      .from(el.table)
      .update({ [el.fallbackColumn]: val })
      .eq(el.lookupColumn, lookupValue);
  }
  if (el.truncate && val.length > el.truncate) {
    val = val.substring(0, el.truncate);
  }
  return val || el.text || "";
}

// ——— Render all elements onto a single PDF page ———
async function renderElements(doc, config, ctxObj, dims) {
  for (const el of config) {
    const x = el.position.x * dims.width;
    const y = el.position.y * dims.height;
    const w = (el.bounds?.width || 0) * dims.width;
    const h = (el.bounds?.height || 0) * dims.height;
    const content = await fetchElementData(el, ctxObj[el.lookupColumn]);
    ctxObj[el.name] = content;

    switch (el.type) {
      case "box":
        if (el.fillColor) doc.rect(x, y, w, h).fill(el.fillColor);
        if (el.outlineColor) {
          doc.lineWidth(el.outlineThickness||1)
             .strokeColor(el.outlineColor)
             .rect(x, y, w, h)
             .stroke();
        }
        break;

      case "text":
        if (el.fillColor) doc.rect(x, y, w, h).fill(el.fillColor);
        doc.fillColor(el.fontColor||"black")
           .font(el.font)
           .fontSize(el.fontSize * dims.height)
           .save();
        if (el.rotation) doc.rotate(el.rotation, { origin:[x,y] });
        doc.text(content, x, y, { width:w, height:h }).restore();
        break;

      case "qr":
        const buf = await QRCode.toBuffer(content || "UNKNOWN");
        doc.image(buf, x, y, { width:w, height:h });
        break;

      case "line":
        doc.save();
        doc.lineWidth(el.thickness||1)
           .strokeColor(el.color||"black")
           .undash();
        if      (el.style==="dashed")  doc.dash(5);
        else if (el.style==="dotted")  doc.dash(1, { space:3 });
        else if (el.style==="dot-dash") doc.dash(5, { space:3, phase:2 });
        if (el.orientation==="vertical") {
          doc.moveTo(x, y).lineTo(x, y + el.length * dims.height);
        } else {
          doc.moveTo(x, y).lineTo(x + el.length * dims.width, y);
        }
        doc.stroke().restore();
        break;
    }
  }
}

// ——— Create PDF and save to disk ———
async function createPdf(order) {
  const outPath = `./pdf/${order.order_id}.pdf`;
  ensureDirectoryExists(outPath);

  const doc = new PDFDocument({ size:[600,300], margin:0 });
  doc.pipe(fs.createWriteStream(outPath));

  for (let i = 1; i <= order.order_qty_requested; i++) {
    if (i > 1) doc.addPage({ size:[600,300], margin:0 });
    await renderElements(doc, elementsConfig, order, { width:600, height:300 });
  }

  doc.end();
  // wait for file to finish writing
  await new Promise(r => doc.on("finish", r));
  return outPath;
}

// ——— Convert PDF → PNG buffers & send to printer ———
async function printPdf(filePath) {
  // dynamic import pdf-to-img (ESM-only)
  const { pdf } = await import("pdf-to-img");
  // convert all pages at 2× scale (600 → 1200px wide)
  const images = await pdf(filePath, { scale: 2 });

  for (const imgBuf of images) {
    // PNG buffer → Data URL
    const dataUrl = "data:image/png;base64," + imgBuf.toString("base64");
    // POST to bridge once
    const res = await fetch(PRINT_BRIDGE, {
      method:  "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ imageData: dataUrl, cut: true })
    });
    if (!res.ok) {
      throw new Error(`Print bridge returned ${res.status}`);
    }
  }
}

// ——— Main polling loop: new orders only ———
async function pollPendingOrders() {
  const { data: orders, error } = await supabase
    .from("home_depot_order_history")
    .select("order_id,order_qty_requested,material_id")
    .is("label_pdf_url", null);

  if (error) {
    console.error("❌ Supabase fetch error:", error);
    return;
  }

  for (const order of orders) {
    try {
      console.log(`🖨 Processing order ${order.order_id}…`);

      // 1) Generate label PDF
      const pdfPath = await createPdf(order);

      // 2) Send all pages of that PDF to the printer
      await printPdf(pdfPath);

      // 3) Mark it done so we don’t re-print
      await supabase
        .from("home_depot_order_history")
        .update({ label_pdf_url: pdfPath })
        .eq("order_id", order.order_id);

      console.log(`✅ Order ${order.order_id} printed & saved at ${pdfPath}`);
    } catch (err) {
      console.error(`❌ Error order ${order.order_id}:`, err);
    }
  }
}

// Kick off the loop every 5 seconds
setInterval(pollPendingOrders, 5000);

// (Optional) you can expose a health endpoint
app.get("/health", (_,res)=>res.send("OK"));
app.listen(port, ()=>console.log(`Bridge server listening on port ${port}`));
