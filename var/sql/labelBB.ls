// labelPrinter.js — run:  node labelPrinter.js
// ───────────────────────────────────────────────────────────────────────────
// npm i express @supabase/supabase-js qrcode pdfkit dotenv canvas cors lodash.merge
// ───────────────────────────────────────────────────────────────────────────

const express = require('express');
const cors    = require('cors');
const { createClient } = require('@supabase/supabase-js');
const QRCode  = require('qrcode');
const PDFDocument = require('pdfkit');
const fs    = require('fs');
const path  = require('path');
const merge = require('lodash.merge');
const { createCanvas, loadImage, registerFont } = require('canvas');
const crypto = require('crypto');
require('dotenv').config();

// ─── Fonts ────────────────────────────────────────────────────────────────
const INTER_DIR   = '/usr/local/share/fonts/truetype/inter';
const REGULAR_TTF = path.join(INTER_DIR, 'Inter-Regular.ttf');
const BOLD_TTF    = path.join(INTER_DIR, 'Inter-Bold.ttf');
[REGULAR_TTF, BOLD_TTF].forEach(p=>{
  if(!fs.existsSync(p)){ console.error(`❌ Missing font: ${p}`); process.exit(1); }
});
registerFont(REGULAR_TTF,{ family:'Inter', weight:'normal' });
registerFont(BOLD_TTF,   { family:'Inter', weight:'bold'   });
const PDF_FONTS = { Inter: REGULAR_TTF, 'Inter-Bold': BOLD_TTF };
console.log('✓  Inter fonts loaded');

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

// ─── Template ─────────────────────────────────────────────────────────────
let elementsConfig = [
  {name:'sidebar', type:'text', text:'DTH ITEM', weight:'700', fontSize:0.20,
   fontColor:'black', fillColor:'white',
   bounds:{width:0.50,height:1}, position:{x:0,y:1}, rotation:270, wrap:false},

  {name:'item_name', type:'text', table:'home_depot_items',
   lookupColumn:'material_id', returnColumn:'item_desc',
   truncate:100, weight:'700', fontSize:0.14, fontColor:'black',
   bounds:{width:0.45,height:0.45}, position:{x:0.15,y:0.05}, wrap:true},

  {name:'order_id', type:'text', table:'home_depot_order_history',
   lookupColumn:'order_id', returnColumn:'order_id',
   weight:'700', fontSize:0.14, fontColor:'black',
   bounds:{width:0.55,height:0.12}, position:{x:0.15,y:0.52}, wrap:false},

  {name:'sku', type:'text', table:'home_depot_items',
   lookupColumn:'material_id', returnColumn:'internal_sku',
   fallbackColumn:'temp_internal_sku', generateFallback:true,
   weight:'700', fontSize:0.13, fontColor:'black',
   bounds:{width:0.60,height:0.11}, position:{x:0.15,y:0.66}, wrap:false},

  {name:'sku-1', type:'text', table:'home_depot_items',
   lookupColumn:'material_id', returnColumn:'internal_sku',
   fallbackColumn:'temp_internal_sku', generateFallback:true,
   weight:'700', fontSize:0.06, fontColor:'black',
   bounds:{width:0.60,height:0.11}, position:{x:0.69,y:0.70}, wrap:false},

  {name:'location', type:'text', text:'Bay 1 | Shelf 4 | Bin 18',
   weight:'700', fontSize:0.11, fontColor:'black',
   bounds:{width:0.55,height:0.12}, position:{x:0.15,y:0.84}, wrap:false},

  {name:'qr_code', type:'qr', sourceElement:'sku',
   bounds:{width:0.40,height:0.70}, position:{x:0.60,y:0}},

  {name:'divider', type:'line', orientation:'vertical',
   position:{x:0.11,y:0.05}, length:0.94, thickness:4, color:'black', style:'solid'}
];

// ─── Runtime state ────────────────────────────────────────────────────────
let lastOrder=null, lastBuffers=[], lastPdfPath=null;

// ─── Helpers ──────────────────────────────────────────────────────────────
function ensureDirectoryExists(fp){ const d=path.dirname(fp); if(!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true}); }

function generateShortUUID(){
  // Returns an 8‑char hex string (good balance of uniqueness & compactness for tiny QR)
  return crypto.randomUUID().split('-')[0];
}

