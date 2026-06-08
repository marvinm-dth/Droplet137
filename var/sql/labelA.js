require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");

const app = express();
const port = process.env.PORT || 5032;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const SUPABASE_URL = "http://137.184.148.164:8000"; // HTTP, NOT HTTPS
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_ANON_KEY) {
  console.error("Missing SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const LABELS_DIR = "/var/sql/dth_materials/labels";

if (!fs.existsSync(LABELS_DIR)) {
  fs.mkdirSync(LABELS_DIR, { recursive: true });
}

async function createPdf(orderId, orderItems) {
  const pdfPath = path.join(LABELS_DIR, `order_${orderId}.pdf`);
  const doc = new PDFDocument({ autoFirstPage: false });
  const stream = fs.createWriteStream(pdfPath);

  doc.pipe(stream);

  for (const item of orderItems) {
    const labelSize = item.label_size || '2x1';
    const qty = Number(item.order_qty_requested) || 1;

    for (let i = 0; i < qty; i++) {
      doc.addPage({ size: "LETTER", margin: 20 });

      const qrBuffer = await QRCode.toBuffer(item.UUID);
      doc.image(qrBuffer, 20, 20, { width: 100, height: 100 });

      doc.fontSize(10);
      doc.text(`SKU: ${item.internet_sku_number}`, 130, 20);
      doc.text(`Item: ${item.item_desc}`, 130, 40);
      doc.text(`Order ID: ${orderId}`, 130, 60);
      doc.text(`Label Size: ${labelSize}`, 130, 80);
    }
  }

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on("finish", () => resolve(`/order_file/labels/order_${orderId}.pdf`));
    stream.on("error", reject);
  });
}

async function pollPendingOrders() {
  try {
    const { data: orders, error } = await supabase
      .from("home_depot_orders")
      .select("order_id")
      .is("label_pdf_url", null);

    if (error) throw error;

    for (const { order_id } of orders) {
      const { data: items, error: itemsError } = await supabase
        .from("home_depot_order_history")
        .select("*")
        .eq("order_id", order_id);

      if (itemsError) throw itemsError;

      const materialIds = [...new Set(items.map(i => i.material_id))];

      const { data: materialDetails, error: matError } = await supabase
        .from("home_depot_items")
        .select("material_id, label_size")
        .in("material_id", materialIds);

      if (matError) throw matError;

      const sizeMap = Object.fromEntries(materialDetails.map(m => [m.material_id, m.label_size]));

      const enrichedItems = items.map(item => ({
        ...item,
        label_size: sizeMap[item.material_id] || "2x1",
      }));

      const pdfUrl = await createPdf(order_id, enrichedItems);

      await supabase.from("home_depot_orders")
        .update({ label_pdf_url: pdfUrl })
        .eq("order_id", order_id);

      console.log(`Order ${order_id} PDF created at ${pdfUrl}`);
    }
  } catch (err) {
    console.error("Error fetching pending orders:", err);
  }
}

setInterval(pollPendingOrders, 1000);

app.listen(port, () => {
  console.log(`Label service running on port ${port}`);
});
