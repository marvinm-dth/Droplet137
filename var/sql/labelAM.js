// labelPrinter.js
require("dotenv").config();

const express   = require("express");
const { createClient } = require("@supabase/supabase-js");
const QRCode    = require("qrcode");
const fs        = require("fs");
const path      = require("path");
const PDFDocument = require("pdfkit");
const fetch     = require("node-fetch"); // or use global fetch in Node18+

const app  = express();
const port = process.env.PORT || 50;

const supabaseUrl     = "http://137.184.148.164:8000";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase        = createClient(supabaseUrl, supabaseAnonKey);

// Where to send print jobs:
const BRIDGE_URL = process.env.BRIDGE_URL || "http://137.184.148.164:5090";

// Ensure directory exists for PDFs
function ensureDirectoryExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

//------------------------------------------------------------------------------
// 1. Your data-driven element definitions
//------------------------------------------------------------------------------

const elementsConfig = [
  {
    name: "sidebar",
    type: "text",
    text: "DTH ITEM",
    font: "Helvetica-Bold",
    fontSize: 0.32,        // relative to 1.0h = .32h => 0.32
    fontColor: "black",
    fillColor: "white",
    bounds:   { width: 0.10, height: 1.0 },
    position: { x: 0.00, y: 0.0 },
    rotation: 270,
  },
  {
    name: "tag",
    type: "text",
    text: "DTH ITEM",
    font: "Helvetica-Bold",
    fontSize: 0.32,
    fontColor: "black",
    bounds:   { width: 0.50, height: 1.0 },
    position: { x: 0.025, y: 0.9 },
    rotation: 270,
  },
  {
    name: "item_name",
    type: "text",
    table: "home_depot_items",
    lookupColumn: "material_id",
    returnColumn: "item_name",
    truncate: 20,
    font: "Helvetica-Bold",
    fontSize: 0.10,
    fontColor: "black",
    bounds:   { width: 0.50, height: 0.30 },
    position: { x: 0.12, y: 0.10 },
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
    bounds:   { width: 0.50, height: 0.10 },
    position: { x: 0.12, y: 0.70 },
  },
  {
    name: "internal_sku",
    type: "text",
    table: "home_depot_items",
    lookupColumn: "material_id",
    returnColumn: "internal_sku",
    font: "Helvetica",
    fontSize: 0.10,
    fontColor: "black",
    bounds:   { width: 0.50, height: 0.10 },
    position: { x: 0.12, y: 0.82 },
  },
  {
    name: "divider",
    type: "line",
    orientation: "vertical",  // vertical line
    position:    { x: 0.65, y: 0.05 },
    length:      0.90,        // 90% of label height
    thickness:   1,
    color:       "gray",
    style:       "dashed",
    dashLength:  5,
  },
  {
    name: "highlight_box",
    type: "box",
    position: { x: 0.12, y: 0.70 },
    bounds:   { width: 0.50, height: 0.22 },
    outlineColor:   "red",
    outlineThickness: 1,
    fillColor:      null,
    rotation:       0,
  },
  {
    name: "qr_code",
    type: "qr",
    sourceElement: "internal_sku",
    bounds:    { width: 0.50, height: 0.65 },
    position:  { x: 0.52, y: 0.00 },
  },
];

//------------------------------------------------------------------------------
// 2. Fetch lookups from Supabase
//------------------------------------------------------------------------------

