// labelPrinter.js
// ─────────────────────────────────────────────────────────────────────────────
// npm i express @supabase/supabase-js qrcode pdfkit dotenv canvas
// ─────────────────────────────────────────────────────────────────────────────

const express               = require('express');
const { createClient }      = require('@supabase/supabase-js');
const QRCode                = require('qrcode');
const PDFDocument           = require('pdfkit');
const fs                    = require('fs');
const path                  = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');
require('dotenv').config();

// ─── Fonts: use the *static* TTFs you extracted ─────────────────────────────
const INTER_DIR   = '/usr/local/share/fonts/truetype/inter';        // ← your folder
const REGULAR_TTF = path.join(INTER_DIR, 'Inter-Regular.ttf');
const BOLD_TTF    = path.join(INTER_DIR, 'Inter-Bold.ttf');

// bail fast if they’re missing
[REGULAR_TTF, BOLD_TTF].forEach(p => {
  if (!fs.existsSync(p)) {
    console.error(`❌  Font file not found: ${p}`);
    process.exit(1);
  }
});

// node-canvas registration (must run *before* createCanvas)
registerFont(REGULAR_TTF, { family: 'Inter', weight: 'normal' });
registerFont(BOLD_TTF,    { family: 'Inter', weight: 'bold' });

// cache paths for PDFKit
const PDF_FONTS = { Inter: REGULAR_TTF, 'Inter-Bold': BOLD_TTF };
console.log('✓  Inter Regular & Bold loaded for canvas and PDFKit');

// ─── Express & Supabase setup ───────────────────────────────────────────────
const app  = express();
const port = process.env.PORT || 50;

const supabase = createClient(
  'http://137.184.148.164:8000',
  process.env.SUPABASE_ANON_KEY
);

// ─── Label geometry ─────────────────────────────────────────────────────────
const DPI   = 203;
const PX_W  = 2 * DPI;        // 406px
const PX_H  = 1 * DPI;        // 203px
const PT_W  = 2 * 72;         // 144pt
const PT_H  = 1 * 72;         //  72pt

// ─── Utility ────────────────────────────────────────────────────────────────
function ensureDirectoryExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── Element definitions (unchanged) ────────────────────────────────────────
const elementsConfig = [
  { name: 'sidebar', type: 'text', text: 'DTH ITEM', fontSize: 0.26,
    fontColor: 'black', fillColor: 'white',
    bounds: { width: 0.50, height: 1.0 }, position: { x: 0.0, y: 1.00 },
    rotation: 270, fontWeight: 'bold' },
  { name: 'item_name', type: 'text', table: 'home_depot_items',
    lookupColumn: 'material_id', returnColumn: 'item_desc', truncate: 20,
    fontSize: 0.12, fontColor: 'black',
    bounds: { width: 0.55, height: 0.3 }, position: { x: 0.12, y: 0.05 } },
  { name: 'order_id', type: 'text', table: 'home_depot_order_history',
    lookupColumn: 'order_id', returnColumn: 'order_id',
    fontSize: 0.12, fontColor: 'black',
    bounds: { width: 0.55, height: 0.12 }, position: { x: 0.12, y: 0.65 } },
  { name: 'sku', type: 'text', table: 'home_depot_items',
    lookupColumn: 'material_id', returnColumn: 'internal_sku',
    fallbackColumn: 'temp_internal_sku', generateFallback: true,
    fontSize: 0.12, fontColor: 'black',
    bounds: { width: 0.55, height: 0.12 }, position: { x: 0.12, y: 0.78 } },
  { name: 'location', type: 'text', text: 'Bay 1 | Shelf 4 | Bin 18',
    fontSize: 0.09, fontColor: 'black',
    bounds: { width: 0.55, height: 0.12 }, position: { x: 0.12, y: 0.90 } },
  { name: 'qr_code', type: 'qr', sourceElement: 'sku',
    bounds: { width: 0.40, height: 0.70 }, position: { x: 0.60, y: 0.00 } },
  { name: 'divider', type: 'line', orientation: 'vertical',
    position: { x: 0.11, y: 0.03 }, length: 0.94,
    thickness: 2, color: 'black', style: 'solid' }
];

// ─── Data fetch (unchanged) ─────────────────────────────────────────────────
async function fetchElementData(el, lookupValue) {
  if (!el.table || !el.returnColumn) return el.text || '';

  const { data } = await supabase
    .from(el.table)
    .select(el.returnColumn)
    .eq(el.lookupColumn, lookupValue)
    .single();

  let val = data?.[el.returnColumn] || '';
  if (!val && el.fallbackColumn) {
    const { data: fb } = await supabase
      .from(el.table)
      .select(el.fallbackColumn)
      .eq(el.lookupColumn, lookupValue)
      .single();
    val = fb?.[el.fallbackColumn] || '';
  }
  if (!val && el.generateFallback) {
    val = `DTH${Math.floor(1e7 + Math.random() * 9e7)}`;
    await supabase
      .from(el.table)
      .update({ [el.fallbackColumn]: val })
      .eq(el.lookupColumn, lookupValue);
  }
  if (el.truncate && typeof val === 'string' && val.length > el.truncate) {
    val = val.substring(0, el.truncate);
  }
  return val;
}

