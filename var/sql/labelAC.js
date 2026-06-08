// labelA11.js
require("dotenv").config();

const express       = require("express");
const { createClient } = require("@supabase/supabase-js");
const QRCode        = require("qrcode");
const fs            = require("fs");
const path          = require("path");
const PDFDocument   = require("pdfkit");
const fetch         = require("node-fetch");
const { execSync }  = require("child_process");

const app  = express();
const port = process.env.PORT || 50;

// Supabase client
const supabase = createClient(
  "http://137.184.148.164:8000",
  process.env.SUPABASE_ANON_KEY
);

// Print bridge
const BRIDGE_URL    = "http://137.184.148.164:5090/api/print-image";
const PRINTER_QUEUE = process.env.PRINTER_QUEUE || "D520_raw";

// Ensure directory exists
function ensureDirectoryExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Try pdftoppm, else fallback to Ghostscript
function pdfToPNGs(pdfPath, base) {
  try {
    // first attempt
    execSync(`pdftoppm -r 300 -png "${pdfPath}" "${base}"`);
  } catch (e) {
    // fallback
    console.warn("pdftoppm failed, falling back to Ghostscript");
    execSync(
      `gs -q -dNOPAUSE -dBATCH -sDEVICE=png16m -r300 -sOutputFile="${base}-%d.png" "${pdfPath}"`
    );
  }
}

// Element definitions
const elementsConfig = [
  // … your existing elements …
  {
    name: "divider",
    type: "line",
    orientation: "vertical",
    position: { x: 0.55, y: 0.05 },
    length: 0.9,
    thickness: 2,
    color: "#000",
    style: "solid",
  },
];

// (fetchElementData, renderElements, createPdf are identical to your working code)

// ---------------- replace sendToPrinter ----------------
async function sendToPrinter(pdfPath) {
  const base = pdfPath.replace(/\.pdf$/, "");
  ensureDirectoryExists(base);

  // rasterize to PNGs
  pdfToPNGs(pdfPath, base);

  // collect generated PNGs
  const dir   = path.dirname(pdfPath);
  const files = fs
    .readdirSync(dir)
    .filter(f =>
      f.startsWith(path.basename(base)) && f.endsWith(".png")
    );

  for (const fname of files) {
    const buf       = fs.readFileSync(path.join(dir, fname));
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

    // cleanup
    fs.unlinkSync(path.join(dir, fname));
  }
}

// ----------------- polling -----------------
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
      const pdfPath = await createPdf(order);        // your PDF gen
      await supabase
        .from("home_depot_order_history")
        .update({ label_pdf_url: pdfPath })
        .eq("order_id", order.order_id);

      await sendToPrinter(pdfPath);                  // <-- PRINT STEP

      console.log("Printed order", order.order_id);
    } catch (e) {
      console.error(`Error order ${order.order_id}:`, e);
    }
  }
}

setInterval(pollPendingOrders, 1000);

app.listen(port, () =>
  console.log(`Server listening on port ${port}`)
);
