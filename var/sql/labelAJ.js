// labelService.js
const express      = require("express");
const { createClient } = require("@supabase/supabase-js");
const QRCode       = require("qrcode");
const fs           = require("fs");
const path         = require("path");
const PDFDocument  = require("pdfkit");
const PDFJS        = require("pdfjs-dist/legacy/build/pdf.js");
const { createCanvas } = require("canvas");
const fetch        = require("node-fetch");

require("dotenv").config();

const app = express();
const port = process.env.PORT || 50;

const supabaseUrl     = "http://137.184.148.164:8000";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase        = createClient(supabaseUrl, supabaseAnonKey);

// PDF.js worker
PDFJS.GlobalWorkerOptions.workerSrc = require("pdfjs-dist/legacy/build/pdf.worker.js");

// ensure output directories
const ensureDirectoryExists = (filePath) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

// -----------------------------------------------------------------------------
// your existing createPdf() and renderElements() – UNTOUCHED PDF generation
// -----------------------------------------------------------------------------

// … paste your full elementsConfig and fetchElementData / renderElements here …

// for brevity, assume elementsConfig, fetchElementData(el,lookup), renderElements(doc,…)
// and createPdf(order) are defined exactly as in your last working version.
// They produce 600×300px PDFs in ./pdf/{order_id}.pdf
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// NEW: rasterize with pdfjs + node-canvas
// -----------------------------------------------------------------------------
async function pdfToPngBuffers(pdfPath) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = PDFJS.getDocument({ data });
  const pdf = await loadingTask.promise;

  const buffers = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    // 1:1 pixel scale (600×300)
    const viewport = page.getViewport({ scale: 1 });
    const canvas   = createCanvas(viewport.width, viewport.height);
    const ctx      = canvas.getContext("2d");

    await page.render({ canvasContext: ctx, viewport }).promise;
    buffers.push(canvas.toBuffer("image/png"));
  }
  return buffers;
}

// -----------------------------------------------------------------------------
// NEW: send each PNG to your bridge server
// -----------------------------------------------------------------------------
async function sendToPrinter(pngBuffers) {
  const endpoint = "http://137.184.148.164:5090/api/print-image";
  for (const buf of pngBuffers) {
    const imageData = `data:image/png;base64,${buf.toString("base64")}`;
    await fetch(endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ imageData, cut: true, queue: "D520_raw" })
    });
  }
}

// -----------------------------------------------------------------------------
// orchestrator: poll Supabase, generate PDF, rasterize & print, update URL
// -----------------------------------------------------------------------------
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
      // 1) PDF → disk
      const pdfPath = await createPdf(order);

      // 2) Rasterize → PNG buffers
      const pngs = await pdfToPngBuffers(pdfPath);

      // 3) Send images to printer
      await sendToPrinter(pngs);

      // 4) Update record
      await supabase
        .from("home_depot_order_history")
        .update({ label_pdf_url: pdfPath })
        .eq("order_id", order.order_id);

      console.log(`✅ Printed & saved PDF for order ${order.order_id}`);
    } catch (e) {
      console.error(`❌ Error for order ${order.order_id}:`, e);
    }
  }
}

// start polling every second
setInterval(pollPendingOrders, 1000);

// express endpoint (optional; you don’t really need it for polling)
app.listen(port, () => console.log(`Label service listening on port ${port}`));