// ─── Canvas drawing: explicitly request “Inter” ─────────────────────────────
async function drawElements(ctx, cfg, ctxObj) {
  ctx.textBaseline = 'top';
  ctx.textAlign    = 'left';

  for (const el of cfg) {
    const x = el.position.x * PX_W;
    const y = el.position.y * PX_H;
    const w = (el.bounds?.width  || 0) * PX_W;
    const h = (el.bounds?.height || 0) * PX_H;

    const content = await fetchElementData(el, ctxObj[el.lookupColumn]);
    ctxObj[el.name] = content;

    switch (el.type) {
      case 'box':
        if (el.fillColor) { ctx.fillStyle = el.fillColor; ctx.fillRect(x, y, w, h); }
        if (el.outlineColor) {
          ctx.strokeStyle = el.outlineColor;
          ctx.lineWidth   = el.outlineThickness || 1;
          ctx.strokeRect(x, y, w, h);
        }
        break;

      case 'text': {
        if (el.fillColor) { ctx.fillStyle = el.fillColor; ctx.fillRect(x, y, w, h); }
        ctx.save();
        ctx.fillStyle = el.fontColor || 'black';
        const weight  = el.fontWeight === 'bold' ? 'bold ' : '';
        ctx.font      = `${weight}${el.fontSize * PX_H}px "Inter"`;
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

      case 'qr': {
        const qrBuf = await QRCode.toBuffer(content || 'UNKNOWN', { type: 'png' });
        const img   = await loadImage(qrBuf);
        ctx.drawImage(img, x, y, w, h);
        break;
      }

      case 'line':
        ctx.save();
        ctx.strokeStyle = el.color || 'black';
        ctx.lineWidth   = el.thickness || 1;
        if (el.style === 'dashed') ctx.setLineDash([3, 3]);
        ctx.beginPath();
        if (el.orientation === 'vertical') ctx.moveTo(x, y), ctx.lineTo(x, y + el.length * PX_H);
        else ctx.moveTo(x, y), ctx.lineTo(x + el.length * PX_W, y);
        ctx.stroke();
        ctx.restore();
        break;
    }
  }
}

// ─── 1. Create PNG buffers ─────────────────────────────────────────────────
async function createImageBuffers(order) {
  const bufs = [];
  for (let i = 0; i < order.order_qty_requested; i++) {
    const canvas = createCanvas(PX_W, PX_H);
    const ctx    = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, PX_W, PX_H);
    await drawElements(ctx, elementsConfig, order);
    bufs.push(canvas.toBuffer('image/png'));
  }
  return bufs;
}

// ─── 2. Archive buffers in a PDF (fonts registered per-doc) ────────────────
async function createPdf(bufs, orderId) {
  const filePath = path.join('pdf', `${orderId}.pdf`);
  ensureDirectoryExists(filePath);

  const doc = new PDFDocument({ size: [PT_W, PT_H], margin: 0 });
  Object.entries(PDF_FONTS).forEach(([n, f]) => doc.registerFont(n, f));

  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  bufs.forEach((b, idx) => {
    if (idx) doc.addPage({ size: [PT_W, PT_H], margin: 0 });
    doc.image(b, 0, 0);
  });

  doc.end();
  await new Promise(r => stream.on('finish', r));
  return filePath;
}

// ─── 3. Send PNGs to the print bridge ──────────────────────────────────────
async function printBuffers(bufs) {
  const endpoint = 'http://137.184.148.164:5090/api/print-image';
  for (const b of bufs) {
    const dataUrl = 'data:image/png;base64,' + b.toString('base64');
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData: dataUrl, cut: true })
    });
    if (!res.ok) console.error('Print API error:', await res.text());
  }
}

// ─── 4. Poll new orders, render, print, archive ────────────────────────────
async function pollPendingOrders() {
  const { data: orders, error } = await supabase
    .from('home_depot_order_history')
    .select('order_id,order_qty_requested,material_id')
    .is('label_pdf_url', null);

  if (error) return console.error('DB fetch error:', error);

  for (const order of orders) {
    try {
      console.log('Processing order:', order.order_id);

      const bufs    = await createImageBuffers(order);
      console.log(` → Rendered ${bufs.length} PNG(s)`);

      const pdfPath = await createPdf(bufs, order.order_id);
      console.log(' → PDF saved:', pdfPath);

      await printBuffers(bufs);
      console.log(` → Printed ${bufs.length} page(s)`);

      await supabase
        .from('home_depot_order_history')
        .update({ label_pdf_url: pdfPath })
        .eq('order_id', order.order_id);

    } catch (e) {
      console.error(`Error processing order ${order.order_id}:`, e);
    }
  }
}

setInterval(pollPendingOrders, 2000);
app.listen(port, () => console.log(`Label printer listening on ${port}`));
