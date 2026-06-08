// labelPrinter.js  – run:  node labelPrinter.js
// ───────────────────────────────────────────────────────────────────────────
// npm i express @supabase/supabase-js qrcode pdfkit dotenv canvas cors lodash.merge
// ───────────────────────────────────────────────────────────────────────────

const express               = require('express');
const cors                  = require('cors');
const { createClient }      = require('@supabase/supabase-js');
const QRCode                = require('qrcode');
const PDFDocument           = require('pdfkit');
const fs                    = require('fs');
const path                  = require('path');
const merge                 = require('lodash.merge');
const { createCanvas, loadImage, registerFont } = require('canvas');
require('dotenv').config();

// ─── Fonts ────────────────────────────────────────────────────────────────
const INTER_DIR   = '/usr/local/share/fonts/truetype/inter';
const REGULAR_TTF = path.join(INTER_DIR, 'Inter-Regular.ttf');
const BOLD_TTF    = path.join(INTER_DIR, 'Inter-Bold.ttf');
[REGULAR_TTF, BOLD_TTF].forEach(p=>{
  if(!fs.existsSync(p)){ console.error(`❌  Font ${p} missing`); process.exit(1); }
});
registerFont(REGULAR_TTF,{ family:'Inter', weight:'normal' });
registerFont(BOLD_TTF,   { family:'Inter', weight:'bold'   });
const PDF_FONTS = { Inter: REGULAR_TTF, 'Inter-Bold': BOLD_TTF };
console.log('✓  Inter Regular & Bold loaded');

// ─── App + Supabase ───────────────────────────────────────────────────────
const app  = express();
const port = process.env.PORT || 50;
app.use(cors());
app.use(express.json({limit:'2mb'}));

const supabase = createClient(
  'http://137.184.148.164:8000',
  process.env.SUPABASE_ANON_KEY
);

// ─── Geometry ─────────────────────────────────────────────────────────────
const DPI  = 203;
const PX_W = 2 * DPI;   // 406 px
const PX_H = 1 * DPI;   // 203 px
const PT_W = 144;       // 2 in
const PT_H = 72;        // 1 in

// ─── Template (wrap:true only where you want wrapping) ────────────────────
let elementsConfig = [
  {name:'sidebar', type:'text', text:'DTH ITEM', weight:'700', fontSize:0.20, fontColor:'black',
   fillColor:'white', bounds:{width:0.50,height:1}, position:{x:0,y:1}, rotation:270, wrap:false},

  {name:'item_name', type:'text', table:'home_depot_items', lookupColumn:'material_id', returnColumn:'item_desc',
   truncate:50, weight:'700', fontSize:0.14, fontColor:'black',
   bounds:{width:0.55,height:0.30}, position:{x:0.15,y:0.05}, wrap:true},  // ← wraps

  {name:'order_id', type:'text', table:'home_depot_order_history', lookupColumn:'order_id', returnColumn:'order_id',
   weight:'700', fontSize:0.14, fontColor:'black',
   bounds:{width:0.55,height:0.12}, position:{x:0.15,y:0.50}, wrap:false},

  {name:'sku', type:'text', table:'home_depot_items', lookupColumn:'material_id', returnColumn:'internal_sku',
   fallbackColumn:'temp_internal_sku', generateFallback:true, weight:'700', fontSize:0.13, fontColor:'black',
   bounds:{width:0.60,height:0.11}, position:{x:0.15,y:0.65}, wrap:false},

  {name:'location', type:'text', text:'Bay 1 | Shelf 4 | Bin 18', weight:'700', fontSize:0.11, fontColor:'black',
   bounds:{width:0.55,height:0.12}, position:{x:0.15,y:0.85}, wrap:false},

  {name:'qr_code', type:'qr', sourceElement:'sku',
   bounds:{width:0.40,height:0.80}, position:{x:0.60,y:0}},

  {name:'divider', type:'line', orientation:'vertical',
   position:{x:0.11,y:0.05}, length:0.94, thickness:4, color:'black', style:'solid'}
];

// ─── Runtime state ────────────────────────────────────────────────────────
let lastOrder = null;
let lastBuffers = [];
let lastPdfPath = null;

// ─── Helpers ──────────────────────────────────────────────────────────────
function ensureDirectoryExists(fp){
  const d = path.dirname(fp);
  if(!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true});
}