async function fetchElementData(el, lookupValue) {
  // Static text
  if (!el.table || !el.returnColumn) {
    return el.text || "";
  }
  // Query DB
  const { data, error } = await supabase
    .from(el.table)
    .select(el.returnColumn)
    .eq(el.lookupColumn, lookupValue)
    .single();
  let val = data?.[el.returnColumn];
  if (error || !val) {
    // fallbackColumn or static text
    if (el.fallbackColumn) {
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
  }
  // truncate
  if (el.truncate && val.length > el.truncate) {
    val = val.substring(0, el.truncate);
  }
  return val || el.text || "";
}

//------------------------------------------------------------------------------
// 3. Render PDF
//------------------------------------------------------------------------------

async function renderElements(doc, config, ctxObj, dims) {
  for (const el of config) {
    const x = el.position.x * dims.width;
    const y = el.position.y * dims.height;
    const w = (el.bounds?.width  || 0) * dims.width;
    const h = (el.bounds?.height || 0) * dims.height;

    // fetch dynamic content
    const content = await fetchElementData(el, ctxObj[el.lookupColumn]);
    ctxObj[el.name] = content;

    switch(el.type) {
      case "box":
        if (el.fillColor) {
          doc.rect(x, y, w, h).fill(el.fillColor);
        }
        if (el.outlineColor) {
          doc
            .lineWidth(el.outlineThickness||1)
            .strokeColor(el.outlineColor)
            .rect(x,y,w,h)
            .stroke();
        }
        break;

      case "text":
        if (el.fillColor) {
          doc.rect(x, y, w, h).fill(el.fillColor);
        }
        doc
          .fillColor(el.fontColor||"black")
          .font(el.font)
          .fontSize(el.fontSize * dims.height)
          .save();
        if (el.rotation) {
          doc.rotate(el.rotation, { origin: [x,y] });
        }
        doc.text(content, x, y, { width: w, height: h }).restore();
        break;

      case "qr":
        const buf = await QRCode.toBuffer(content||"UNKNOWN");
        doc.image(buf, x, y, { width: w, height: h });
        break;

      case "line":
        doc.save();
        doc
          .lineWidth(el.thickness||1)
          .strokeColor(el.color||"black")
          .undash();
        if (el.style === "dashed") doc.dash(el.dashLength || 5);
        else if (el.style === "dotted") doc.dash(1,{space:3});
        else if (el.style === "dot-dash") doc.dash(5,{space:3,phase:2});
        if (el.orientation === "vertical") {
          doc.moveTo(x,y).lineTo(x, y + el.length * dims.height);
        } else {
          doc.moveTo(x,y).lineTo(x + el.length * dims.width, y);
        }
        doc.stroke().restore();
        break;
    }
  }
}

async function createPdf(order) {
  const outPath = `./pdf/${order.order_id}.pdf`;
  ensureDirectoryExists(outPath);
  const doc = new PDFDocument({ size: [600, 300], margin: 0 });
  doc.pipe(fs.createWriteStream(outPath));

  for (let i = 1; i <= order.order_qty_requested; i++) {
    if (i > 1) doc.addPage({ size: [600, 300], margin: 0 });
    await renderElements(doc, elementsConfig, order, { width: 600, height: 300 });
  }

  doc.end();
  return outPath;
}

//------------------------------------------------------------------------------
// 4. Convert PDF→PNG buffers using ESM pdf-to-img
//------------------------------------------------------------------------------

async function convertPdfToImages(pdfPath) {
  // ESM import
  const { pdf } = await import("pdf-to-img");
  // scale=1 yields 600×300 at same size
  const document = await pdf(pdfPath, { scale: 1 });
  const images = [];
  for await (const imgBuf of document) {
    images.push(imgBuf);
  }
  return images;
}

//------------------------------------------------------------------------------
// 5. Send each image to the Pi bridge
//------------------------------------------------------------------------------

async function sendToPrinter(imageBuffers) {
  let successes = 0, failures = 0;
  for (const buf of imageBuffers) {
    try {
      const body = JSON.stringify({
        imageData: buf.toString("base64"),
        queue:     "D520_raw",
        cut:       true
      });
      const res = await fetch(`${BRIDGE_URL}/api/print-image`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body
      });
      if (res.ok) successes++;
      else failures++;
    } catch {
      failures++;
    }
  }
  return { successes, failures };
}

//------------------------------------------------------------------------------
// 6. Poll for NEW orders, generate, convert & print once
//------------------------------------------------------------------------------

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
      console.log(`▶ Processing order ${order.order_id}`);
      // 1) create PDF
      const pdfPath = await createPdf(order);

      // 2) convert to images
      const images = await convertPdfToImages(pdfPath);

      // 3) print all pages
      const { successes, failures } = await sendToPrinter(images);
      console.log(`   → Printed ${successes}/${images.length}, failed ${failures}`);

      // 4) mark done in Supabase
      await supabase
        .from("home_depot_order_history")
        .update({ label_pdf_url: pdfPath })
        .eq("order_id", order.order_id);

    } catch (err) {
      console.error(`Error processing order ${order.order_id}:`, err);
    }
  }
}

//------------------------------------------------------------------------------
// 7. Start polling every 5s & HTTP server (unused here, but kept)
//------------------------------------------------------------------------------

setInterval(pollPendingOrders, 5000);
app.listen(port, () => console.log(`Label printer service running on port ${port}`));
