const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

require("dotenv").config();

const app = express();
const port = process.env.PORT || 50;

const supabaseUrl = "http://137.184.148.164:8000";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const ensureDirectoryExists = (filePath) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

async function createPdf(order, labelSize = "2x1") {
  if (!order.internet_sku_number || !order.order_id || !order.quantity)
    throw new Error("Missing necessary order details");

  const dimensions = { "2x1": [144, 72] }[labelSize] || [144, 72];
  const filePath = `./pdf/${order.order_id}.pdf`;
  ensureDirectoryExists(filePath);

  const doc = new PDFDocument({ size: dimensions, margin: 0 });
  doc.pipe(fs.createWriteStream(filePath));

  for (let i = 1; i <= order.quantity; i++) {
    if (i > 1) doc.addPage({ size: dimensions, margin: 0 });
    const qrText = `${order.internet_sku_number}-${i}`;
    const qrBuffer = await QRCode.toBuffer(qrText);

    const padding = 5;
    const qrSize = Math.min(dimensions[0], dimensions[1]) - 2 * padding;

    doc.image(qrBuffer, padding, padding, { width: qrSize, height: qrSize });
  }

  doc.end();

  return filePath;
}

async function pollPendingOrders() {
  try {
    const { data: orders, error } = await supabase
      .from("home_depot_order_history")
      .select("order_id, internet_sku_number, quantity")
      .is("label_pdf_url", null);

    if (error) throw error;

    for (const order of orders) {
      if (!order.internet_sku_number || !order.order_id || !order.quantity)
        continue;

      try {
        const pdfPath = await createPdf(order);

        await supabase
          .from("home_depot_order_history")
          .update({ label_pdf_url: pdfPath })
          .eq("order_id", order.order_id);

        console.log(`Generated PDF for order ${order.order_id}`);
      } catch (orderErr) {
        console.error(`Failed to process order ${order.order_id}:`, orderErr);
      }
    }
  } catch (err) {
    console.error("Error fetching pending orders:", err);
  }
}

setInterval(pollPendingOrders, 1000);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
