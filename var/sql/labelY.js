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

// Data-driven element configuration, now including a vertical black line
const elementsConfig = [
  {
    name: "sidebar",
    text: "DTH ITEM",
    font: "Helvetica-Bold",
    fontSize: 0.2,
    fontColor: "black",
    fillColor: "white",
    bounds: { width: 0.8, height: 1.0 },
    position: { x: 0.1, y: 1.0 },
    rotation: 270,
  },
  {
    name: "item_name",
    table: "home_depot_items",
    lookupColumn: "material_id",
    returnColumn: "item_desc",
    truncate: 20,
    font: "Helvetica-Bold",
    fontSize: 0.15,
    fontColor: "black",
    bounds: { width: 0.55, height: 0.4 },
    position: { x: 0.12, y: 0.05 },
  },
  {
    name: "order_id",
    table: "home_depot_order_history",
    lookupColumn: "order_id",
    returnColumn: "order_id",
    font: "Helvetica",
    fontSize: 0.10,
    fontColor: "black",
    bounds: { width: 0.55, height: 0.1 },
    position: { x: 0.12, y: 0.65 },
  },
  {
    name: "sku",
    table: "home_depot_items",
    lookupColumn: "material_id",
    returnColumn: "internal_sku",
    fallbackColumn: "temp_internal_sku",
    generateFallback: true,
    font: "Helvetica",
    fontSize: 0.10,
    fontColor: "black",
    bounds: { width: 0.55, height: 0.1 },
    position: { x: 0.12, y: 0.77 },
  },
  {
    name: "location",
    text: "Bay 1 | Shelf 4 | Bin 18",
    font: "Helvetica",
    fontSize: 0.075,
    fontColor: "black",
    bounds: { width: 0.55, height: 0.1 },
    position: { x: 0.12, y: 0.88 },
  },
  {
    name: "qr_code",
    type: "qr",
    sourceElement: "sku",
    bounds: { width: 0.4, height: 0.7 },
    position: { x: 0.6, y: 0.00 },
  },
  // ← NEW: a vertical black line down the label
  {
    name: "divider",
    type: "line",
    orientation: "vertical",  // horizontal | vertical | rotated
    position: { x: 0.1, y: 0.05 },
    length: 0.9,             // 90% of label height
    thickness: 5,
    color: "black",
    style: "solid"           // solid | dashed | dotted | dot-dash
  },
];

async function fetchElementData(element, lookupValue) {
  if (!element.table || !element.returnColumn) return element.text || "";

  const { data, error } = await supabase
    .from(element.table)
    .select(element.returnColumn)
    .eq(element.lookupColumn, lookupValue)
    .single();

  if (error || !data) return element.text || "";

  let value = data[element.returnColumn];

  if (!value && element.fallbackColumn) {
    const { data: fb } = await supabase
      .from(element.table)
      .select(element.fallbackColumn)
      .eq(element.lookupColumn, lookupValue)
      .single();
    value = fb?.[element.fallbackColumn];
  }

  if (!value && element.generateFallback) {
    value = `DTH${Math.floor(10000000 + Math.random() * 90000000)}`;
    await supabase
      .from(element.table)
      .update({ [element.fallbackColumn]: value })
      .eq(element.lookupColumn, lookupValue);
  }

  if (element.truncate && value.length > element.truncate) {
    value = value.substring(0, element.truncate);
  }

  return value;
}

async function renderElements(doc, elements, context, dimensions) {
  for (const el of elements) {
    const x = el.position.x * dimensions.width;
    const y = el.position.y * dimensions.height;
    const w = (el.bounds?.width || 0) * dimensions.width;
    const h = (el.bounds?.height || 0) * dimensions.height;

    const content = await fetchElementData(el, context[el.lookupColumn]);
    context[el.name] = content;

    // QR code
    if (el.type === "qr") {
      const qrBuff = await QRCode.toBuffer(content || "UNKNOWN");
      doc.image(qrBuff, x, y, { width: w, height: h });
      continue;
    }

    // Box (filled or outline)
    if (el.type === "box") {
      if (el.fillColor) {
        doc.rect(x, y, w, h).fill(el.fillColor);
      }
      if (el.outlineColor) {
        doc.lineWidth(el.outlineThickness || 1)
           .strokeColor(el.outlineColor)
           .rect(x, y, w, h)
           .stroke();
      }
      continue;
    }

    // Line
    if (el.type === "line") {
      doc.save();
      doc.lineWidth(el.thickness || 1)
         .strokeColor(el.color || "black")
         .setLineDash(el.style === "dashed" ? [] : []) // no dash for solid
      ;
      doc.beginPath();
      if (el.orientation === "vertical") {
        doc.moveTo(x, y).lineTo(x, y + el.length * dimensions.height);
      } else if (el.orientation === "horizontal") {
        doc.moveTo(x, y).lineTo(x + el.length * dimensions.width, y);
      }
      doc.stroke();
      doc.restore();
      continue;
    }

    // Text
    if (el.type === "text") {
      if (el.fillColor) {
        doc.rect(x, y, w, h).fill(el.fillColor);
      }
      doc.fillColor(el.fontColor || "black")
         .font(el.font)
         .fontSize(el.fontSize * dimensions.height)
         .text(content, x, y, { width: w, height: h });
      continue;
    }
  }
}

async function createPdf(order) {
  const filePath = `./pdf/${order.order_id}.pdf`;
  ensureDirectoryExists(filePath);

  const doc = new PDFDocument({ size: [600, 300], margin: 0 });
  doc.pipe(fs.createWriteStream(filePath));

  for (let i = 1; i <= order.order_qty_requested; i++) {
    if (i > 1) doc.addPage({ size: [600, 300], margin: 0 });
    await renderElements(doc, elementsConfig, order, { width: 600, height: 300 });
  }

  doc.end();
  return filePath;
}

async function pollPendingOrders() {
  const { data: orders, error } = await supabase
    .from("home_depot_order_history")
    .select("order_id, order_qty_requested, material_id")
    .is("label_pdf_url", null);

  if (error) {
    console.error("Fetch Error:", error);
    return;
  }

  for (const order of orders) {
    try {
      const pdfPath = await createPdf(order);
      await supabase
        .from("home_depot_order_history")
        .update({ label_pdf_url: pdfPath })
        .eq("order_id", order.order_id);

      console.log(`Generated PDF for order ${order.order_id}`);
    } catch (err) {
      console.error(`Error processing order ${order.order_id}:`, err);
    }
  }
}

setInterval(pollPendingOrders, 1000);

app.listen(port, () => console.log(`Server running on port ${port}`));
