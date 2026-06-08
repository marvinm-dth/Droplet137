// labelPrinter.js
// ─────────────────────────────────────────────────────────────────────────────
// npm i express @supabase/supabase-js qrcode pdfkit dotenv canvas
// ─────────────────────────────────────────────────────────────────────────────

const express         = require("express");
const { createClient }= require("@supabase/supabase-js");
const QRCode          = require("qrcode");
const PDFDocument     = require("pdfkit");
const fs              = require("fs");
const path            = require("path");
const { createCanvas, loadImage, registerFont } = require("canvas");
require("dotenv").config();

/* ─── ONE-TIME font registration (Inter already installed system-wide) ─── */

const INTER_DIR = "/usr/local/share/fonts/inter";      // path from CLI setup
registerFont(path.join(INTER_DIR, "Inter-Regular.ttf"), { family: "Inter", weight: "normal" });
registerFont(path.join(INTER_DIR, "Inter-Bold.ttf"),    { family: "Inter", weight: "bold" });

PDFDocument.prototype._fontkit.registerFont(
  "Inter",
  fs.readFileSync(path.join(INTER_DIR, "Inter-Regular.ttf"))
);
PDFDocument.prototype._fontkit.registerFont(
  "Inter-Bold",
  fs.readFileSync(path.join(INTER_DIR, "Inter-Bold.ttf"))
);
console.log("✓  Inter 400/700 registered for node-canvas & PDFKit");

/* ─── App / constants ─────────────────────────────────────────────────────── */

const app  = express();
const port = process.env.PORT || 50;

const DPI   = 203;               // 203-dpi printer
const PX_W  = 2 * DPI;           // 406 px (2 in)
const PX_H  = 1 * DPI;           // 203 px (1 in)
const PT_W  = 2 * 72;            // 144 pt (PDF)
const PT_H  = 1 * 72;            //  72 pt

