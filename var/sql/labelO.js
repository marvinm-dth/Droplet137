const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const QRCode = require("qrcode");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
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

async function generateInternalSku(item) {
  if (item.internal_sku) return item.internal_sku;
  if (item.temp_internal_sku) return item.temp_internal_sku;

  const randomSku = `DTH${Math.floor(10000000 + Math.random() * 90000000)}`;

  await supabase
    .from("home_depot_items")
    .update({ temp_internal_sku: randomSku })
    .eq("material_id", item.material_id);

  return randomSku;
}

async function createLabelPdf(order, itemDetails) {
  const labelSize = itemDetails.label_size || "2x1";
  const dimensions = { "2x1": [600, 300] }[labelSize] || [600, 300];
  const filePath = `./pdf/${order.order_id}.pdf`;
  ensureDirectoryExists(filePath);

  const internalSku = await generateInternalSku(itemDetails);

  const doc = new PDFDocument({ size: dimensions, margin: 0 });
  doc.pipe(fs.createWriteStream(filePath));

  for (let i = 1; i <= order.order_qty_requested; i++) {
    if (i > 1) doc.addPage({ size: dimensions, margin: 0 });

    const qrText = `${internalSku}-${i}`;
    const qrBuffer = await QRCode.toBuffer(qrText);

    const barWidth = dimensions[0] * 0.1;
    const qrSize = dimensions[1] * 0.6;
    const padding = 10;

    // Sidebar
    doc.rect(0, 0, barWidth, dimensions[1]).fill("black");

    // Vertical Text "DTH ITEM"
    doc.save();
    doc.rotate(90, { origin: [barWidth / 2, dimensions[1] / 2] })
      .fillColor("white")
      .fontSize(16)
      .text("DTH ITEM", -dimensions[1] / 2, -barWidth / 2 - 8, {
        width: dimensions[1],
        align: "center",
      });
    doc.restore();

    const startX = barWidth + padding;
    const qrX = dimensions[0] - qrSize - padding;
    const qrY = padding;

    // QR Code placement
    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

    // Item Name
    doc.fontSize(18).fillColor("black").font("Helvetica-Bold")
      .text(itemDetails.item_desc.toUpperCase(), startX, qrY, {
        width: qrX - startX - padding,
        height: qrSize,
        align: "left"
      });

    const textY = qrY + qrSize + 5;

    // Order Number
    doc.fontSize(16).font("Helvetica-Bold")
      .text(order.order_name, startX, textY);

    // Material ID
    doc.fontSize(16)
      .text(order.material_id, startX, textY + 20);

    // Location info (hardcoded)
    doc.fontSize(14)
      .text("Bay 1   | Shelf 4   | Bin 18", startX, dimensions[1] - 30);
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
      if (!itemDetails || !itemDetails.item_desc) continue;

      try {
        const pdfPath = await createLabelPdf(order, itemDetails);
        await supabase
          .from("home_depot_order_history")
          .update({ label_pdf_url: pdfPath })
          .eq("order_id", order.order_id);

        console.log(`Generated PDF for order ${order.order_id}`);
      } catch (e) {
        console.error(`Error generating PDF for order ${order.order_id}:`, e);
      }
    }
  } catch (err) {
    console.error("Error fetching orders:", err);
  }
}

setInterval(pollPendingOrders, 1000);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
