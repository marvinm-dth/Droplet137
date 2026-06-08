// labelPrinter.js
// ─────────────────────────────────────────────────────────────────────────────
// npm i express @supabase/supabase-js qrcode pdfkit dotenv
// ─────────────────────────────────────────────────────────────────────────────

const express       = require("express");
const { createClient } = require("@supabase/supabase-js");
const QRCode        = require("qrcode");
const PDFDocument   = require("pdfkit");
const fs            = require("fs");
const path          = require("path");
const { execSync }  = require("child_process");

// If your Node is v18+, global `fetch` is available. Otherwise install node-fetch.
// npm i node-fetch
// const fetch = require("node-fetch");

require("dotenv").config();

const app = express();
const port = process.env.PORT || 50;

const supabaseUrl    = "http://137.184.148.164:8000";
const supabaseAnonKey= process.env.SUPABASE_ANON_KEY;
const supabase       = createClient(supabaseUrl, supabaseAnonKey);

// Utility: ensure directory exists
function ensureDirectoryExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// === Your data‐driven element definitions ===
const elementsConfig = [
  {
    name: "sidebar",
    type: "text",
    text: "DTH ITEM",
    font: "Helvetica-Bold",
    fontSize: 0.2,
    fontColor: "black",
    fillColor: "white",
    bounds: { width: 0.1, height: 1.0 },
    position: { x: 0.0, y: 0.0 },
    rotation: 90, // rotate 90° CW from top-left origin
  },
  {
    name: "item_name",
    type: "text",
    table: "home_depot_items",
    lookupColumn: "material_id",
    returnColumn: "item_desc",
    truncate: 20,
    font: "Helvetica-Bold",
    fontSize: 0.1,
    fontColor: "black",
    bounds: { width: 0.55, height: 0.3 },
    position: { x: 0.12, y: 0.05 },
  },
  {
    name: "order_id",
    type: "text",
    table: "home_depot_order_history",
    lookupColumn: "order_id",
    returnColumn: "order_id",
    font: "Helvetica",
    fontSize: 0.1,
    fontColor: "black",
    bounds: { width: 0.55, height: 0.1 },
    position: { x: 0.12, y: 0.65 },
  },
  {
    name: "sku",
    type: "text",
    table: "home_depot_items",
    lookupColumn: "material_id",
    returnColumn: "internal_sku",
    fallbackColumn: "temp_internal_sku",
    generateFallback: true,
    font: "Helvetica",
    fontSize: 0.1,
    fontColor: "black",
    bounds: { width: 0.55, height: 0.1 },
    position: { x: 0.12, y: 0.77 },
  },
  {
    name: "location",
    type: "text",
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
    position: { x: 0.6, y: 0.0 },
  },
  {
    name: "divider",
    type: "line",
    orientation: "vertical",
    position: { x: 0.1, y: 0.05 },
    length: 0.9,
    thickness: 2,
    color: "black",
    style: "solid",
  },
];

// Fetch one element’s text/value (with fallback/truncation)
async function fetchElementData(el, lookupValue) {
  // simple text element?
  if (!el.table || !el.returnColumn) {
    return el.text || "";
  }
  // query main column
  let { data, error } = await supabase
    .from(el.table)
    .select(el.returnColumn)
    .eq(el.lookupColumn, lookupValue)
    .single();
  let val = data?.[el.returnColumn] || "";
  // fallback?
  if (!val && el.fallbackColumn) {
    let { data: fb } = await supabase
      .from(el.table)
      .select(el.fallbackColumn)
      .eq(el.lookupColumn, lookupValue)
      .single();
    val = fb?.[el.fallbackColumn] || "";
  }
  // generate fallback SKU if needed
  if (!val && el.generateFallback) {
    val = `DTH${Math.floor(1e7 + Math.random()*9e7)}`;
    await supabase
      .from(el.table)
      .update({ [el.fallbackColumn]: val })
      .eq(el.lookupColumn, lookupValue);
  }
  // truncate
  if (el.truncate && typeof val === "string" && val.length > el.truncate) {
    val = val.substring(0, el.truncate);
  }
  return val;
}

