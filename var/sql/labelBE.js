// labelPrinter.js —  node labelPrinter.js
// ───────────────────────────────────────────────────────────────────────────
// npm i express @supabase/supabase-js qrcode pdfkit dotenv canvas cors lodash.merge
// ───────────────────────────────────────────────────────────────────────────

const express  = require('express');
const cors     = require('cors');
const { createClient } = require('@supabase/supabase-js');
const QRCode   = require('qrcode');
const PDFKit   = require('pdfkit');
const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');
const merge    = require('lodash.merge');
const { createCanvas, loadImage, registerFont } = require('canvas');
require('dotenv').config();

/* ── Fonts ─────────────────────────────────────────────────────────────── */
const INTER_DIR   = '/usr/local/share/fonts/truetype/inter';
const REGULAR_TTF = path.join(INTER_DIR, 'Inter-Regular.ttf');
const BOLD_TTF    = path.join(INTER_DIR, 'Inter-Bold.ttf');
[REGULAR_TTF, BOLD_TTF].forEach(p=>{
  if(!fs.existsSync(p)){ console.error(`❌ Missing font ${p}`); process.exit(1);}
});
registerFont(REGULAR_TTF,{ family:'Inter', weight:'normal' });
registerFont(BOLD_TTF,   { family:'Inter', weight:'bold'   });
const PDF_FONTS = { Inter: REGULAR_TTF, 'Inter-Bold': BOLD_TTF };

/* ── App + Supabase ─────────────────────────────────────────────────────── */
const app  = express();
const port = process.env.PORT || 50;
app.use(cors());
app.use(express.json({limit:'2mb'}));

const supabase = createClient(
  'http://137.184.148.164:8000',
  process.env.SUPABASE_ANON_KEY
);

/* ── Geometry ──────────────────────────────────────────────────────────── */
const DPI = 203;
const PX_W = 2 * DPI;  // 406
const PX_H = 1 * DPI;  // 203
const PT_W = 144;      // 2 in
const PT_H = 72;       // 1 in

/* ── Master template ───────────────────────────────────────────────────── */
const masterElements = [
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

  /* sku-1 text is supplied per-label (backup_sku)  */
  {name:'sku-1', type:'text', text:'',   // set per label
   weight:'700', fontSize:0.06, fontColor:'black',
   bounds:{width:0.60,height:0.11}, position:{x:0.69,y:0.70}, wrap:false},

  {name:'location', type:'text', text:'Bay 1 | Shelf 4 | Bin 18',
   weight:'700', fontSize:0.11, fontColor:'black',
   bounds:{width:0.55,height:0.12}, position:{x:0.15,y:0.84}, wrap:false},

  /* qr_code text is supplied per-label (sku+uuid) */
  {name:'qr_code', type:'qr', text:'',
   bounds:{width:0.40,height:0.70}, position:{x:0.60,y:0}},

  {name:'divider', type:'line', orientation:'vertical',
   position:{x:0.11,y:0.05}, length:0.94, thickness:4, color:'black'}
];

/* ── Helpers ───────────────────────────────────────────────────────────── */
function ensureDir(fp){ const d=path.dirname(fp); if(!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true}); }
const rand7 = () => String( Math.floor(1000000 + Math.random()*9000000) );

/* Get next UUID in sequence A00001, A00002, … */
async function nextUuid(){
  const {data, error} = await supabase
       .from('all_items_tracking')
       .select('UUID')
       .not('UUID','is',null)
       .order('id',{ascending:false})
       .limit(1);
  if(error){ console.error('UUID lookup error', error); }
  const last = data?.[0]?.UUID;
  let n = 0;
  if(last && /^A\d{5}$/.test(last)) n = parseInt(last.slice(1));
  n += 1;
  return 'A'+ String(n).padStart(5,'0');
}

