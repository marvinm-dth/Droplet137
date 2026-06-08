const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 50;

const supabaseUrl = "http://137.184.148.164:8000";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Utilities
const ensureDirectoryExists = (filePath) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

// Fetch item details
async function fetchItemDetails(materialId) {
  const { data, error } = await supabase
    .from("home_depot_items")
    .select("item_desc, internal_sku, temp_internal_sku, label_size")
    .eq("material_id", materialId)
    .single();

  return data || {};
}

// Generate internal SKU
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

// Element definitions
const createElements = async (order, item, pageNum) => {
  const dpi = 300;
  const W = 2 * dpi;
  const H = 1 * dpi;

  const marginX = W * 0.02;
  const marginY = H * 0.05;
  const sidebarWidth = W * 0.10;
  const qrSize = W / 3;

  const internalSku = await generateInternalSku(item, order.material_id);
  const qrText = `${internalSku}-${pageNum}`;
  const qrBuffer = await QRCode.toBuffer(qrText, { margin: 1 });

  return [
    {
      type: "sidebar",
      x: 0,
      y: 0,
      width: sidebarWidth,
      height: H,
      fillColor: "white",
      text: "DTH ITEM",
      fontSize: H * 0.08,
      font: "Helvetica-Bold",
      fontColor: "white",
    },
    {
      type: "item_name",
      x: sidebarWidth + marginX,
      y: marginY,
      width: W - sidebarWidth - 2 * marginX - qrSize,
      text: item.item_desc?.toUpperCase() || "UNKNOWN ITEM",
      fontSize: H * 0.15,
      font: "Helvetica-Bold",
      fontColor: "black",
    },
    {
      type: "order_id",
      x: sidebarWidth + marginX,
      y: H - marginY - H * 0.28,
      text: order.order_id,
      fontSize: H * 0.10,
      font: "Helvetica",
      fontColor: "black",
    },
    {
      type: "sku",
      x: sidebarWidth + marginX,
      y: H - marginY - H * 0.17,
      text: internalSku,
      fontSize: H * 0.10,
      font: "Helvetica",
      fontColor: "black",
    },
    {
      type: "location",
      x: sidebarWidth + marginX,
      y: H - marginY - H * 0.08,
      text: "Bay 1 | Shelf 4 | Bin 18",
      fontSize: H * 0.075,
      font: "Helvetica",
      fontColor: "black",
    },
    {
      type: "qr_code",
      x: W - marginX - qrSize,
      y: marginY,
      width: qrSize,
      height: qrSize,
      image: qrBuffer,
    },
  ];
};

// Rendering engine
function renderElements(doc, elements) {
  elements.forEach((el) => {
    if (el.type === "sidebar") {
      doc.rect(el.x, el.y, el.width, el.height).fill(el.fillColor);
      doc.save()
        .fillColor(el.fontColor)
        .font(el.font)
        .fontSize(el.fontSize)
        .rotate(90, { origin: [el.width / 2, el.height / 2] })
        .text(el.text, -(el.height / 2), -(el.width / 2), { align: "center" })
        .restore();
    } else if (el.type === "qr_code") {
      doc.image(el.image, el.x, el.y, { width: el.width, height: el.height });
    } else {
      doc.font(el.font)
        .fontSize(el.fontSize)
        .fillColor(el.fontColor)
        .text(el.text, el.x, el.y, { width: el.width });
    }
  });
}

// Generate PDF
async function createLabelPdf(order, item) {
  const filePath = `./pdf/${order.order_id}.pdf`;
  ensureDirectoryExists(filePath);

  const doc = new PDFDocument({ size: [600, 300], margin: 0 });
  doc.pipe(fs.createWriteStream(filePath));

  for (let i = 1; i <= order.order_qty_requested; i++) {
    if (i > 1) doc.addPage({ size: [600, 300], margin: 0 });
    const elements = await createElements(order, item, i);
    renderElements(doc, elements);
  }

  doc.end();
  return filePath;
}

// Polling function
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