// Draw all elements onto the PDFKit document
async function renderElements(doc, config, ctxObj, dims) {
  for (const el of config) {
    const x = el.position.x * dims.width;
    const y = el.position.y * dims.height;
    const w = (el.bounds?.width || 0) * dims.width;
    const h = (el.bounds?.height || 0) * dims.height;

    const content = await fetchElementData(el, ctxObj[el.lookupColumn]);
    ctxObj[el.name] = content;

    switch(el.type) {
      case "box":
        if (el.fillColor) doc.rect(x,y,w,h).fill(el.fillColor);
        if (el.outlineColor) {
          doc.lineWidth(el.outlineThickness||1)
             .strokeColor(el.outlineColor)
             .rect(x,y,w,h).stroke();
        }
        break;

      case "text":
        if (el.fillColor) doc.rect(x,y,w,h).fill(el.fillColor);
        doc.save()
           .fillColor(el.fontColor||"black")
           .font(el.font)
           .fontSize(el.fontSize * dims.height);
        if (el.rotation) {
          doc.rotate(el.rotation, { origin:[x,y] });
        }
        doc.text(content, x, y, { width:w, height:h })
           .restore();
        break;

      case "qr":
        const buf = await QRCode.toBuffer(content || "UNKNOWN");
        doc.image(buf, x, y, { width:w, height:h });
        break;

      case "line":
        doc.save()
           .lineWidth(el.thickness||1)
           .strokeColor(el.color||"black")
           .undash();
        if (el.style==="dashed") doc.dash(3);
        if (el.orientation==="vertical") {
          doc.moveTo(x,y).lineTo(x,y + el.length*dims.height);
        } else {
          doc.moveTo(x,y).lineTo(x + el.length*dims.width,y);
        }
        doc.stroke().restore();
        break;
    }
  }
}

// 1) Create PDF and WAIT for it to finish writing
async function createPdf(order) {
  const filePath = path.join("pdf", `${order.order_id}.pdf`);
  ensureDirectoryExists(filePath);

  const doc = new PDFDocument({ size:[600,300], margin:0 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  // one page per qty
  for (let i=1; i<=order.order_qty_requested; i++) {
    if (i>1) doc.addPage({ size:[600,300], margin:0 });
    await renderElements(doc, elementsConfig, order, { width:600, height:300 });
  }

  doc.end();
  // wait for file to be fully flushed
  await new Promise(res => stream.on("finish", res));
  return filePath;
}

// 2) Convert PDF → PNG pages (pdftoppm must be installed)
function convertPdfToPngs(pdfPath) {
  // output prefix same as PDF path without .pdf
  const prefix = pdfPath.replace(/\.pdf$/, "");
  try {
    execSync(`pdftoppm -r 300 -png "${pdfPath}" "${prefix}"`);
  } catch(err) {
    console.error("pdftoppm error:", err.message);
    throw err;
  }

  // collect `<prefix>-1.png`, `<prefix>-2.png`, ...
  const dir = path.dirname(pdfPath);
  const base = path.basename(prefix);
  return fs.readdirSync(dir)
    .filter(f => f.startsWith(base) && f.endsWith(".png"))
    .sort((a,b)=> a.localeCompare(b, undefined, { numeric:true }))
    .map(f => path.join(dir, f));
}

// 3) Send each PNG to your bridge server
async function printImages(imagePaths) {
  const endpoint = "http://137.184.148.164:5090/api/print-image";
  for (const imgPath of imagePaths) {
    const buf = fs.readFileSync(imgPath);
    const dataUrl = "data:image/png;base64," + buf.toString("base64");
    // assume global fetch (Node 18+) or install node-fetch
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ imageData: dataUrl, cut: true })
    });
    if (!res.ok) {
      console.error("Print API error:", await res.text());
    }
  }
}

// 4) Poll NEW orders, generate, convert + print, then update
async function pollPendingOrders() {
  const { data: orders, error } = await supabase
    .from("home_depot_order_history")
    .select("order_id,order_qty_requested,material_id")
    .is("label_pdf_url", null);

  if (error) {
    console.error("DB fetch error:", error);
    return;
  }

  for (const order of orders) {
    try {
      console.log("Processing order:", order.order_id);
      const pdfPath = await createPdf(order);
      console.log(" → PDF done:", pdfPath);

      const pngs = convertPdfToPngs(pdfPath);
      console.log(" → Converted to PNGs:", pngs);

      await printImages(pngs);
      console.log(` → Printed ${pngs.length} page(s) for order ${order.order_id}`);

      // finally update so we don’t reprint
      await supabase
        .from("home_depot_order_history")
        .update({ label_pdf_url: pdfPath })
        .eq("order_id", order.order_id);
    } catch (e) {
      console.error(`Error processing order ${order.order_id}:`, e);
    }
  }
}

// every 2 seconds
setInterval(pollPendingOrders, 2000);

app.listen(port, () => {
  console.log(`Label printer service listening on port ${port}`);
});