/* Fetch element data (unchanged core) */
async function fetchElementData(el,val){
  if(!el.table || !el.returnColumn) return el.text || '';
  const {data}=await supabase.from(el.table).select(el.returnColumn)
                             .eq(el.lookupColumn,val).single();
  let v=data?.[el.returnColumn]||'';
  if(!v && el.fallbackColumn){
    const {data:fb}=await supabase.from(el.table).select(el.fallbackColumn)
                                   .eq(el.lookupColumn,val).single();
    v=fb?.[el.fallbackColumn]||'';
  }
  if(!v && el.generateFallback){
    v='DTH'+Math.floor(1e7+Math.random()*9e7);
    await supabase.from(el.table)
                  .update({[el.fallbackColumn]:v})
                  .eq(el.lookupColumn,val);
  }
  if(el.truncate && typeof v==='string' && v.length>el.truncate)
    v=v.substring(0,el.truncate);
  return v;
}

/* Word-wrap helper (unchanged) */
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

/* Draw elements */
async function drawElements(ctx,cfg,obj){
  ctx.textBaseline='top'; ctx.textAlign='left';
  for(const el of cfg){
    const x=el.position.x*PX_W, y=el.position.y*PX_H,
          w=(el.bounds?.width||0)*PX_W, h=(el.bounds?.height||0)*PX_H;
    const content=await fetchElementData(el,obj[el.lookupColumn]);
    switch(el.type){
      case 'text': {
        if(el.fillColor) { ctx.fillStyle=el.fillColor; ctx.fillRect(x,y,w,h); }
        const meas=createCanvas(1,1).getContext('2d');
        const mkFont=px=>`${el.weight==='700'?'bold ':''}${px}px "Inter"`;
        let px=el.fontSize*PX_H, lines, lh, tries=0;
        do{
          meas.font=mkFont(px);
          lines=el.wrap?wrapGreedy(content,meas,w):[content];
          lh=px*1.2;
          if(!lines.some(l=>meas.measureText(l).width>w) && lines.length*lh<=h) break;
          px-=0.01*PX_H;
        }while(++tries<40 && px>6);
        ctx.save();
        ctx.font=mkFont(px);
        ctx.fillStyle=el.fontColor||'black';
        if(el.rotation){ ctx.translate(x,y); ctx.rotate(el.rotation*Math.PI/180); ctx.translate(-x,-y); }
        lines.forEach((l,i)=>{ if(y+i*lh+lh<=y+h) ctx.fillText(l,x,y+i*lh); });
        ctx.restore();
      } break;

      case 'qr': {
        const buf=await QRCode.toBuffer(content||'UNKNOWN',{type:'png'});
        const img=await loadImage(buf);
        ctx.drawImage(img,x,y,w,h);
      } break;

      case 'line': {
        ctx.save();
        ctx.strokeStyle=el.color||'black';
        ctx.lineWidth=el.thickness||1;
        ctx.beginPath();
        el.orientation==='vertical'
          ? (ctx.moveTo(x,y), ctx.lineTo(x,y+el.length*PX_H))
          : (ctx.moveTo(x,y), ctx.lineTo(x+el.length*PX_W,y));
        ctx.stroke(); ctx.restore();
      } break;
    }
  }
}

/* Create one PNG & insert one row, return buffer */
async function buildLabel({
  order, internalSku, externalSku, itemDesc
}){
  const uuid      = await nextUuid();
  const backupSku = rand7();
  const qrData    = internalSku + uuid;

  /* clone & customise template for this label */
  const cfg = JSON.parse(JSON.stringify(masterElements));
  cfg.find(e=>e.name==='sku-1').text   = backupSku;
  cfg.find(e=>e.name==='qr_code').text = qrData;

  const canvas = createCanvas(PX_W,PX_H);
  const ctx    = canvas.getContext('2d');
  ctx.fillStyle='white';
  ctx.fillRect(0,0,PX_W,PX_H);
  await drawElements(ctx,cfg,order);
  const buf = canvas.toBuffer('image/png');

  /* insert tracking row */
  const row = {
    external_sku : externalSku,
    internal_sku : internalSku,
    backup_sku   : backupSku,
    item_desc    : itemDesc,
    label_size   : '2x1',
    order_number : order.order_id,
    status       : 'ordered',
    ordered_at   : new Date().toISOString(),
    UUID         : uuid
  };
  const { error:insErr } = await supabase.from('all_items_tracking').insert(row);
  if(insErr) console.error('Tracking insert failed', insErr);

  return buf;
}