// ─── Data fetch helper ────────────────────────────────────────────────────
async function fetchElementData(el,val){
  if(!el.table || !el.returnColumn) return el.text || '';
  const {data}=await supabase.from(el.table).select(el.returnColumn).eq(el.lookupColumn,val).single();
  let v=data?.[el.returnColumn]||'';
  if(!v && el.fallbackColumn){
    const {data:fb}=await supabase.from(el.table).select(el.fallbackColumn).eq(el.lookupColumn,val).single();
    v=fb?.[el.fallbackColumn]||'';
  }
  if(!v && el.generateFallback){
    v='DTH'+Math.floor(1e7+Math.random()*9e7);
    await supabase.from(el.table).update({[el.fallbackColumn]:v}).eq(el.lookupColumn,val);
  }
  if(el.truncate && typeof v==='string' && v.length>el.truncate) v=v.substring(0,el.truncate);
  return v;
}

// ─── Word-wrap helper (measure-only) ───────────────────────────────────────
function wrapGreedy(text, measCtx, maxW){
  if(!text) return [''];
  const words=text.split(/\s+/); const out=[];
  while(words.length){
    let line=words.shift();
    while(words.length && measCtx.measureText(`${line} ${words[0]}`).width<=maxW){
      line+=' '+words.shift();
    }
    out.push(line);
  }
  return out;
}

// ─── ALL ITEMS TRACKING helper ────────────────────────────────────────────
async function insertTrackingRows(order){
  // Fetch metadata for the item once (desc, sku, etc.)
  const { data: itemMeta } = await supabase
    .from('home_depot_items')
    .select('internal_sku,temp_internal_sku,item_desc')
    .eq('material_id', order.material_id)
    .single();

  const internalSku = itemMeta?.internal_sku || itemMeta?.temp_internal_sku || null;
  const itemDesc    = itemMeta?.item_desc || null;

  // Build rows equal to quantity requested
  const rows = Array.from({ length: order.order_qty_requested }).map(() => ({
    external_sku: null,                  // Unknown at this stage
    internal_sku: internalSku,
    UUID: generateShortUUID(),
    item_name: itemDesc,                // Assuming name is same as description
    item_desc: itemDesc,
    label_size: '2x1',
    order_number: order.order_id,
    status: 'queued',                   // Initial status; update later if needed
    ordered_at: new Date().toISOString(),
    received_at: null,
    missing_flagged_at: null,
    location: null
  }));

  // Bulk insert
  if(rows.length){
    const { error } = await supabase.from('all_items_tracking').insert(rows);
    if(error) console.error('Tracking insert error:', error.message);
  }
}

// ─── Element drawing ──────────────────────────────────────────────────────
async function drawElements(ctx,cfg,obj){
  ctx.textBaseline='top'; ctx.textAlign='left';

  for(const el of cfg){
    const x=el.position.x*PX_W, y=el.position.y*PX_H,
          w=(el.bounds?.width||0)*PX_W, h=(el.bounds?.height||0)*PX_H;
    const content=await fetchElementData(el,obj[el.lookupColumn]); obj[el.name]=content;

    switch(el.type){
      case 'text': {
        if(el.fillColor){ ctx.fillStyle=el.fillColor; ctx.fillRect(x,y,w,h); }
        const meas=createCanvas(1,1).getContext('2d');
        const mkFont=px=>`${el.weight==='700'?'bold ':''}${px}px "Inter"`;
        let px=el.fontSize*PX_H, lines, lh, tries=0;

        do{
          meas.font=mkFont(px);
          lines=el.wrap?wrapGreedy(content,meas,w):[content];
          lh=px*1.2;
          const badWidth=lines.some(l=>meas.measureText(l).width>w);
          const badHeight=lines.length*lh>h;
          if(!badWidth && !badHeight) break;
          px-=0.01*PX_H;
        }while(++tries<40 && px>6);

        ctx.save();
        ctx.font=mkFont(px);
        ctx.fillStyle=el.fontColor||'black';
        if(el.rotation){ ctx.translate(x,y); ctx.rotate(el.rotation*Math.PI/180); ctx.translate(-x,-y); }
        for(let i=0;i<lines.length;i++){
          const ly=y+i*lh;
          if(i>0 && ly+lh>y+h) break;
          ctx.fillText(lines[i],x,ly);
        }
        ctx.restore();
      } break;

      case 'qr': {
        const buf=await QRCode.toBuffer(content||'UNKNOWN',{type:'png'});
        const img=await loadImage(buf);
        ctx.drawImage(img,x,y,w,h);
      } break;

      case 'line': {
        ctx.save();
        ctx.strokeStyle=el.color||'black'; ctx.lineWidth=el.thickness||1;
        if(el.style==='dashed') ctx.setLineDash([3,3]);
        ctx.beginPath();
        el.orientation==='vertical'
          ? (ctx.moveTo(x,y), ctx.lineTo(x,y+el.length*PX_H))
          : (ctx.moveTo(x,y), ctx.lineTo(x+el.length*PX_W,y));
        ctx.stroke(); ctx.restore();
      } break;
    }
  }
}

