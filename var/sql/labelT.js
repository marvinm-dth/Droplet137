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

async function generateInternalSku(item, materialId) {
  if (item.internal_sku) return item.internal_sku;
  if (item.temp_internal_sku) return item.temp_internal_sku;

  const tempSku = `DTH${Math.floor(10000000 + Math.random() * 90000000)}`;

  await supabase
    .from("home_depot_items")
    .update({ temp_internal_sku: tempSku })
    .eq("material_id", materialId);

  return tempSku;
}

const createElements = async (order, item, pageNum) => {
  const internalSku = await generateInternalSku(item, order.material_id);
  const qrText = `${internalSku}-${pageNum}`;
  const qrBuffer = await QRCode.toBuffer(qrText, { margin: 1 });

  const labelWidth = 600;
  const labelHeight = 300;

  const elements = [
    {
      type: "sidebar",
      text: "DTH ITEM",
      font: "Helvetica-Bold",
      fontSize: 0.08, // 8% of label height
      fontColor: "black",
      fillColor: "white",
      bounds: { width: 0.10, height: 1.0 }, 
      position: { x: 0, y: 0 },
    },
    {
      type: "item_name",
      text: (item.item_desc || "UNKNOWN ITEM").toUpperCase().substring(0, 20), 
      font: "Helvetica-Bold",
      fontSize: 0.15,
      fontColor: "black",
      bounds: { width: 0.55, height: 0.4 },
      position: { x: 0.12, y: 0.05 },
    },
    {
      type: "order_id",
      text: order.order_id,
      font: "Helvetica",
      fontSize: 0.10,
      fontColor: "black",
      bounds: { width: 0.55, height: 0.1 },
      position: { x: 0.12, y: 0.65 },
    },
    {
      type: "sku",
      text: internalSku,
      font: "Helvetica",
      fontSize: 0.10,
      fontColor: "black",
      bounds: { width: 0.55, height: 0.1 },
      position: { x: 0.12, y: 0.77 },
    },
    {
      type: "location",
      text: "Bay 1 | Shelf 4 | Bin 18",
      font: "Helvetica",
      fontSize: 0.075,
      fontColor: "black",
      bounds: { width: 0.55, height: 0.1 },
      position: { x: 0.12, y: 0.88 },
    },
    {
      type: "qr_code",
      image: qrBuffer,
      bounds: { width: 0.33, height: 0.66 },
      position: { x: 0.65, y: 0.05 },
    },
  ];

  return { elements, labelWidth, labelHeight };
};

function renderElements(doc, elementData) {
  const { elements, labelWidth, labelHeight } = elementData;

  elements.forEach((el) => {
    const x = el.position.x * labelWidth;
    const y = el.position.y * labelHeight;
    const width = el.bounds.width * labelWidth;
    const height = el.bounds.height * labelHeight;

    if (el.type === "sidebar") {
      doc.rect(x, y, width, height).fill(el.fillColor);
      doc.save()
        .fillColor(el.fontColor)
        .font(el.font)
        .fontSize(el.fontSize * labelHeight)
        .rotate(90, { origin: [x + width / 2, y + height / 2] })
        .text(el.text, y - height / 2, -(x + width / 2), { align: "center" })
        .restore();
    } else if (el.type === "qr_code") {
      doc.image(el.image, x, y, { width, height });
    } else {
      doc.font(el.font)
        .fontSize(el.fontSize * labelHeight)
        .fillColor(el.fontColor)
        .text(el.text, x, y, { width, height });
    }
  });
}

async function createPdf(order) {
  const { data: item } = await supabase
    .from("home_depot_items")
    .select("*")
    .eq("material_id", order.material_id)
    .single();

  if (!item) throw new Error("Item data not found.");

  const filePath = `./pdf/${order.order_id}.pdf`;
  ensureDirectoryExists(filePath);

  const doc = new PDFDocument({ size: [600, 300], margin: 0 });
  doc.pipe(fs.createWriteStream(filePath));

  for (let i = 1; i <= order.order_qty_requested; i++) {
    if (i > 1) doc.addPage({ size: [600, 300], margin: 0 });
    const elementData = await createElements(order, item, i);
    renderElements(doc, elementData);
  }

  doc.end();
  return filePath;
}

async function pollPendingOrders() {
  try {
    const { data: orders, error } = await supabase
      .from("home_depot_order_history")
      .select("order_id, internet_sku_number, order_qty_requested, material_id")
      .is("label_pdf_url", null);

    if (error) throw error;

    for (const order of orders) {
      if (!order.internet_sku_number || !order.order_id || !order.order_qty_requested) continue;

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
