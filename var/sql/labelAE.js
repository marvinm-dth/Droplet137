// labelAC_final.js
require("dotenv").config();

const express       = require("express");
const { createClient } = require("@supabase/supabase-js");
const QRCode        = require("qrcode");
const fs            = require("fs");
const path          = require("path");
const PDFDocument   = require("pdfkit");
const fetch         = require("node-fetch");
const { createCanvas, registerFont } = require("canvas");
const pdfjsLib      = require("pdfjs-dist/es5/build/pdf.js");

// If needed, register your TTFs here:
// registerFont("/usr/share/fonts/truetype/arial/arial.ttf", { family: "Helvetica" });
// registerFont("/usr/share/fonts/truetype/arial/arialbd.ttf", { family: "Helvetica-Bold" });

const app  = express();
const port = process.env.PORT || 50;

// Supabase client
const supabase = createClient(
  "http://137.184.148.164:8000",
  process.env.SUPABASE_ANON_KEY
);

// Printer bridge
const BRIDGE_URL    = "http://137.184.148.164:5090/api/print-image";
const PRINTER_QUEUE = process.env.PRINTER_QUEUE || "D520_raw";

// Canvas size = 2"x1" @300dpi
const DPI    = 300;
const WIDTH  = 2 * DPI;   // 600px
const HEIGHT = 1 * DPI;   // 300px

// Ensure directory exists helper
function ensureDirectoryExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Your unchanged element config & helpers (fetchElementData, renderElements, createPdf)
const elementsConfig = [
  /* … your same elementsConfig array as before … */
];

// fetchElementData() { … }   // identical to your version
// renderElements(doc, elementsConfig, order, {width:600,height:300}) { … }
// createPdf(order) { … }    // exactly your PDF generation

// NEW: Render PDF pages to PNG buffers via pdfjs + node-canvas
async function pdfToPNGBuffers(pdfPath) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  const buffers = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: DPI / 72 });
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx    = canvas.getContext("2d");

    await page.render({ canvasContext: ctx, viewport }).promise;
    buffers.push(canvas.toBuffer("image/png"));
  }

  return buffers;
}

// Send all pages to printer bridge
async function sendToPrinter(pdfPath) {
  const pngBuffers = await pdfToPNGBuffers(pdfPath);

  for (const buf of pngBuffers) {
    const imageData = buf.toString("base64");
    await fetch(BRIDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageData,
        queue: PRINTER_QUEUE,
        cut: true
      })
    });
  }
}

// Poll → generate → update → print
async function pollPendingOrders() {
  const { data: orders, error } = await supabase
    .from("home_depot_order_history")
    .select("order_id,order_qty_requested,material_id")
    .is("label_pdf_url", null);

  if (error) {
    console.error("Fetch Error:", error);
    return;
  }

  for (const order of orders) {
    try {
      // 1) generate PDF (your code)
      const pdfPath = await createPdf(order);

      // 2) mark it
      await supabase
        .from("home_depot_order_history")
        .update({ label_pdf_url: pdfPath })
        .eq("order_id", order.order_id);

      // 3) print pages
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
