// labelPrinter.js
// ─────────────────────────────────────────────────────────────────────────────
// npm i express @supabase/supabase-js qrcode pdfkit dotenv canvas
// ─────────────────────────────────────────────────────────────────────────────

const express               = require('express');
const { createClient }      = require('@supabase/supabase-js');
const QRCode                = require('qrcode');
const PDFDocument           = require('pdfkit');
const fs                    = require('fs');
const path                  = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');
require('dotenv').config();

// ─── Fonts (identical glyph metrics to browser’s Inter 400/700) ─────────────
const INTER_DIR   = '/usr/local/share/fonts/truetype/inter';
const REGULAR_TTF = path.join(INTER_DIR, 'Inter-Regular.ttf');
const BOLD_TTF    = path.join(INTER_DIR, 'Inter-Bold.ttf');
[REGULAR_TTF, BOLD_TTF].forEach(p => { if(!fs.existsSync(p)){ console.error(`❌  Font ${p} missing`); process.exit(1);} });

registerFont(REGULAR_TTF,{ family:'Inter', weight:'normal' });  // node-canvas bold switch depends on separate face :contentReference[oaicite:3]{index=3}
registerFont(BOLD_TTF,   { family:'Inter', weight:'bold'   });

const PDF_FONTS={ Inter:REGULAR_TTF,'Inter-Bold':BOLD_TTF };
console.log('✓  Inter Regular & Bold loaded for canvas & PDFKit');

// ─── App + Supabase ─────────────────────────────────────────────────────────
const app  = express();
const port = process.env.PORT || 50;
const supabase = createClient('http://137.184.148.164:8000',process.env.SUPABASE_ANON_KEY);

// ─── Geometry constants (203 DPI → 406 × 203 px, 144 × 72 pt) ───────────────
const DPI=203, PX_W=2*DPI, PX_H=1*DPI, PT_W=144, PT_H=72;

// ─── Helpers ────────────────────────────────────────────────────────────────
function ensureDirectoryExists(fp){ const d=path.dirname(fp); if(!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true}); }

// ─── Element definitions (weight flag mirrors browser) ─────────────────────
const elementsConfig=[
  {name:'sidebar', type:'text', text:'DTH ITEM', weight:'700', fontSize:0.26, fontColor:'black', fillColor:'white', bounds:{width:0.5,height:1}, position:{x:0,y:1}, rotation:270 },
  {name:'item_name',type:'text',table:'home_depot_items',lookupColumn:'material_id',returnColumn:'item_desc',truncate:20,weight:'400',fontSize:0.12,fontColor:'black',bounds:{width:0.55,height:0.3},position:{x:0.12,y:0.05}},
  {name:'order_id', type:'text',table:'home_depot_order_history',lookupColumn:'order_id',returnColumn:'order_id',weight:'400',fontSize:0.12,fontColor:'black',bounds:{width:0.55,height:0.12},position:{x:0.12,y:0.65}},
  {name:'sku',      type:'text',table:'home_depot_items',lookupColumn:'material_id',returnColumn:'internal_sku',fallbackColumn:'temp_internal_sku',generateFallback:true,weight:'400',fontSize:0.12,fontColor:'black',bounds:{width:0.55,height:0.12},position:{x:0.12,y:0.78}},
  {name:'location', type:'text',text:'Bay 1 | Shelf 4 | Bin 18',weight:'400',fontSize:0.09,fontColor:'black',bounds:{width:0.55,height:0.12},position:{x:0.12,y:0.90}},
  {name:'qr_code',  type:'qr', sourceElement:'sku',bounds:{width:0.4,height:0.7},position:{x:0.60,y:0}},
  {name:'divider',  type:'line',orientation:'vertical',position:{x:0.11,y:0.03},length:0.94,thickness:2,color:'black',style:'solid'}
];

// ─── Fetch data (unchanged) ─────────────────────────────────────────────────
async function fetchElementData(el, lookupValue){
  if(!el.table||!el.returnColumn) return el.text||'';
  const {data}=await supabase.from(el.table).select(el.returnColumn).eq(el.lookupColumn,lookupValue).single();
  let v=data?.[el.returnColumn]||'';
  if(!v&&el.fallbackColumn){
    const {data:fb}=await supabase.from(el.table).select(el.fallbackColumn).eq(el.lookupColumn,lookupValue).single();
    v=fb?.[el.fallbackColumn]||'';
  }
  if(!v&&el.generateFallback){
    v='DTH'+Math.floor(1e7+Math.random()*9e7);
    await supabase.from(el.table).update({[el.fallbackColumn]:v}).eq(el.lookupColumn,lookupValue);
  }
  if(el.truncate&&typeof v==='string'&&v.length>el.truncate) v=v.substring(0,el.truncate); // browser also truncates now :contentReference[oaicite:4]{index=4}
  return v;
}

