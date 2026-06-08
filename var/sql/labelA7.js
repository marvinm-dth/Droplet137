// labelA5.js
require("dotenv").config();

const express        = require("express");
const { createClient } = require("@supabase/supabase-js");
const QRCode         = require("qrcode");
const fs             = require("fs");
const path           = require("path");
const PDFDocument    = require("pdfkit");
const fetch          = require("node-fetch");
const { execSync }   = require("child_process");

const app  = express();
const port = process.env.PORT || 50;

// Supabase client
const supabaseUrl     = "http://137.184.148.164:8000";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase        = createClient(supabaseUrl, supabaseAnonKey);

// Bridge settings
const BRIDGE_URL    = "http://137.184.148.164:5090/api/print-image";
const PRINTER_QUEUE = process.env.PRINTER_QUEUE || "D520_raw";

// Ensure output directory exists
function ensureDirectoryExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Verify poppler's pdftoppm is available
function ensurePopplerInstalled() {
  try {
    execSync("which pdftoppm");
  } catch {
    throw new Error(
      "pdftoppm not found. Please install poppler-utils (e.g. `apt-get install poppler-utils`)."
    );
  }
}

// Your element definitions (include your divider, etc.)
const elementsConfig = [
  /* … your sidebar, item_name, order_id, sku, location, qr_code … */,
  {
    name: "divider",
    type: "line",
    orientation: "vertical",
    position: { x: 0.55, y: 0.05 },
    length: 0.9,
    thickness: 2,
    color: "black",
    style: "solid"
  },
];

// Fetch dynamic text
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
    val = `DTH${Math.floor(1e7 + Math.random() * 9e7)}`;
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

// Render elements into PDFKit document
async function renderElements(doc, config, ctx, dims) {
  for (const el of config) {
    if (!el.position || typeof el.position.x !== "number") continue;
    const x = el.position.x * dims.width;
    const y = el.position.y * dims.height;
    const w = (el.bounds?.width  || 0) * dims.width;
    const h = (el.bounds?.height || 0) * dims.height;
    const content = await fetchElementData(el, ctx[el.lookupColumn]);
    ctx[el.name] = content;

    switch (el.type) {
      case "box":
        if (el.fillColor) doc.rect(x, y, w, h).fill(el.fillColor);
        if (el.outlineColor) {
          doc.lineWidth(el.outlineThickness || 1)
             .strokeColor(el.outlineColor)
             .rect(x, y, w, h)
             .stroke();
        }
        break;
      case "text":
        if (el.fillColor) doc.rect(x, y, w, h).fill(el.fillColor);
        doc.fillColor(el.fontColor || "black")
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
        doc.lineWidth(el.thickness || 1)
           .strokeColor(el.color || "black")
           .undash();
        if (el.style === "dashed") doc.dash(5);
        else if (el.style === "dotted") doc.dash(1, { space: 3 });
        else if (el.style === "dot-dash") doc.dash(5, { space: 3, phase: 2 });
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

// Create a 2×1″ PDF (600×300 px)
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

// Convert PDF → PNG pages via pdftoppm → send each to printer
async function sendToPrinter(pdfPath) {
  ensurePopplerInstalled();

  // Use pdftoppm to rasterize all pages at 300 DPI:
  // outputs: pdfPath-1.png, pdfPath-2.png, ...
  execSync(
    `pdftoppm -r 300 -png "${pdfPath}" "${pdfPath.replace(/\.pdf$/, "")}"`
  );

  // Find and send each PNG
  const base = pdfPath.replace(/\.pdf$/, "");
  const dir = path.dirname(pdfPath);
  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith(path.basename(base)) && f.endsWith(".png"));

  for (const fname of files) {
    const imgBuf = fs.readFileSync(path.join(dir, fname));
    const imageData = imgBuf.toString("base64");

    await fetch(BRIDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageData,
        queue: PRINTER_QUEUE,
        cut: true
      }),
    });

    // cleanup
    fs.unlinkSync(path.join(dir, fname));
  }
}

// Main loop: poll Supabase, generate PDF, update & print images
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

      // send each page as an image
      await sendToPrinter(pdfPath);

      console.log("Printed order", order.order_id);
    } catch (e) {
      console.error(`Error order ${order.order_id}:`, e);
    }
  }
}

// every second
setInterval(pollPendingOrders, 1000);

app.listen(port, () =>
  console.log(`Label printer client listening on port ${port}`)
);
