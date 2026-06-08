// label_broadcaster.js
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

// ─── CONFIG ───────────────────────────────────────────────
const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,      // anon or service role key
  PORT = 4001             // if you ever wrap this in an HTTP API
} = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌  Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

// Directory for output PDFs
const LABEL_DIR = '/var/sql/dth_materials/labels';
if (!fs.existsSync(LABEL_DIR)) {
  fs.mkdirSync(LABEL_DIR, { recursive: true });
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── PDF + QR GENERATOR ────────────────────────────────────
async function buildLabelsPDF(orderId, lines) {
  const pdfPath = path.join(LABEL_DIR, `order_${orderId}.pdf`);
  const doc = new PDFDocument({ autoFirstPage: false });
  const out = fs.createWriteStream(pdfPath);
  doc.pipe(out);

  for (const line of lines) {
    const qty = Number(line.order_qty_requested) || 1;
    for (let i = 0; i < qty; i++) {
      doc.addPage({ size: 'LETTER', margin: 20 });
      // generate QR code image
      const qrDataUrl = await QRCode.toDataURL(line.UUID);
      const base64 = qrDataUrl.split(',')[1];
      doc.image(Buffer.from(base64, 'base64'), 20, 20, { width: 100, height: 100 });

      doc.font('Helvetica').fontSize(8);
      doc.text(`SKU: ${line.internet_sku_number}`, 130, 40);
      doc.text(`Name: ${line.item_desc}`, 130, 55, { width: 200 });
      doc.text(`Order: ${orderId}`, 130, 75);
      doc.text(`Date: ${new Date().toISOString().slice(0,10)}`, 130, 90);
    }
  }

  doc.end();
  return new Promise((resolve, reject) => {
    out.on('finish', () => {
      const publicUrl = `/order_file/labels/order_${orderId}.pdf`;
      resolve(publicUrl);
    });
    out.on('error', reject);
  });
}

// ─── HANDLER FOR NEW ROWS ─────────────────────────────────
async function onInsert(payload) {
  const { new: row } = payload;
  if (!row || !row.order_id) return;

  const orderId = row.order_id;
  console.log(`[Listener] New line for order ${orderId}`);

  // fetch all lines for this order
  const { data: lines, error: fetchErr } = await supabase
    .from('home_depot_order_history')
    .select('*')
    .eq('order_id', orderId);

  if (fetchErr) {
    console.error('[Listener] Fetch error:', fetchErr);
    return;
  }

  // generate PDF
  let pdfPath;
  try {
    pdfPath = await buildLabelsPDF(orderId, lines);
    console.log(`[Listener] PDF built: ${pdfPath}`);
  } catch (err) {
    console.error('[Listener] PDF generation failed:', err);
    return;
  }

  // update order header
  const { error: updateErr } = await supabase
    .from('home_depot_orders')
    .update({ label_pdf_url: pdfPath })
    .eq('order_id', orderId);

  if (updateErr) {
    console.error('[Listener] Failed to save PDF URL:', updateErr);
  } else {
    console.log(`[Listener] Saved label_pdf_url for order ${orderId}`);
  }
}

// ─── START SUBSCRIPTION ───────────────────────────────────
async function startListener() {
  console.log('[Listener] Subscribing to home_depot_order_history INSERTs...');
  await supabase
    .channel('orders_bcast')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'home_depot_order_history'
    }, onInsert)
    .subscribe();
}

startListener().catch(err => {
  console.error('[Listener] Fatal error:', err);
  process.exit(1);
});
