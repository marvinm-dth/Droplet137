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

async function fetchItemDetails(materialId) {
  const { data, error } = await supabase
    .from("home_depot_items")
    .select("item_desc, internal_sku, temp_internal_sku, label_size")
    .eq("material_id", materialId)
    .single();

  if (error || !data) {
    console.error("Item fetch error:", error);
    return null;
  }

  return data;
}

async function generateOrUpdateInternalSku(item) {
  if (item.internal_sku) return item.internal_sku;
  if (item.temp_internal_sku) return item.temp_internal_sku;

  const randomSku = `DTH${Math.floor(10000000 + Math.random() * 90000000)}`;

  await supabase
    .from("home_depot_items")
    .update({ temp_internal_sku: randomSku })
    .eq("internal_sku", item.internal_sku);

  return randomSku;
}

async function createPdf(order, itemDetails) {
  const dimensions = { "2x1": [600, 300] }[itemDetails.label_size] || [600, 300];
  const filePath = `./pdf/${order.order_id}.pdf`;
  ensureDirectoryExists(filePath);

  const doc = new PDFDocument({ size: dimensions, margin: 0 });
  doc.pipe(fs.createWriteStream(filePath));

  const internalSku = await generateOrUpdateInternalSku(itemDetails);

  for (let i = 1; i <= order.order_qty_requested; i++) {
    if (i > 1) doc.addPage({ size: dimensions, margin: 0 });

    const qrText = `${internalSku}-${i}`;
    const qrBuffer = await QRCode.toBuffer(qrText);

    const padding = 10;
    const qrSize = dimensions[1] / 2;

    // Sidebar
    doc.rect(0, 0, dimensions[0] * 0.1, dimensions[1]).fill("black");
    doc
      .fontSize(10)
      .fillColor("white")
      .rotate(90, { origin: [30, 150] })
      .text("DTH ITEM", 30, 150)
      .rotate(-90);

    // Item name
    doc.fontSize(14).fillColor("black").text(itemDetails.item_desc, dimensions[0] * 0.1 + padding, padding, {
      width: dimensions[0] * 0.55,
      height: dimensions[1] / 2,
      align: "left",
    });

    // QR code
    doc.image(qrBuffer, dimensions[0] - qrSize - padding, padding, {
      width: qrSize,
      height: qrSize,
    });

    // Order details
    const detailsY = dimensions[1] - 60;
    doc.fontSize(12).text(`Order#: ${order.order_name}`, dimensions[0] * 0.1 + padding, detailsY);
    doc.fontSize(12).text(`Material#: ${order.material_id}`, dimensions[0] * 0.1 + padding, detailsY + 15);
    doc.fontSize(10).text("Bay 1 | Shelf 4 | Bin 18", dimensions[0] * 0.1 + padding, detailsY + 30);
  }

  doc.end();
  return filePath;
}

async function pollPendingOrders() {
  try {
    const { data: orders, error } = await supabase
      .from("home_depot_order_history")
      .select("order_id, internet_sku_number, order_qty_requested, order_name, material_id")
      .is("label_pdf_url", null);

    if (error) throw error;

    for (const order of orders) {
      if (!order.internet_sku_number || !order.order_id || !order.order_qty_requested) continue;

      const itemDetails = await fetchItemDetails(order.material_id);
      if (!itemDetails) continue;

      try {
        const pdfPath = await createPdf(order, itemDetails);

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
