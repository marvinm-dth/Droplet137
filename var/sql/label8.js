// label-service.js

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const PDFDocument       = require('pdfkit');
const QRCode            = require('qrcode');
const fs   = require('fs');
const path = require('path');

/* ── Configuration ───────────────────────────────────────── */
const {
  SUPABASE_URL        = 'http://137.184.148.164:8000',  // HTTP, not HTTPS!
  SUPABASE_ANON_KEY,
  PORT                = 5032
} = process.env;

if (!SUPABASE_ANON_KEY) {
  console.error('❌ Missing SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

/* ── Supabase client ──────────────────────────────────────── */
global.fetch = fetch;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ── Express setup ────────────────────────────────────────── */
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Create labels folder if missing
const LABEL_DIR = '/var/sql/dth_materials/labels';
if (!fs.existsSync(LABEL_DIR)) {
  console.log(`Creating ${LABEL_DIR}`);
  fs.mkdirSync(LABEL_DIR, { recursive: true });
}

// ── Utility: generate one-label-per-page PDF ───────────────
async function buildLabelsPDF(orderId, lines) {
  const pdfPath = path.join(LABEL_DIR, `order_${orderId}.pdf`);
  const doc     = new PDFDocument({ autoFirstPage: false });
  const out     = fs.createWriteStream(pdfPath);
  doc.pipe(out);

  for (const line of lines) {
    // default missing label_size
    const size = line.label_size || '2x1';
    const qty  = Number(line.order_qty_requested) || 1;
    for (let i = 0; i < qty; i++) {
      doc.addPage({ size: 'LETTER', margin: 20 });
      const qr = await QRCode.toDataURL(line.UUID);
      const img = qr.split(',')[1];
      doc.image(Buffer.from(img, 'base64'), 20, 20, { width: 100, height: 100 });
      doc.font('Helvetica').fontSize(8);
      doc.text(`SKU: ${line.internet_sku_number}`, 130, 40);
      doc.text(`Name: ${line.item_desc}`, 130, 55, { width: 200 });
      doc.text(`Order: ${orderId}`, 130, 75);
      doc.text(`Size: ${size}`, 130, 90);
      doc.text(`Date: ${new Date().toISOString().slice(0,10)}`, 130, 105);
    }
  }

  doc.end();
  return new Promise((resolve, reject) => {
    out.on('finish', () => resolve(`/order_file/labels/order_${orderId}.pdf`));
    out.on('error', reject);
  });
}

// ── Polling function ─────────────────────────────────────────
async function pollPendingOrders() {
  // 1) get orders missing their label_pdf_url
  const { data: orders, error: ordErr } = await supabase
    .from('home_depot_orders')
    .select('order_id')
    .is('label_pdf_url', null);

  if (ordErr) return console.error('Fetch orders error:', ordErr);

  for (const { order_id: orderId } of orders) {
    console.log(`→ Generating labels for order ${orderId}`);

    // 2) fetch order lines
    const { data: lines, error: lineErr } = await supabase
      .from('home_depot_order_history')
      .select('*')
      .eq('order_id', orderId);
    if (lineErr) {
      console.error(`Fetch lines error for ${orderId}:`, lineErr);
      continue;
    }

    // 3) fetch label_size from master table
    const mats = [...new Set(lines.map(l => l.material_id))];
    const { data: skus = [], error: skuErr } = await supabase
      .from('home_depot_items')
      .select('material_id,label_size')
      .in('material_id', mats);
    if (skuErr) console.error('Fetch SKUs error:', skuErr);
    const sizeMap = new Map(skus.map(s => [s.material_id, s.label_size]));

    // 4) enrich lines
    const enriched = lines.map(l => ({
      ...l,
      label_size: sizeMap.get(l.material_id) || '2x1',
      UUID:       l.UUID   // must exist already on each line
    }));

    // 5) build PDF
    try {
      const pdfUrl = await buildLabelsPDF(orderId, enriched);
      console.log(`✔ PDF created at: ${pdfUrl}`);

      // 6) update header
      const { error: updErr } = await supabase
        .from('home_depot_orders')
        .update({ label_pdf_url: pdfUrl })
        .eq('order_id', orderId);
      if (updErr) console.error(`Update header error for ${orderId}:`, updErr);
      else console.log(`→ label_pdf_url saved for order ${orderId}`);
    } catch (e) {
      console.error(`PDF generation failed for ${orderId}:`, e);
    }
  }
}

// ── Kick off polling ──────────────────────────────────────────
console.log(`🚀 Starting label poller (polling every second)…`);
setInterval(pollPendingOrders, 1000);

// ── Minimal health endpoint ───────────────────────────────────
app.get('/', (_, res) => res.send('Label service running'));

app.listen(port, () => {
  console.log(`Label service listening on port ${port}`);
});
