// labelPrinter.js
// ─────────────────────────────────────────────────────────────────────────────
// npm i express @supabase/supabase-js qrcode pdfkit dotenv canvas
// ─────────────────────────────────────────────────────────────────────────────

const express            = require("express");
const { createClient }   = require("@supabase/supabase-js");
const QRCode             = require("qrcode");
const PDFDocument        = require("pdfkit");
const fs                 = require("fs");
const path               = require("path");
const { createCanvas, loadImage } = require("canvas");

require("dotenv").config();
const app  = express();
const port = process.env.PORT || 50;

// ── LABEL DIMENSIONS ─────────────────────────────────────────────────────────
// 2 × 1 in at 203 DPI  →  406 × 203 px
// PDF points          →  2 in × 72 pt = 144 pt  | 1 in × 72 pt = 72 pt
const DPI            = 203;
const PX_W           = 2 * DPI;      // 406 px
const PX_H           = 1 * DPI;      // 203 px
const PT_W           = 2 * 72;       // 144 pt
const PT_H           = 1 * 72;       //  72 pt

// ── Supabase ────────────────────────────────────────────────────────────────
const supabaseUrl     = "http://137.184.148.164:8000";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase        = createClient(supabaseUrl, supabaseAnonKey);

// ── Helpers ─────────────────────────────────────────────────────────────────
function ensureDirectoryExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Element definitions (unchanged) ─────────────────────────────────────────
const elementsConfig = [ /* …your element objects exactly as in the original… */ ];

// ── Data fetch (unchanged) ──────────────────────────────────────────────────
async function fetchElementData(el, lookupValue) { /* …same as before… */ }

// ── Canvas drawing engine ───────────────────────────────────────────────────
async function drawElementsToCanvas(ctx, cfg, ctxObj) {
  for (const el of cfg) {
    const x = el.position.x * PX_W;
    const y = el.position.y * PX_H;
    const w = (el.bounds?.width  || 0) * PX_W;
    const h = (el.bounds?.height || 0) * PX_H;

    const content = await fetchElementData(el, ctxObj[el.lookupColumn]);
    ctxObj[el.name] = content;

    switch (el.type) {
      case "box":
        if (el.fillColor) {
          ctx.fillStyle = el.fillColor;
          ctx.fillRect(x, y, w, h);
        }
        if (el.outlineColor) {
          ctx.strokeStyle = el.outlineColor;
          ctx.lineWidth   = el.outlineThickness || 1;
          ctx.strokeRect(x, y, w, h);
        }
        break;

      case "text": {
        if (el.fillColor) {
          ctx.fillStyle = el.fillColor;
          ctx.fillRect(x, y, w, h);
        }
        ctx.save();
        ctx.fillStyle = el.fontColor || "black";
        ctx.font = `${el.fontSize * PX_H}px ${el.font || "Helvetica"}`;
        if (el.rotation) {
          ctx.translate(x, y);
          ctx.rotate((el.rotation * Math.PI) / 180);
          ctx.fillText(content, 0, 0, w);
        } else {
          ctx.fillText(content, x, y, w);
        }
        ctx.restore();
        break;
      }

      case "qr": {
        const dataUrl = await QRCode.toDataURL(content || "UNKNOWN");
        const img     = await loadImage(dataUrl);
        ctx.drawImage(img, x, y, w, h);
        break;
      }

      case "line":
        ctx.save();
        ctx.strokeStyle = el.color || "black";
        ctx.lineWidth   = el.thickness || 1;
        if (el.style === "dashed") ctx.setLineDash([3, 3]);
        ctx.beginPath();
        if (el.orientation === "vertical") {
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + el.length * PX_H);
        } else {
          ctx.moveTo(x, y);
          ctx.lineTo(x + el.length * PX_W, y);
        }
        ctx.stroke();
        ctx.restore();
        break;
    }
  }
}

// ── 1) Render every label to an in-memory PNG buffer ────────────────────────
async function createImageBuffers(order) {
  const buffers = [];
  for (let i = 1; i <= order.order_qty_requested; i++) {
    const canvas = createCanvas(PX_W, PX_H);
    const ctx    = canvas.getContext("2d");

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, PX_W, PX_H);

    await drawElementsToCanvas(ctx, elementsConfig, order);
    buffers.push(canvas.toBuffer("image/png"));
  }
  return buffers;
}

// ── 2) Bundle those buffers into a PDF (archival) ───────────────────────────
async function createPdfFromBuffers(buffers, orderId) {
  const filePath = path.join("pdf", `${orderId}.pdf`);
  ensureDirectoryExists(filePath);

  const doc    = new PDFDocument({ size: [PT_W, PT_H], margin: 0 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  buffers.forEach((buf, idx) => {
    if (idx) doc.addPage({ size: [PT_W, PT_H], margin: 0 });
    doc.image(buf, 0, 0, { width: PT_W, height: PT_H });
  });

  doc.end();
  await new Promise((res) => stream.on("finish", res));
  return filePath;
}

// ── 3) Send PNG buffers to the print-bridge ────────────────────────────────
async function printBuffers(buffers) {
  const endpoint = "http://137.184.148.164:5090/api/print-image";
  for (const buf of buffers) {
    const dataUrl = "data:image/png;base64," + buf.toString("base64");
    const res = await fetch(endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ imageData: dataUrl, cut: true })
    });
    if (!res.ok) console.error("Print API error:", await res.text());
  }
}

// ── 4) Poll new orders → label → print → mark done ──────────────────────────
async function pollPendingOrders() {
  const { data: orders, error } = await supabase
    .from("home_depot_order_history")
    .select("order_id,order_qty_requested,material_id")
    .is("label_pdf_url", null);

  if (error) return console.error("DB fetch error:", error);

  for (const order of orders) {
    try {
      console.log("Processing order:", order.order_id);

      const buffers = await createImageBuffers(order);
      console.log(` → Rendered ${buffers.length} PNG buffer(s)`);

      const pdfPath = await createPdfFromBuffers(buffers, order.order_id);
      console.log(" → PDF saved at:", pdfPath);

      await printBuffers(buffers);
      console.log(` → Printed ${buffers.length} page(s)`);

      await supabase
        .from("home_depot_order_history")
        .update({ label_pdf_url: pdfPath })
        .eq("order_id", order.order_id);

    } catch (e) {
      console.error(`Error processing order ${order.order_id}:`, e);
    }
  }
}

setInterval(pollPendingOrders, 2000);
app.listen(port, () => console.log(`Label printer service listening on ${port}`));
