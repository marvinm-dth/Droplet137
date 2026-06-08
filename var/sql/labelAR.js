// labelPrinter.js
// ─────────────────────────────────────────────────────────────────────────────
// npm i express @supabase/supabase-js qrcode pdfkit dotenv canvas
// ─────────────────────────────────────────────────────────────────────────────

const express  = require("express");
const { createClient } = require("@supabase/supabase-js");
const QRCode   = require("qrcode");
const PDFDocument = require("pdfkit");
const fs       = require("fs");
const path     = require("path");
const { createCanvas, loadImage, registerFont } = require("canvas");
require("dotenv").config();

// ─────────────────────────────────────────────────────────────────────────────
// 1 ▸ Load Inter 400 & 700 from Google Fonts at runtime (no local files)      │
(async function loadWebFonts() {
  const CDN = {
    400: "https://fonts.gstatic.com/s/inter/v13/UcCO3Fwr2OQ.woff2",
    700: "https://fonts.gstatic.com/s/inter/v13/UcC73Fwr2OQ.woff2"
  };
  for (const [w, url] of Object.entries(CDN)) {
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    registerFont(buf, { family: "Inter", weight: w === "700" ? "bold" : "normal" });
  }
  console.log("✓ Inter 400 & 700 ready for node-canvas");
})().catch(e => { console.error("Font load failed:", e); process.exit(1); });
// ─────────────────────────────────────────────────────────────────────────────

const app  = express();
const port = process.env.PORT || 50;

// LABEL DIMENSIONS
const DPI   = 203;
const PX_W  = 2 * DPI;     // 406 px
const PX_H  = 1 * DPI;     // 203 px
const PT_W  = 2 * 72;      // 144 pt
const PT_H  = 1 * 72;      //  72 pt

// Supabase
const supabase = createClient(
  "http://137.184.148.164:8000",
  process.env.SUPABASE_ANON_KEY
);

