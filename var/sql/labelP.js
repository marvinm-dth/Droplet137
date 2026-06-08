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
  const dimensions = [600, 300];  // fixed label size 2"x1"
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
    const padding = 10;
    const qrSize = dimensions[1] * 0.6;

    // Black sidebar
    doc.rect(0, 0, barWidth, dimensions[1]).fill("black");

    // Vertical "DTH ITEM" text
    doc.save();
    doc.rotate(90, { origin: [barWidth / 2, dimensions[1] / 2] })
      .fontSize(16)
      .fillColor("white")
      .font("Helvetica-Bold")
      .text("DTH ITEM", -dimensions[1] / 2, -barWidth / 2 - 8, {
        width: dimensions[1],
        align: "center",
      });
    doc.restore();

    // Item Name (corrected to top-left)
    doc.fontSize(18)
      .fillColor("black")
      .font("Helvetica-Bold")
      .text(itemDetails.item_desc.toUpperCase(), barWidth + padding, padding, {
        width: dimensions[0] - barWidth - qrSize - 3 * padding,
        height: qrSize,
      });

    // QR Code (positioned correctly)
    doc.image(qrBuffer, dimensions[0] - qrSize - padding, padding, {
      width: qrSize,
      height: qrSize,
    });

    const textY = padding + qrSize + 10;

    // Order Number (Corrected, NO random names!)
    doc.fontSize(16)
      .text(order.order_name, barWidth + padding, textY);

    // Material ID (Corrected, numerical/material ID)
    doc.fontSize(16)
      .text(order.material_id, barWidth + padding, textY + 20);

    // Fixed Location Info at bottom-left
    doc.fontSize(14)
      .text("Bay 1   | Shelf 4   | Bin 18", barWidth + padding, dimensions[1] - 25);
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