// ─── Draw elements (rotation pivot & weight fix) ────────────────────────────
async function drawElements(ctx,cfg,ctxObj){
  ctx.textBaseline='top'; ctx.textAlign='left';
  for(const el of cfg){
    const x=el.position.x*PX_W, y=el.position.y*PX_H,
          w=(el.bounds?.width||0)*PX_W, h=(el.bounds?.height||0)*PX_H;
    const content=await fetchElementData(el,ctxObj[el.lookupColumn]); ctxObj[el.name]=content;

    switch(el.type){
      case 'text':
        if(el.fillColor){ctx.fillStyle=el.fillColor;ctx.fillRect(x,y,w,h);}
        ctx.save();
        ctx.fillStyle=el.fontColor||'black';
        const wt=(el.weight==='700'||el.fontWeight==='bold')?'bold ':'';
        ctx.font=`${wt}${el.fontSize*PX_H}px "Inter"`;
        if(el.rotation){
          ctx.translate(x,y);
          ctx.rotate((el.rotation*Math.PI)/180);
          ctx.translate(-x,-y);                     // match browser pivot :contentReference[oaicite:5]{index=5}
        }
        ctx.fillText(content,x,y,w);
        ctx.restore();
        break;

      case 'qr':
        const qrBuf=await QRCode.toBuffer(content||'UNKNOWN',{type:'png'}); // node-qrcode API :contentReference[oaicite:6]{index=6}
        const img=await loadImage(qrBuf);
        ctx.drawImage(img,x,y,w,h);
        break;

      case 'line':
        ctx.save();
        ctx.strokeStyle=el.color||'black'; ctx.lineWidth=el.thickness||1;
        if(el.style==='dashed') ctx.setLineDash([3,3]);
        ctx.beginPath();
        el.orientation==='vertical' ? (ctx.moveTo(x,y),ctx.lineTo(x,y+el.length*PX_H))
                                    : (ctx.moveTo(x,y),ctx.lineTo(x+el.length*PX_W,y));
        ctx.stroke(); ctx.restore();
        break;

      case 'box':
        if(el.fillColor){ctx.fillStyle=el.fillColor;ctx.fillRect(x,y,w,h);}
        if(el.outlineColor){ctx.strokeStyle=el.outlineColor;ctx.lineWidth=el.outlineThickness||1;ctx.strokeRect(x,y,w,h);}
        break;
    }
  }
}

// ─── 1. Create PNG buffers (unchanged) ──────────────────────────────────────
async function createImageBuffers(order){
  const bufs=[];
  for(let i=0;i<order.order_qty_requested;i++){
    const canvas=createCanvas(PX_W,PX_H), ctx=canvas.getContext('2d');
    ctx.fillStyle='white'; ctx.fillRect(0,0,PX_W,PX_H);
    await drawElements(ctx,elementsConfig,order);
    bufs.push(canvas.toBuffer('image/png'));
  }
  return bufs;
}

// ─── 2. Package buffers into a PDF (unchanged) ──────────────────────────────
async function createPdf(bufs,orderId){
  const filePath=path.join('pdf',`${orderId}.pdf`); ensureDirectoryExists(filePath);
  const doc=new PDFDocument({size:[PT_W,PT_H],margin:0});
  Object.entries(PDF_FONTS).forEach(([n,f])=>doc.registerFont(n,f)); // embed both faces :contentReference[oaicite:7]{index=7}
  const stream=fs.createWriteStream(filePath); doc.pipe(stream);
  bufs.forEach((b,i)=>{ if(i) doc.addPage({size:[PT_W,PT_H],margin:0}); doc.image(b,0,0); });
  doc.end(); await new Promise(r=>stream.on('finish',r)); return filePath;
}

// ─── 3. Send PNGs to the print bridge (unchanged) ──────────────────────────
async function printBuffers(bufs){
  const endpoint='http://137.184.148.164:5090/api/print-image';
  for(const b of bufs){
    const dataUrl='data:image/png;base64,'+b.toString('base64');
    const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageData:dataUrl,cut:true})});
    if(!res.ok) console.error('Print API error:',await res.text());
  }
}

// ─── 4. Poll new orders, render, print, archive (unchanged) ────────────────
async function pollPendingOrders(){
  const {data:orders,error}=await supabase.from('home_depot_order_history').select('order_id,order_qty_requested,material_id').is('label_pdf_url',null);
  if(error) return console.error('DB fetch error:',error);
  for(const order of orders){
    try{
      console.log('Processing order:',order.order_id);
      const bufs=await createImageBuffers(order);
      console.log(` → Rendered ${bufs.length} PNG(s)`);
      const pdfPath=await createPdf(bufs,order.order_id);
      console.log(' → PDF saved:',pdfPath);
      await printBuffers(bufs);
      console.log(` → Printed ${bufs.length} page(s)`);
      await supabase.from('home_depot_order_history').update({label_pdf_url:pdfPath}).eq('order_id',order.order_id);
    }catch(e){ console.error(`Error processing order ${order.order_id}:`,e); }
  }
}

setInterval(pollPendingOrders,2000);
app.listen(port,()=>console.log(`Label printer listening on ${port}`));

