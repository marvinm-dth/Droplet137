const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

require("dotenv").config();

const app = express();
const port = process.env.PORT || 5099;

const supabaseUrl = "http://137.184.148.164:8000";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const ensureDirectoryExists = (filePath) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

async function createPdf(order) {
  if (!order.order_id) throw new Error("Missing order ID");

  const qrBuffer = await QRCode.toBuffer(order.order_id.toString());

  const labelSize = order.label_size || "2x1";
  const filePath = `./pdf/${order.order_id}.pdf`;

  ensureDirectoryExists(filePath);

  const doc = new PDFDocument({ size: labelSize });
  doc.pipe(fs.createWriteStream(filePath));

  doc.image(qrBuffer, 10, 10, { width: 150 });

  doc.end();

  return filePath;
}

async function pollPendingOrders() {
  try {
    const { data: orders, error } = await supabase
      .from("home_depot_orders")
      .select("order_id, label_size")
      .is("label_pdf_url", null);

    if (error) throw error;

    for (const order of orders) {
      try {
        const pdfPath = await createPdf(order);

        await supabase
          .from("home_depot_orders")
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