// ─── Data fetch ───────────────────────────────────────────────────────────
async function fetchElementData(el, lookupValue){
  if(!el.table || !el.returnColumn) return el.text || '';

  const {data} = await supabase.from(el.table)
                               .select(el.returnColumn)
                               .eq(el.lookupColumn, lookupValue)
                               .single();
  let v = data?.[el.returnColumn] || '';

  if(!v && el.fallbackColumn){
    const {data:fb} = await supabase.from(el.table)
                                    .select(el.fallbackColumn)
                                    .eq(el.lookupColumn, lookupValue)
                                    .single();
    v = fb?.[el.fallbackColumn] || '';
  }
  if(!v && el.generateFallback){
    v = 'DTH' + Math.floor(1e7 + Math.random()*9e7);
    await supabase.from(el.table)
                  .update({[el.fallbackColumn]: v})
                  .eq(el.lookupColumn, lookupValue);
  }
  if(el.truncate && typeof v==='string' && v.length>el.truncate)
    v = v.substring(0, el.truncate);

  return v;
}

/**
 * Pixel-accurate wrap: builds lines so no character’s pixels overrun `maxW`.
 * Creates an off-screen canvas 1.5× maxW; draws char-by-char to measure width.
 */
function wrapLines(ctx, text, maxW, fontSpec){
  if(!text) return [''];
  // off-screen “imaginary image” 50 % larger
  const off = createCanvas(Math.ceil(maxW*1.5), Math.ceil(parseInt(fontSpec)*1.5));
  const octx = off.getContext('2d');
  octx.font = fontSpec;
  octx.textBaseline='top';
  octx.textAlign='left';

  const lines=[];
  let line='', accW=0;

  for(const ch of text){
    const chW = octx.measureText(ch).width;
    if(accW + chW > maxW && line){        // overflow → new line
      lines.push(line.trimEnd());
      line='';
      accW=0;
    }
    line += ch;
    accW += chW;
  }
  if(line) lines.push(line.trimEnd());
  return lines;
}

// ─── Draw elements ────────────────────────────────────────────────────────
async function drawElements(ctx, cfg, ctxObj){
  ctx.textBaseline='top';
  ctx.textAlign='left';

  for(const el of cfg){
    const x = el.position.x*PX_W,
          y = el.position.y*PX_H,
          w = (el.bounds?.width ||0)*PX_W,
          h = (el.bounds?.height||0)*PX_H;

    const content = await fetchElementData(el, ctxObj[el.lookupColumn]);
    ctxObj[el.name]=content;

    switch(el.type){
      case 'text': {
        if(el.fillColor){ ctx.fillStyle=el.fillColor; ctx.fillRect(x,y,w,h); }

        ctx.save();
        const pxSize = el.fontSize*PX_H;
        const fontSpec = `${el.weight==='700'?'bold ':''}${pxSize}px "Inter"`;
        ctx.font = fontSpec;
        ctx.fillStyle = el.fontColor||'black';

        if(el.rotation){
          ctx.translate(x,y);
          ctx.rotate(el.rotation*Math.PI/180);
          ctx.translate(-x,-y);
        }

        const lines = el.wrap ? wrapLines(ctx,content,w,fontSpec) : [content];
        const lh = pxSize*1.2;
        for(let i=0;i<lines.length;i++){
          const ly = y+i*lh;
          if(i>0 && ly+lh>y+h) break;
          ctx.fillText(lines[i], x, ly);
        }
        ctx.restore();
      } break;

      case 'qr': {
        const qrBuf = await QRCode.toBuffer(content||'UNKNOWN',{type:'png'});
        const img   = await loadImage(qrBuf);
        ctx.drawImage(img,x,y,w,h);
      } break;

      case 'line': {
        ctx.save();
        ctx.strokeStyle=el.color||'black';
        ctx.lineWidth=el.thickness||1;
        if(el.style==='dashed') ctx.setLineDash([3,3]);
        ctx.beginPath();
        el.orientation==='vertical'
          ? (ctx.moveTo(x,y), ctx.lineTo(x,y+el.length*PX_H))
          : (ctx.moveTo(x,y), ctx.lineTo(x+el.length*PX_W,y));
        ctx.stroke();
        ctx.restore();
      } break;
    }
  }
}

