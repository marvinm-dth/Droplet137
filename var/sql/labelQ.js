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

  return data || {};
}

async function generateInternalSku(item, materialId) {
  if (item.internal_sku) return item.internal_sku;
  if (item.temp_internal_sku) return item.temp_internal_sku;

  const randomSku = `DTH${Math.floor(10000000 + Math.random() * 90000000)}`;

  await supabase
    .from("home_depot_items")
    .update({ temp_internal_sku: randomSku })
    .eq("material_id", materialId);

  return randomSku;
}

async function createLabelPdf(order, item) {
  const dpi = 300;
  const W = 2 * dpi;
  const H = 1 * dpi;
  const barWidth = Math.round(0.10 * W);
  const marginX = Math.round(0.02 * W);
  const marginY = Math.round(0.05 * H);
  const lineSpacing = Math.round(0.02 * H);
  const qrSize = Math.floor(W / 3);

  const filePath = `./pdf/${order.order_id}.pdf`;
  ensureDirectoryExists(filePath);

  const internalSku = await generateInternalSku(item, order.material_id);

  const doc = new PDFDocument({ size: [W, H], margin: 0 });
  doc.pipe(fs.createWriteStream(filePath));

  for (let i = 1; i <= order.order_qty_requested; i++) {
    if (i > 1) doc.addPage({ size: [W, H], margin: 0 });

    const qrText = `${internalSku}-${i}`;
    const qrBuffer = await QRCode.toBuffer(qrText, { margin: 1 });

    // Sidebar
    doc.rect(0, 0, barWidth, H).fill("black");

    // "DTH ITEM" vertical text
    doc.save()
      .rotate(90, { origin: [barWidth / 2, H / 2] })
      .fillColor("white")
      .font("Helvetica-Bold")
      .fontSize(Math.round(0.08 * H))
      .text("DTH ITEM", -(H / 2), -barWidth / 2, { width: H, align: "center" })
      .restore();

    // QR code at top-right
    doc.image(qrBuffer, W - marginX - qrSize, marginY, { width: qrSize });

    // Order ID and SKU at bottom-left
    let bottomTextY = H - marginY - (Math.round(0.10 * H) * 2 + lineSpacing + Math.round(0.075 * H));

    doc.font("Helvetica")
      .fontSize(Math.round(0.10 * H))
      .fillColor("black")
      .text(order.order_id, barWidth + marginX, bottomTextY);

    bottomTextY += Math.round(0.10 * H) + lineSpacing;

    doc.text(internalSku, barWidth + marginX, bottomTextY);

    // Location text flush-bottom
    doc.fontSize(Math.round(0.075 * H))
      .text("Bay 1   |   Shelf 4   |   Bin 18", barWidth + marginX, H - marginY - Math.round(0.075 * H));

    // Item description (auto-wrapped)
    const availableWidth = W - barWidth - 2 * marginX - qrSize;
    const description = (item.item_desc || "UNKNOWN ITEM").toUpperCase();

    let bestFontSize = Math.round(0.20 * H);
    let descriptionLines;

    for (let sz = bestFontSize; sz >= 8; sz--) {
      doc.font("Helvetica-Bold").fontSize(sz);
      descriptionLines = doc.heightOfString(description, { width: availableWidth });

      if (descriptionLines <= bottomTextY - marginY - lineSpacing) {
        bestFontSize = sz;
        break;
      }
    }

    doc.fontSize(bestFontSize)
      .text(description, barWidth + marginX, marginY, { width: availableWidth, height: qrSize });
  }

  doc.end();
  return filePath;
}

async function pollPendingOrders() {
  const { data: orders, error } = await supabase
    .from("home_depot_order_history")
    .select("order_id, internet_sku_number, order_qty_requested, material_id")
    .is("label_pdf_url", null);

  if (error) return console.error("Error fetching orders:", error);

  for (const order of orders) {
    if (!order.internet_sku_number || !order.order_id || !order.order_qty_requested) continue;

    const item = await fetchItemDetails(order.material_id);

    if (!item.item_desc) continue;

    try {
      const pdfPath = await createLabelPdf(order, item);
      await supabase
        .from("home_depot_order_history")
        .update({ label_pdf_url: pdfPath })
        .eq("order_id", order.order_id);

      console.log(`Generated PDF for order ${order.order_id}`);
    } catch (err) {
      console.error(`Failed PDF generation for order ${order.order_id}:`, err);
    }
  }
}

setInterval(pollPendingOrders, 1000);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