// ─── PNG render ───────────────────────────────────────────────────────────
async function createImageBuffers(order){
  const bufs=[];
  for(let i=0;i<order.order_qty_requested;i++){
    const canvas=createCanvas(PX_W,PX_H);
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='white'; ctx.fillRect(0,0,PX_W,PX_H);
    await drawElements(ctx,elementsConfig,order);
    bufs.push(canvas.toBuffer('image/png'));
  }
  return bufs;
}

// ─── PDF packaging (95 % scale, anchored lower-right) ─────────────────────
async function createPdf(bufs,id){
  const fp=path.join('pdf',`${id}.pdf`); ensureDirectoryExists(fp);
  const SCALE=0.95, newW=PT_W*SCALE, newH=PT_H*SCALE;
  const offX=PT_W-newW, offY=PT_H-newH;          // lower-right anchor

  const doc=new PDFDocument({size:[PT_W,PT_H],margin:0});
  for(const [n,f] of Object.entries(PDF_FONTS)) doc.registerFont(n,f);
  const st=fs.createWriteStream(fp); doc.pipe(st);

  bufs.forEach((b,i)=>{
    if(i) doc.addPage({size:[PT_W,PT_H],margin:0});
    doc.image(b,offX,offY,{width:newW,height:newH});
  });

  doc.end(); await new Promise(r=>st.on('finish',r));
  return fp;
}

// ─── Print bridge ─────────────────────────────────────────────────────────
async function printBuffers(bufs){
  const ep='http://137.184.148.164:5090/api/print-image';
  for(const b of bufs){
    const res=await fetch(ep,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({imageData:`data:image/png;base64,${b.toString('base64')}`,cut:true})});
    if(!res.ok) console.error('Print error:',await res.text());
  }
}

// ─── Order loop ───────────────────────────────────────────────────────────
async function pollPendingOrders(){
  const {data:orders,error}=await supabase.from('home_depot_order_history')
    .select('order_id,order_qty_requested,material_id')
    .is('label_pdf_url',null);
  if(error){ console.error(error); return; }

  for(const o of orders){
    try{
      console.log('Printing',o.order_id);

      // 1️⃣  Insert tracking rows BEFORE any printing happens
      await insertTrackingRows(o);

      // 2️⃣  Generate and print labels as before
      const bufs=await createImageBuffers(o);
      const pdf =await createPdf(bufs,o.order_id);
      await printBuffers(bufs);

      // 3️⃣  Update order with PDF URL so we don't re‑process
      await supabase.from('home_depot_order_history')
                    .update({label_pdf_url:pdf})
                    .eq('order_id',o.order_id);
      lastOrder=o; lastBuffers=bufs; lastPdfPath=pdf;
    }catch(e){ console.error(e); }
  }
}
setInterval(pollPendingOrders,2000);

// ─── Preview / config REST (unchanged) ─────────────────────────────────────
app.get('/elements-config',(_,r)=>r.json(elementsConfig));
app.put('/elements-config',(q,r)=>{
  if(!Array.isArray(q.body)) return r.status(400).json({error:'Body must be array'});
  elementsConfig=q.body; r.json({ok:true,count:elementsConfig.length});
});
app.patch('/elements-config/:name',(q,r)=>{
  const i=elementsConfig.findIndex(e=>e.name===q.params.name);
  if(i===-1) return r.status(404).json({error:'Not found'});
  elementsConfig[i]=merge({},elementsConfig[i],q.body); r.json(elementsConfig[i]);
});
app.get('/last-order',(_,r)=>lastOrder ? r.json(lastOrder) : r.status(404).json({error:'No order yet'}));
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
app.get('/preview/image/:i?',(q,r)=>{
  const idx=Number(q.params.i||0);
  if(!lastBuffers[idx]) return r.status(404).send('No preview');
  r.type('png').send(lastBuffers[idx]);
});
app.get('/preview/pdf',(_,r)=>{
  if(!lastPdfPath||!fs.existsSync(lastPdfPath)) return r.status(404).send('No PDF');
  r.download(lastPdfPath);
});

// ─── Start server ─────────────────────────────────────────────────────────
app.listen(port,()=>console.log(`Label printer running on :${port}`));
