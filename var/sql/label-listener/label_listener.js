// label_broadcaster.js
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

// ─── Configuration ───────────────────────────────────────────
const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,   // anon or service role key
} = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

// Directory where label PDFs will be saved
const LABEL_DIR = '/var/sql/dth_materials/labels';
if (!fs.existsSync(LABEL_DIR)) {
  fs.mkdirSync(LABEL_DIR, { recursive: true });
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── PDF & QR Code Generator ────────────────────────────────
async function buildLabelsPDF(orderId, lines) {
  const pdfPath = path.join(LABEL_DIR, `order_${orderId}.pdf`);
  const doc = new PDFDocument({ autoFirstPage: false });
  const out = fs.createWriteStream(pdfPath);
  doc.pipe(out);

  for (const line of lines) {
    const qty = Number(line.order_qty_requested) || 1;
    for (let i = 0; i < qty; i++) {
      doc.addPage({ size: 'LETTER', margin: 20 });
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
    out.on('finish', () => resolve(`/order_file/labels/order_${orderId}.pdf`));
    out.on('error', reject);
  });
}

// ─── Handler for new order lines ────────────────────────────
async function onNewOrderLine(payload) {
  const { new: row } = payload;
  if (!row || !row.order_id) return;

  const orderId = row.order_id;

  // Fetch all lines for this order
  const { data: lines, error: fetchErr } = await supabase
    .from('home_depot_order_history')
    .select('*')
    .eq('order_id', orderId);

  if (fetchErr) {
    console.error('Error fetching order lines:', fetchErr);
    return;
  }

  // Generate PDF
  let pdfUrl;
  try {
    pdfUrl = await buildLabelsPDF(orderId, lines);
    console.log(`Generated PDF for order ${orderId}: ${pdfUrl}`);
  } catch (err) {
    console.error('PDF generation failed:', err);
    return;
  }

  // Update the order header with the PDF URL
  const { error: updateErr } = await supabase
    .from('home_depot_orders')
    .update({ label_pdf_url: pdfUrl })
    .eq('order_id', orderId);

  if (updateErr) {
    console.error('Failed to save label_pdf_url:', updateErr);
  } else {
    console.log(`Saved label_pdf_url for order ${orderId}`);
  }
}

// ─── Activate Realtime Broadcast Subscription ───────────────
async function startListener() {
  console.log('Subscribing to home_depot_order_history INSERT events...');
  await supabase
    .channel('orders_broadcast')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'home_depot_order_history'
    }, onNewOrderLine)
    .subscribe();
}

startListener().catch(err => {
  console.error('Fatal listener error:', err);
  process.exit(1);
});