/* Build *all* labels for an order */
async function buildLabelsForOrder(order){
  /* Pull item metadata once per order */
  const {data:item,error} = await supabase
      .from('home_depot_items')
      .select('internal_sku,temp_internal_sku,sku_number,internet_sku_number,item_desc')
      .eq('material_id', order.material_id)
      .single();
  if(error){ console.error('Item lookup failed',error); return []; }

  const internalSku = item?.internal_sku || item?.temp_internal_sku || '';
  const externalSku = item?.sku_number   || item?.internet_sku_number || null;
  const itemDesc    = item?.item_desc    || '';

  const buffers=[];
  for(let i=0;i<order.order_qty_requested;i++){
    buffers.push(await buildLabel({order,internalSku,externalSku,itemDesc}));
  }
  return buffers;
}

/* Package PDF (same 95 % scale) */
async function createPdf(bufs,id){
  const fp=path.join('pdf',`${id}.pdf`);
  ensureDir(fp);
  const SCALE=0.95, newW=PT_W*SCALE, newH=PT_H*SCALE;
  const offX=PT_W-newW, offY=PT_H-newH;

  const doc=new PDFKit({size:[PT_W,PT_H],margin:0});
  for(const [n,f] of Object.entries(PDF_FONTS)) doc.registerFont(n,f);
  const st=fs.createWriteStream(fp); doc.pipe(st);

  bufs.forEach((b,i)=>{ if(i) doc.addPage(); doc.image(b,offX,offY,{width:newW,height:newH});});
  doc.end();
  await new Promise(r=>st.on('finish',r));
  return fp;
}

/* Send to thermal printer */
async function printBuffers(bufs){
  const ep='http://137.184.148.164:5090/api/print-image';
  for(const b of bufs){
    const res=await fetch(ep,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({imageData:`data:image/png;base64,${b.toString('base64')}`,cut:true})});
    if(!res.ok) console.error('Print error:',await res.text());
  }
}

/* Poll & process orders *************************************************** */
async function poll(){
  const {data:orders,error}=await supabase
      .from('home_depot_order_history')
      .select('order_id,order_qty_requested,material_id')
      .is('label_pdf_url',null);
  if(error){ console.error(error); return; }

  for(const o of orders){
    try{
      console.log('Processing order',o.order_id);
      const bufs = await buildLabelsForOrder(o);
      if(!bufs.length){ console.error('No labels built'); continue; }

      const pdf  = await createPdf(bufs,o.order_id);
      await printBuffers(bufs);

      await supabase.from('home_depot_order_history')
                    .update({label_pdf_url:pdf})
                    .eq('order_id',o.order_id);
    }catch(e){ console.error(e); }
  }
}
setInterval(poll,2000);

/* REST preview & config endpoints (unchanged except using masterElements) */
app.get('/elements-config',(_,r)=>r.json(masterElements));
app.put('/elements-config',(q,r)=>{
  if(!Array.isArray(q.body)) return r.status(400).json({error:'Body must be array'});
  masterElements.length=0; masterElements.push(...q.body);
  r.json({ok:true,count:masterElements.length});
});
app.patch('/elements-config/:name',(q,r)=>{
  const i=masterElements.findIndex(e=>e.name===q.params.name);
  if(i===-1) return r.status(404).json({error:'Not found'});
  masterElements[i]=merge({},masterElements[i],q.body);
  r.json(masterElements[i]);
});
app.listen(port,()=>console.log(`Label printer running on :${port}`));