const supabase = createClient(
  "http://137.184.148.164:8000",
  process.env.SUPABASE_ANON_KEY
);

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function ensureDirectoryExists(p){
  const d = path.dirname(p);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

/* ─── Element definitions ───────────────────────────────────────────────────
   weight: 700 = bold, 400 = regular
   fontSize values are in *label-height fractions* (e.g. 0.26 × 203 ≈ 52 px) */
const elementsConfig = [
  { name:"sidebar",  type:"text", text:"DTH ITEM", weight:700, fontSize:0.26,
    fontColor:"#000", fillColor:"#fff",
    bounds:{width:0.50,height:1}, position:{x:0,y:1}, rotation:270 },

  { name:"item_name",type:"text", table:"home_depot_items", lookupColumn:"material_id",
    returnColumn:"item_desc", truncate:20,
    weight:400, fontSize:0.12, fontColor:"#000",
    bounds:{width:0.55,height:0.30}, position:{x:0.12,y:0.05} },

  { name:"order_id", type:"text", table:"home_depot_order_history",
    lookupColumn:"order_id", returnColumn:"order_id",
    weight:400, fontSize:0.12, fontColor:"#000",
    bounds:{width:0.55,height:0.12}, position:{x:0.12,y:0.65} },

  { name:"sku",      type:"text", table:"home_depot_items", lookupColumn:"material_id",
    returnColumn:"internal_sku", fallbackColumn:"temp_internal_sku", generateFallback:true,
    weight:400, fontSize:0.12, fontColor:"#000",
    bounds:{width:0.55,height:0.12}, position:{x:0.12,y:0.78} },

  { name:"location", type:"text", text:"Bay 1 | Shelf 4 | Bin 18",
    weight:400, fontSize:0.09, fontColor:"#000",
    bounds:{width:0.55,height:0.12}, position:{x:0.12,y:0.90} },

  { name:"qr_code",  type:"qr", sourceElement:"sku",
    bounds:{width:0.40,height:0.70}, position:{x:0.60,y:0.00} },

  { name:"divider",  type:"line", orientation:"vertical",
    position:{x:0.11,y:0.03}, length:0.94, thickness:2, color:"#000", style:"solid" }
];

/* ─── Data lookup ─────────────────────────────────────────────────────────── */

async function fetchElementData(el, lookup) {
  if (!el.table) return el.text || "";

  const { data } = await supabase.from(el.table)
    .select(el.returnColumn)
    .eq(el.lookupColumn, lookup)
    .single();

  let val = data?.[el.returnColumn] || "";

  if (!val && el.fallbackColumn) {
    const { data: fb } = await supabase.from(el.table)
      .select(el.fallbackColumn)
      .eq(el.lookupColumn, lookup)
      .single();
    val = fb?.[el.fallbackColumn] || "";
  }

  if (!val && el.generateFallback) {
    val = `DTH${Math.floor(1e7 + Math.random()*9e7)}`;
    await supabase.from(el.table)
      .update({ [el.fallbackColumn]: val })
      .eq(el.lookupColumn, lookup);
  }

  if (el.truncate && val.length > el.truncate) val = val.slice(0, el.truncate);
  return val;
}

/* ─── Canvas renderer ─────────────────────────────────────────────────────── */

async function drawElements(ctx, cfg, order){
  ctx.textBaseline = "top";
  ctx.textAlign    = "left";

  for (const el of cfg) {
    const x = el.position.x * PX_W;
    const y = el.position.y * PX_H;
    const w = (el.bounds?.width  || 0) * PX_W;
    const h = (el.bounds?.height || 0) * PX_H;

    const text = await fetchElementData(el, order[el.lookupColumn]);
    switch (el.type) {

      case "box":
        if (el.fillColor){ ctx.fillStyle = el.fillColor; ctx.fillRect(x,y,w,h); }
        if (el.outlineColor){
          ctx.strokeStyle = el.outlineColor; ctx.lineWidth = el.outlineThickness||1;
          ctx.strokeRect(x,y,w,h);
        }
        break;

      case "text":
        if (el.fillColor){ ctx.fillStyle = el.fillColor; ctx.fillRect(x,y,w,h); }
        ctx.save();
        ctx.fillStyle = el.fontColor;
        ctx.font = `${el.weight===700?"bold":"normal"} ${el.fontSize*PX_H}px "Inter"`;
        if (el.rotation){
          ctx.translate(x,y); ctx.rotate(el.rotation*Math.PI/180);
          ctx.fillText(text, 0, 0, w);
        } else {
          ctx.fillText(text, x, y, w);
        }
        ctx.restore();
        break;

      case "qr":
        const buf = await QRCode.toBuffer(text || "UNKNOWN", { type:"png" });
        ctx.drawImage(await loadImage(buf), x, y, w, h);
        break;

      case "line":
        ctx.save();
        ctx.strokeStyle = el.color; ctx.lineWidth = el.thickness;
        if (el.style==="dashed") ctx.setLineDash([3,3]);
        ctx.beginPath();
        el.orientation==="vertical"
          ? (ctx.moveTo(x,y), ctx.lineTo(x, y + el.length*PX_H))
          : (ctx.moveTo(x,y), ctx.lineTo(x + el.length*PX_W, y));
        ctx.stroke(); ctx.restore();
        break;
    }
  }
}

/* ─── PNG generation ─────────────────────────────────────────────────────── */

async function makePNGBuffers(order){
  const out=[];
  for (let i=0;i<order.order_qty_requested;i++){
    const c=createCanvas(PX_W,PX_H);
    const g=c.getContext("2d");
    g.fillStyle="#fff"; g.fillRect(0,0,PX_W,PX_H);
    await drawElements(g, elementsConfig, order);
    out.push(c.toBuffer("image/png"));
  }
  return out;
}

/* ─── PDF bundler ─────────────────────────────────────────────────────────── */

async function makePDF(bufs, orderId){
  const fp = path.join("pdf", `${orderId}.pdf`);
  ensureDirectoryExists(fp);

  const doc  = new PDFDocument({ size:[PT_W,PT_H], margin:0 });
  const file = fs.createWriteStream(fp); doc.pipe(file);

  doc.font("Inter").fontSize(8);           // ensures Inter is embedded
  bufs.forEach((b,i)=>{
    if(i) doc.addPage({ size:[PT_W,PT_H], margin:0 });
    doc.image(b, 0, 0);                    // full-bleed
  });

  doc.end();
  await new Promise(r=>file.on("finish", r));
  return fp;
}

/* ─── Print bridge ─────────────────────────────────────────────────────────── */

async function sendToPrinter(bufs){
  const url="http://137.184.148.164:5090/api/print-image";
  for (const b of bufs){
    const res = await fetch(url, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ imageData:`data:image/png;base64,${b.toString("base64")}`, cut:true })
    });
    if(!res.ok) console.error("Print API error:", await res.text());
  }
}

/* ─── Poll loop ───────────────────────────────────────────────────────────── */

async function poll(){
  const { data:orders, error } = await supabase.from("home_depot_order_history")
      .select("order_id,order_qty_requested,material_id")
      .is("label_pdf_url", null);

  if(error){ console.error("DB error:", error); return; }

  for (const o of orders){
    try{
      console.log("→", o.order_id);
      const bufs = await makePNGBuffers(o);
      const pdf  = await makePDF(bufs, o.order_id);
      await sendToPrinter(bufs);

      await supabase.from("home_depot_order_history")
        .update({ label_pdf_url: pdf })
        .eq("order_id", o.order_id);

      console.log(`✓ Printed ${bufs.length} labels for ${o.order_id}`);
    }catch(e){ console.error("Error with", o.order_id, e); }
  }
}

setInterval(poll, 2000);
app.listen(port, () => console.log("Label printer listening on", port));
