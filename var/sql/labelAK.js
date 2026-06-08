// server.js
const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const fetch = require("node-fetch");      // v2.x
require("dotenv").config();

const app = express();
const port = process.env.PORT || 50;
const BRIDGE_URL = "http://137.184.148.164:5090"; // your Pi‐bridge

// Supabase client
const supabaseUrl = "http://137.184.148.164:8000";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Ensure directory exists
function ensureDirectoryExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// === Your data-driven elements configuration ===
const elementsConfig = [
  {
    name:    "sidebar",
    type:    "text",
    text:    "DTH ITEM",
    font:    "Helvetica-Bold",
    fontSize:0.2,
    fontColor:"black",
    fillColor:"white",
    bounds:  { width: 0.8, height: 1.0 },
    position:{ x: 0.01, y: 1.0 },
    rotation:270,
  },
  {
    name:         "item_name",
    type:         "text",
    table:        "home_depot_items",
    lookupColumn: "material_id",
    returnColumn: "item_desc",
    truncate:     20,
    font:         "Helvetica-Bold",
    fontSize:     0.15,
    fontColor:    "black",
    bounds:       { width: 0.55, height: 0.4 },
    position:     { x: 0.12, y: 0.05 },
  },
  {
    name:         "order_id",
    type:         "text",
    table:        "home_depot_order_history",
    lookupColumn: "order_id",
    returnColumn: "order_id",
    font:         "Helvetica",
    fontSize:     0.10,
    fontColor:    "black",
    bounds:       { width: 0.55, height: 0.1 },
    position:     { x: 0.12, y: 0.65 },
  },
  {
    name:            "sku",
    type:            "text",
    table:           "home_depot_items",
    lookupColumn:    "material_id",
    returnColumn:    "internal_sku",
    fallbackColumn:  "temp_internal_sku",
    generateFallback:true,
    font:            "Helvetica",
    fontSize:        0.10,
    fontColor:       "black",
    bounds:          { width: 0.55, height: 0.1 },
    position:        { x: 0.12, y: 0.77 },
  },
  {
    name:     "location",
    type:     "text",
    text:     "Bay 1 | Shelf 4 | Bin 18",
    font:     "Helvetica",
    fontSize: 0.075,
    fontColor:"black",
    bounds:   { width: 0.55, height: 0.1 },
    position: { x: 0.12, y: 0.88 },
  },
  {
    name:          "qr_code",
    type:          "qr",
    sourceElement: "sku",
    bounds:        { width: 0.4, height: 0.7 },
    position:      { x: 0.6, y: 0.0 },
  },
  {
    name:        "divider",
    type:        "line",
    orientation: "vertical",
    position:    { x: 0.1,  y: 0.05 },
    length:      0.9,
    thickness:   5,
    color:       "black",
    style:       "solid",
  },
];

// Fetch text data from Supabase per element
async function fetchElementData(el, lookupValue) {
  if (!el.table || !el.returnColumn) {
    return el.text || "";
  }
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
    val = `DTH${Math.floor(10000000 + Math.random() * 90000000)}`;
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

// Render all elements onto the PDF doc
async function renderElements(doc, config, ctxObj, dims) {
  for (const el of config) {
    const x = el.position.x * dims.width;
    const y = el.position.y * dims.height;
    const w = (el.bounds?.width  || 0) * dims.width;
    const h = (el.bounds?.height || 0) * dims.height;
    const content = await fetchElementData(el, ctxObj[el.lookupColumn]);
    ctxObj[el.name] = content;

    switch (el.type) {
      case "box":
        if (el.fillColor) doc.rect(x, y, w, h).fill(el.fillColor);
        if (el.outlineColor) {
          doc
            .lineWidth(el.outlineThickness || 1)
            .strokeColor(el.outlineColor)
            .rect(x, y, w, h)
            .stroke();
        }
        break;

      case "text":
        if (el.fillColor) doc.rect(x, y, w, h).fill(el.fillColor);
        doc
          .fillColor(el.fontColor || "black")
          .font(el.font)
          .fontSize(el.fontSize * dims.height)
          .save();
        if (el.rotation) doc.rotate(el.rotation, { origin: [x, y] });
        doc.text(content, x, y, { width: w, height: h }).restore();
        break;

      case "qr":
        const buf = await QRCode.toBuffer(content || "UNKNOWN");
        doc.image(buf, x, y, { width: w, height: h });
        break;

      case "line":
        doc.save();
        doc
          .lineWidth(el.thickness || 1)
          .strokeColor(el.color || "black")
          .undash(); // clear any dash
        if (el.style === "dashed")   doc.dash(5);
        if (el.style === "dotted")   doc.dash(1, { space: 3 });
        if (el.style === "dot-dash") doc.dash(5, { space: 3, phase: 2 });
        if (el.orientation === "vertical") {
          doc.moveTo(x, y).lineTo(x, y + el.length * dims.height);
        } else {
          doc.moveTo(x, y).lineTo(x + el.length * dims.width, y);
        }
        doc.stroke().restore();
        break;
    }
  }
}

// Generate the PDF file
async function createPdf(order) {
  const filePath = `./pdf/${order.order_id}.pdf`;
  ensureDirectoryExists(filePath);
  const doc = new PDFDocument({ size: [600, 300], margin: 0 });
  doc.pipe(fs.createWriteStream(filePath));

  for (let i = 1; i <= order.order_qty_requested; i++) {
    if (i > 1) doc.addPage({ size: [600, 300], margin: 0 });
    await renderElements(doc, elementsConfig, order, { width: 600, height: 300 });
  }

  doc.end();
  return filePath;
}

// Convert PDF pages → PNG buffers and POST to bridge
async function sendToPrinter(pdfPath) {
  // dynamic ESM import of pdf-to-img
  const { pdf } = await import("pdf-to-img");
  // document is an async iterable of Buffers
  const document = await pdf(pdfPath, { scale: 4.166 }); // ~300 DPI for 72 point→inch
  for await (const pageBuf of document) {
    const dataUrl = "data:image/png;base64," + pageBuf.toString("base64");
    await fetch(`${BRIDGE_URL}/api/print-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageData: dataUrl,
        queue:      "D520_raw",
        cut:        true,
      }),
    });
  }
}

// Poll Supabase, create label, print, update record
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
      // 1) Generate PDF
      const pdfPath = await createPdf(order);
      // 2) Print it (PNG pages)
      await sendToPrinter(pdfPath);
      // 3) Update Supabase with PDF URL
      await supabase
        .from("home_depot_order_history")
        .update({ label_pdf_url: pdfPath })
        .eq("order_id", order.order_id);
      console.log(`✔ Printed & updated order ${order.order_id}`);
    } catch (e) {
      console.error(`‼ Error processing order ${order.order_id}:`, e);
    }
  }
}

// Run every second
setInterval(pollPendingOrders, 1000);

app.listen(port, () => {
  console.log(`Label printer service running on port ${port}`);
});