// Utils
function ensureDirectoryExists(filePath){
  const dir = path.dirname(filePath);
  if(!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Element definitions
const elementsConfig = [
  { name:"sidebar", type:"text", text:"DTH ITEM", weight:700, fontSize:0.26,
    fontColor:"#000", fillColor:"#fff", bounds:{width:0.50,height:1}, position:{x:0,y:1}, rotation:270 },

  { name:"item_name", type:"text", table:"home_depot_items", lookupColumn:"material_id",
    returnColumn:"item_desc", truncate:20, weight:400, fontSize:0.12, fontColor:"#000",
    bounds:{width:0.55,height:0.3}, position:{x:0.12,y:0.05} },

  { name:"order_id", type:"text", table:"home_depot_order_history",
    lookupColumn:"order_id", returnColumn:"order_id",
    weight:400, fontSize:0.12, fontColor:"#000",
    bounds:{width:0.55,height:0.12}, position:{x:0.12,y:0.65} },

  { name:"sku", type:"text", table:"home_depot_items", lookupColumn:"material_id",
    returnColumn:"internal_sku", fallbackColumn:"temp_internal_sku", generateFallback:true,
    weight:400, fontSize:0.12, fontColor:"#000",
    bounds:{width:0.55,height:0.12}, position:{x:0.12,y:0.78} },

  { name:"location", type:"text", text:"Bay 1 | Shelf 4 | Bin 18",
    weight:400, fontSize:0.09, fontColor:"#000",
    bounds:{width:0.55,height:0.12}, position:{x:0.12,y:0.90} },

  { name:"qr_code", type:"qr", sourceElement:"sku",
    bounds:{width:0.40,height:0.70}, position:{x:0.60,y:0} },

  { name:"divider", type:"line", orientation:"vertical",
    position:{x:0.11,y:0.03}, length:0.94, thickness:2, color:"#000", style:"solid" }
];

// Fetch data helper
async function fetchElementData(el, lookupValue){
  if(!el.table || !el.returnColumn) return el.text || "";
  const { data } = await supabase.from(el.table)
      .select(el.returnColumn)
      .eq(el.lookupColumn, lookupValue)
      .single();
  let val = data?.[el.returnColumn] || "";

  if(!val && el.fallbackColumn){
    const { data: fb } = await supabase.from(el.table)
        .select(el.fallbackColumn)
        .eq(el.lookupColumn, lookupValue)
        .single();
    val = fb?.[el.fallbackColumn] || "";
  }
  if(!val && el.generateFallback){
    val = `DTH${Math.floor(1e7 + Math.random()*9e7)}`;
    await supabase.from(el.table)
      .update({ [el.fallbackColumn]: val })
      .eq(el.lookupColumn, lookupValue);
  }
  if(el.truncate && typeof val==="string" && val.length>el.truncate)
    val = val.substring(0, el.truncate);
  return val;
}

// Draw elements on canvas
async function drawElements(ctx,cfg,ctxObj){
  ctx.textBaseline="top";ctx.textAlign="left";
  for(const el of cfg){
    const x = el.position.x*PX_W, y = el.position.y*PX_H,
          w = (el.bounds?.width ||0)*PX_W, h = (el.bounds?.height||0)*PX_H;
    const txt = await fetchElementData(el,ctxObj[el.lookupColumn]); ctxObj[el.name]=txt;

    switch(el.type){
      case "box":
        if(el.fillColor){ctx.fillStyle=el.fillColor;ctx.fillRect(x,y,w,h);}
        if(el.outlineColor){ctx.strokeStyle=el.outlineColor;ctx.lineWidth=el.outlineThickness||1;ctx.strokeRect(x,y,w,h);}
        break;

      case "text":
        if(el.fillColor){ctx.fillStyle=el.fillColor;ctx.fillRect(x,y,w,h);}
        ctx.save();
        ctx.fillStyle=el.fontColor;
        ctx.font=`${el.weight===700?"bold":"normal"} ${el.fontSize*PX_H}px "Inter"`;
        if(el.rotation){
          ctx.translate(x,y);ctx.rotate(el.rotation*Math.PI/180);ctx.fillText(txt,0,0,w);
        }else ctx.fillText(txt,x,y,w);
        ctx.restore();
        break;

      case "qr":
        const buf = await QRCode.toBuffer(txt||"UNKNOWN",{type:"png"});
        ctx.drawImage(await loadImage(buf),x,y,w,h); break;

      case "line":
        ctx.save();
        ctx.strokeStyle=el.color; ctx.lineWidth=el.thickness;
        if(el.style==="dashed") ctx.setLineDash([3,3]);
        ctx.beginPath();
        el.orientation==="vertical"
          ? (ctx.moveTo(x,y),ctx.lineTo(x,y+el.length*PX_H))
          : (ctx.moveTo(x,y),ctx.lineTo(x+el.length*PX_W,y));
        ctx.stroke(); ctx.restore(); break;
    }
  }
}

// Create PNG buffer(s)
async function createImageBuffers(order){
  const out=[];
  for(let i=0;i<order.order_qty_requested;i++){
    const c=createCanvas(PX_W,PX_H), g=c.getContext("2d");
    g.fillStyle="#fff";g.fillRect(0,0,PX_W,PX_H);
    await drawElements(g,elementsConfig,order);
    out.push(c.toBuffer("image/png"));
  }
  return out;
}

// Convert buffers to PDF
async function createPdf(bufs,orderId){
  const fp=path.join("pdf",`${orderId}.pdf`); ensureDirectoryExists(fp);
  const doc=new PDFDocument({size:[PT_W,PT_H],margin:0});
  const s=fs.createWriteStream(fp); doc.pipe(s);
  bufs.forEach((b,i)=>{ if(i)doc.addPage({size:[PT_W,PT_H],margin:0}); doc.image(b,0,0); });
  doc.end(); await new Promise(r=>s.on("finish",r)); return fp;
}

// Print
async function printBuffers(bufs){
  const endpoint="http://137.184.148.164:5090/api/print-image";
  for(const b of bufs){
    const res = await fetch(endpoint,{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ imageData:"data:image/png;base64,"+b.toString("base64"), cut:true })
    });
    if(!res.ok) console.error("Print API error:",await res.text());
  }
}

// Poll loop
async function pollPendingOrders(){
  const { data:orders,error } = await supabase.from("home_depot_order_history")
      .select("order_id,order_qty_requested,material_id")
      .is("label_pdf_url",null);
  if(error){console.error("DB fetch error:",error);return;}

  for(const o of orders){
    try{
      console.log("Processing",o.order_id);
      const bufs = await createImageBuffers(o);
      const pdf  = await createPdf(bufs,o.order_id);
      await printBuffers(bufs);
      await supabase.from("home_depot_order_history")
        .update({ label_pdf_url: pdf })
        .eq("order_id",o.order_id);
      console.log(`✓ Done order ${o.order_id}`);
    }catch(e){console.error("Error on",o.order_id,e);}
  }
}

setInterval(pollPendingOrders,2000);
app.listen(port,()=>console.log("Label printer listening on",port));
