// label_poller.js

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

// ─── CONFIG ───────────────────────────────────────────────
const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

// Directory to save generated PDFs
const LABEL_DIR = '/var/sql/dth_materials/labels';
if (!fs.existsSync(LABEL_DIR)) fs.mkdirSync(LABEL_DIR, { recursive: true });

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── PDF + QR GENERATOR ────────────────────────────────────
async function buildLabelsPDF(orderId, lines) {
  const pdfPath = path.join(LABEL_DIR, `order_${orderId}.pdf`);
  const doc = new PDFDocument({ autoFirstPage: false });
  const stream = fs.createWriteStream(pdfPath);
  doc.pipe(stream);

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
    stream.on('finish', () => resolve(`/order_file/labels/order_${orderId}.pdf`));
    stream.on('error', reject);
  });
}

// ─── POLLER ────────────────────────────────────────────────
async function pollNewOrders() {
  const { data: orders, error } = await supabase
    .from('home_depot_orders')
    .select('order_id')
    .is('label_pdf_url', null);

  if (error) {
    console.error('Error fetching pending orders:', error);
    return;
  }

  for (const { order_id: orderId } of orders) {
    // fetch lines for this order
    const { data: lines, error: fetchErr } = await supabase
      .from('home_depot_order_history')
      .select('*')
      .eq('order_id', orderId);

    if (fetchErr) {
      console.error(`Error fetching lines for order ${orderId}:`, fetchErr);
      continue;
    }

    // generate PDF
    try {
      const pdfRelPath = await buildLabelsPDF(orderId, lines);
      // update header
      const { error: updErr } = await supabase
        .from('home_depot_orders')
        .update({ label_pdf_url: pdfRelPath })
        .eq('order_id', orderId);

      if (updErr) {
        console.error(`Failed to save PDF URL for order ${orderId}:`, updErr);
      } else {
        console.log(`Labels generated for order ${orderId}: ${pdfRelPath}`);
      }
    } catch (e) {
      console.error(`PDF generation error for order ${orderId}:`, e);
    }
  }
}

// start polling every second
setInterval(pollNewOrders, 1000);
console.log('Polling for new orders every second...');