// ─── 1  PNG buffers ───────────────────────────────────────────────────────
async function createImageBuffers(order){
  const bufs=[];
  for(let i=0;i<order.order_qty_requested;i++){
    const canvas=createCanvas(PX_W,PX_H);
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='white';
    ctx.fillRect(0,0,PX_W,PX_H);
    await drawElements(ctx,elementsConfig,order);
    bufs.push(canvas.toBuffer('image/png'));
  }
  return bufs;
}

// ─── 2  PDF packaging ─────────────────────────────────────────────────────
async function createPdf(bufs, orderId){
  const filePath=path.join('pdf',`${orderId}.pdf`);
  ensureDirectoryExists(filePath);
  const doc=new PDFDocument({size:[PT_W,PT_H],margin:0});
  Object.entries(PDF_FONTS).forEach(([n,f])=>doc.registerFont(n,f));
  const stream=fs.createWriteStream(filePath); doc.pipe(stream);
  bufs.forEach((b,i)=>{ if(i) doc.addPage({size:[PT_W,PT_H],margin:0}); doc.image(b,0,0,{width:PT_W,height:PT_H}); });
  doc.end();
  await new Promise(r=>stream.on('finish',r));
  return filePath;
}

// ─── 3  Print bridge ──────────────────────────────────────────────────────
async function printBuffers(bufs){
  const endpoint='http://137.184.148.164:5090/api/print-image';
  for(const b of bufs){
    const res = await fetch(endpoint,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({imageData:`data:image/png;base64,${b.toString('base64')}`,cut:true})
    });
    if(!res.ok) console.error('Print API error:',await res.text());
  }
}

// ─── 4  Order polling ─────────────────────────────────────────────────────
async function pollPendingOrders(){
  const {data:orders,error}=await supabase.from('home_depot_order_history')
                                         .select('order_id,order_qty_requested,material_id')
                                         .is('label_pdf_url',null);
  if(error){ console.error('DB fetch error:',error); return; }

  for(const order of orders){
    try{
      console.log('Processing',order.order_id);
      const bufs=await createImageBuffers(order);
      const pdf =await createPdf(bufs,order.order_id);
      await printBuffers(bufs);
      await supabase.from('home_depot_order_history')
                    .update({label_pdf_url:pdf})
                    .eq('order_id',order.order_id);
      lastOrder=order; lastBuffers=bufs; lastPdfPath=pdf;
      console.log('✓ Completed',order.order_id);
    }catch(e){ console.error('Error',order.order_id,e); }
  }
}
setInterval(pollPendingOrders,2000);

// ═══════════════════════════════════════════════════════════════════════════
// REST API (unchanged below) ────────────────────────────────────────────────
app.get('/elements-config',(_,r)=>r.json(elementsConfig));
app.put('/elements-config',(q,r)=>{
  if(!Array.isArray(q.body)) return r.status(400).json({error:'Body must be array'});
  elementsConfig=q.body; r.json({ok:true,count:elementsConfig.length});
});
app.patch('/elements-config/:name',(q,r)=>{
  const i=elementsConfig.findIndex(e=>e.name===q.params.name);
  if(i===-1) return r.status(404).json({error:'Element not found'});
  elementsConfig[i]=merge({},elementsConfig[i],q.body); r.json(elementsConfig[i]);
});
app.get('/last-order',(_,r)=> lastOrder ? r.json(lastOrder) : r.status(404).json({error:'No order yet'}));
app.post('/preview',async(q,r)=>{
  const o=q.body;
  if(!o?.order_id||!o?.material_id||!o?.order_qty_requested)
    return r.status(400).json({error:'order_id, material_id, order_qty_requested required'});
  try{
    const bufs=await createImageBuffers(o);
    const pdf =await createPdf(bufs,`${o.order_id}_preview`);
    lastOrder=o; lastBuffers=bufs; lastPdfPath=pdf;
    r.json({pages:bufs.length,pdf:'/preview/pdf',png:'/preview/image/0'});
  }catch(err){ r.status(500).json({error:String(err)}); }
});
app.get('/preview/image/:index?',(q,r)=>{
  const i=Number(q.params.index||0);
  if(!lastBuffers[i]) return r.status(404).send('No preview');
  r.type('png').send(lastBuffers[i]);
});
app.get('/preview/pdf',(q,r)=>{
  if(!lastPdfPath||!fs.existsSync(lastPdfPath))
    return r.status(404).send('No PDF');
  r.download(lastPdfPath);
});
app.listen(port,()=>console.log('Label printer API on :'+port));
