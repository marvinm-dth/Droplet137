// label_poller.js

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

// ─── Polyfill fetch for Supabase in Node.js ───────────────────────
globalThis.fetch = fetch;

// ─── ENV & CONFIG ────────────────────────────────────────────────
const {
  SUPABASE_URL = 'http://137.184.148.164:8000',
  SUPABASE_ANON_KEY,
} = process.env;

if (!SUPABASE_ANON_KEY) {
  console.error('❌ Missing SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

// ─── Ensure labels directory exists ──────────────────────────────
const LABEL_DIR = '/var/sql/dth_materials/labels';
if (!fs.existsSync(LABEL_DIR)) {
  fs.mkdirSync(LABEL_DIR, { recursive: true });
  console.log(`Created labels directory: ${LABEL_DIR}`);
}

// ─── Initialize Supabase client ─────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── PDF + QR Code generator ────────────────────────────────────
async function buildLabelsPDF(orderId, lines) {
  const pdfPath = path.join(LABEL_DIR, `order_${orderId}.pdf`);
  const doc     = new PDFDocument({ autoFirstPage: false });
  const out     = fs.createWriteStream(pdfPath);
  doc.pipe(out);

  for (const line of lines) {
    const qty = Number(line.order_qty_requested) || 1;
    // default label_size must already be on line
    for (let i = 0; i < qty; i++) {
      doc.addPage({ size: 'LETTER', margin: 20 });
      // Generate QR
      const qrUrl = await QRCode.toDataURL(line.UUID);
      const data  = qrUrl.split(',')[1];
      doc.image(Buffer.from(data, 'base64'), 20, 20, { width: 100, height: 100 });

      doc.font('Helvetica').fontSize(8);
      doc.text(`SKU: ${line.internet_sku_number}`, 130, 40);
      doc.text(`Name: ${line.item_desc}`, 130, 55, { width: 200 });
      doc.text(`Order: ${orderId}`, 130, 75);
      doc.text(`Label Size: ${line.label_size}`, 130, 90);
      doc.text(`Date: ${new Date().toISOString().slice(0,10)}`, 130, 105);
    }
  }

  doc.end();
  return new Promise((resolve, reject) => {
    out.on('finish', () => resolve(`/order_file/labels/order_${orderId}.pdf`));
    out.on('error', reject);
  });
}

// ─── Polling loop ────────────────────────────────────────────────
async function pollPendingOrders() {
  const { data: orders, error: err } = await supabase
    .from('home_depot_orders')
    .select('order_id')
    .is('label_pdf_url', null);

  if (err) {
    console.error('Error fetching pending orders:', err);
    return;
  }

  for (const { order_id: orderId } of orders) {
    console.log(`🕵️‍♀️  Processing order ${orderId}`);

    // 1) fetch order lines
    const { data: lines, error: lineErr } = await supabase
      .from('home_depot_order_history')
      .select('*')
      .eq('order_id', orderId);

    if (lineErr) {
      console.error(`Error fetching lines for order ${orderId}:`, lineErr);
      continue;
    }

    // 2) fetch label_size from master table
    const materialIds = [...new Set(lines.map(l => l.material_id))];
    const { data: skus = [], error: skuErr } = await supabase
      .from('home_depot_items')
      .select('material_id,label_size')
      .in('material_id', materialIds);

    if (skuErr) {
      console.error('Error fetching SKU label sizes:', skuErr);
    }

    const sizeMap = new Map(skus.map(s => [
      s.material_id,
      s.label_size || '2x1'
    ]));

    // 3) enrich lines
    const enriched = lines.map(line => ({
      ...line,
      label_size: sizeMap.get(line.material_id) || '2x1',
      UUID:       line.UUID     // assume pre-populated; else handle accordingly
    }));

    // 4) generate PDF
    try {
      const pdfUrl = await buildLabelsPDF(orderId, enriched);
      console.log(`✅  PDF created: ${pdfUrl}`);

      // 5) update order header
      const { error: updErr } = await supabase
        .from('home_depot_orders')
        .update({ label_pdf_url: pdfUrl })
        .eq('order_id', orderId);

      if (updErr) {
        console.error(`Error saving PDF URL for order ${orderId}:`, updErr);
      } else {
        console.log(`✔️  Saved label_pdf_url for order ${orderId}`);
      }
    } catch (e) {
      console.error(`❌  PDF generation failed for order ${orderId}:`, e);
    }
  }
}

// Start polling once per second
console.log('🚀 Label poller started - checking every 1s…');
setInterval(pollPendingOrders, 1000);
