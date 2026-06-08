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

// ─── Fonts (identical glyph metrics to browser’s Inter 400/700) ────────────
const INTER_DIR = '/usr/local/share/fonts/truetype/inter';
const REGULAR_TTF = path.join(INTER_DIR, 'Inter-Regular.ttf');
const BOLD_TTF    = path.join(INTER_DIR, 'Inter-Bold.ttf');
[REGULAR_TTF, BOLD_TTF].forEach(p=>{
  if(!fs.existsSync(p)){ console.error(`❌  Font ${p} missing`); process.exit(1); }
});
registerFont(REGULAR_TTF,{ family:'Inter', weight:'normal' });
registerFont(BOLD_TTF,   { family:'Inter', weight:'bold'   });
const PDF_FONTS = { Inter: REGULAR_TTF, 'Inter-Bold': BOLD_TTF };
console.log('✓  Inter Regular & Bold loaded for canvas & PDFKit');

// ─── App + Supabase ────────────────────────────────────────────────────────
const app  = express();
const port = process.env.PORT || 50;
app.use(cors());
app.use(express.json({limit:'2mb'}));

const supabase = createClient(
  'http://137.184.148.164:8000',
  process.env.SUPABASE_ANON_KEY
);

// ─── Geometry (203 DPI PNG ↔ 144 pt × 72 pt PDF page) ─────────────────────
const DPI  = 203;
const PX_W = 2 * DPI;   // 406 px
const PX_H = 1 * DPI;   // 203 px
const PT_W = 144;       // 2 in
const PT_H = 72;        // 1 in

// ─── Template (editable at runtime) ─────────────────────────────────────────
let elementsConfig = [
  {name:'sidebar', type:'text', text:'DTH ITEM', weight:'700', fontSize:0.20, fontColor:'black', fillColor:'white',
   bounds:{width:0.50,height:1}, position:{x:0,y:1}, rotation:270, wrap:false},

  {name:'item_name', type:'text', table:'home_depot_items', lookupColumn:'material_id', returnColumn:'item_desc',
   truncate:20, weight:'700', fontSize:0.14, fontColor:'black',
   bounds:{width:0.55,height:0.30}, position:{x:0.15,y:0.05}, wrap:true},   // ← wraps

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

// ─── Runtime state (for preview API) ───────────────────────────────────────
let lastOrder   = null;   // {order_id, order_qty_requested, material_id}
let lastBuffers = [];     // PNG buffers of most recent render
let lastPdfPath = null;   // path to most recent PDF

// ─── Helpers ───────────────────────────────────────────────────────────────
function ensureDirectoryExists(fp){
  const dir = path.dirname(fp);
  if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
}

// ─── Fetch element content from DB (or literal) ────────────────────────────
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
 * Word-wrap helper — splits `text` into lines that fit `maxWidth`.
 */
function wrapLines(ctx, text, maxWidth){
  if(!text) return [''];
  const words = text.toString().split(/\s+/);
  const lines = [];
  let line = '';
  for(const w of words){
    const test = line ? line+' '+w : w;
    if(ctx.measureText(test).width <= maxWidth){
      line = test;
    }else{
      if(line) lines.push(line);
      // Hard-split over-wide word
      if(ctx.measureText(w).width > maxWidth){
        let chunk='';
        for(const ch of w){
          const t = chunk+ch;
          if(ctx.measureText(t).width > maxWidth){
            lines.push(chunk);
            chunk = ch;
          }else chunk = t;
        }
        line = chunk;
      }else{
        line = w;
      }
    }
  }
  if(line) lines.push(line);
  return lines;
}

// ─── Draw elements on canvas ───────────────────────────────────────────────
async function drawElements(ctx, cfg, ctxObj){
  ctx.textBaseline='top';
  ctx.textAlign='left';

  for(const el of cfg){
    const x = el.position.x * PX_W,
          y = el.position.y * PX_H,
          w = (el.bounds?.width  || 0) * PX_W,
          h = (el.bounds?.height || 0) * PX_H;

    const content = await fetchElementData(el, ctxObj[el.lookupColumn]);
    ctxObj[el.name] = content;

    switch(el.type){
      case 'text': {
        if(el.fillColor){
          ctx.fillStyle = el.fillColor;
          ctx.fillRect(x,y,w,h);
        }

        ctx.save();
        const isBold  = el.weight==='700' || el.fontWeight==='bold';
        const pxSize  = el.fontSize * PX_H;
        ctx.font      = `${isBold ? 'bold ' : ''}${pxSize}px "Inter"`;
        ctx.fillStyle = el.fontColor || 'black';

        if(el.rotation){
          ctx.translate(x,y);
          ctx.rotate(el.rotation*Math.PI/180);
          ctx.translate(-x,-y);
        }

        const lines = el.wrap ? wrapLines(ctx, content, w) : [content];
        const lh    = pxSize * 1.2;
        for(let i=0;i<lines.length;i++){
          const ly = y + i*lh;
          if(i>0 && ly+lh>y+h) break;     // always draw first; stop if overflow
          ctx.fillText(lines[i], x, ly);  // ← no maxWidth ⇒ no shrinking
        }
        ctx.restore();
      } break;

      case 'qr': {
        const qrBuf = await QRCode.toBuffer(content || 'UNKNOWN', {type:'png'});
        const img   = await loadImage(qrBuf);
        ctx.drawImage(img, x, y, w, h);
      } break;

      case 'line': {
        ctx.save();
        ctx.strokeStyle = el.color || 'black';
        ctx.lineWidth   = el.thickness || 1;
        if(el.style==='dashed') ctx.setLineDash([3,3]);
        ctx.beginPath();
        el.orientation==='vertical'
          ? (ctx.moveTo(x,y),   ctx.lineTo(x, y + el.length*PX_H))
          : (ctx.moveTo(x,y),   ctx.lineTo(x + el.length*PX_W, y));
        ctx.stroke();
        ctx.restore();
      } break;
    }
  }
}

// ─── 1  Create PNG buffers ────────────────────────────────────────────────
async function createImageBuffers(order){
  const bufs=[];
  for(let i=0;i<order.order_qty_requested;i++){
    const canvas = createCanvas(PX_W,PX_H);
    const ctx    = canvas.getContext('2d');
    ctx.fillStyle='white';
    ctx.fillRect(0,0,PX_W,PX_H);
    await drawElements(ctx, elementsConfig, order);
    bufs.push(canvas.toBuffer('image/png'));
  }
  return bufs;
}

// ─── 2  Package buffers into a correctly-scaled PDF ───────────────────────
async function createPdf(bufs, orderId){
  const filePath = path.join('pdf', `${orderId}.pdf`);
  ensureDirectoryExists(filePath);

  const doc = new PDFDocument({size:[PT_W,PT_H], margin:0});
  for(const [n,f] of Object.entries(PDF_FONTS)) doc.registerFont(n,f);
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  bufs.forEach((b,i)=>{
    if(i) doc.addPage({size:[PT_W,PT_H], margin:0});
    doc.image(b, 0, 0, {width:PT_W, height:PT_H});
  });

  doc.end();
  await new Promise(r=>stream.on('finish',r));
  return filePath;
}

// ─── 3  Send PNGs to the print bridge ─────────────────────────────────────
async function printBuffers(bufs){
  const endpoint='http://137.184.148.164:5090/api/print-image';
  for(const b of bufs){
    const res = await fetch(endpoint,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({imageData:'data:image/png;base64,'+b.toString('base64'), cut:true})
    });
    if(!res.ok) console.error('Print API error:', await res.text());
  }
}

// ─── 4  Poll orders, render, print, archive ───────────────────────────────
async function pollPendingOrders(){
  const {data:orders,error} = await supabase.from('home_depot_order_history')
                                            .select('order_id,order_qty_requested,material_id')
                                            .is('label_pdf_url', null);
  if(error){ console.error('DB fetch error:',error); return; }

  for(const order of orders){
    try{
      console.log('Processing order', order.order_id);
      const bufs = await createImageBuffers(order);
      const pdf  = await createPdf(bufs, order.order_id);
      await printBuffers(bufs);

      await supabase.from('home_depot_order_history')
                    .update({label_pdf_url: pdf})
                    .eq('order_id', order.order_id);

      // remember for preview API
      lastOrder   = order;
      lastBuffers = bufs;
      lastPdfPath = pdf;

      console.log(`✓ Completed order ${order.order_id}`);
    }catch(e){
      console.error(`Error processing order ${order.order_id}:`, e);
    }
  }
}
setInterval(pollPendingOrders, 2000);

// ═══════════════════════════════════════════════════════════════════════════
// REST API for live editing & preview
// ═══════════════════════════════════════════════════════════════════════════

// read template
app.get('/elements-config', (_,res)=> res.json(elementsConfig));

// replace entire template
app.put('/elements-config', (req,res)=>{
  if(!Array.isArray(req.body))
    return res.status(400).json({error:'Body must be an array'});
  elementsConfig = req.body;
  res.json({ok:true,count:elementsConfig.length});
});

// deep-merge patch of a single element
app.patch('/elements-config/:name', (req,res)=>{
  const idx = elementsConfig.findIndex(e=>e.name===req.params.name);
  if(idx===-1) return res.status(404).json({error:'Element not found'});
  elementsConfig[idx] = merge({}, elementsConfig[idx], req.body);
  res.json(elementsConfig[idx]);
});

// expose last order (for designer)
app.get('/last-order', (_,res)=>
  lastOrder ? res.json(lastOrder) : res.status(404).json({error:'No order rendered yet'})
);

// manual preview (POST order object)
app.post('/preview', async (req,res)=>{
  const order=req.body;
  if(!order?.order_id || !order?.material_id || !order?.order_qty_requested)
    return res.status(400).json({error:'order_id, material_id, order_qty_requested required'});
  try{
    const bufs = await createImageBuffers(order);
    const pdf  = await createPdf(bufs, order.order_id+'_preview');
    lastOrder   = order;
    lastBuffers = bufs;
    lastPdfPath = pdf;
    res.json({pages:bufs.length, pdf:'/preview/pdf', png:'/preview/image/0'});
  }catch(err){
    res.status(500).json({error:String(err)});
  }
});

// fetch N-th PNG
app.get('/preview/image/:index?', (req,res)=>{
  const i = Number(req.params.index||0);
  if(!lastBuffers[i]) return res.status(404).send('No preview available');
  res.type('png').send(lastBuffers[i]);
});

// download last preview PDF
app.get('/preview/pdf', (req,res)=>{
  if(!lastPdfPath || !fs.existsSync(lastPdfPath))
    return res.status(404).send('No PDF available');
  res.download(lastPdfPath);
});

// ─── Start server ──────────────────────────────────────────────────────────
app.listen(port, ()=> console.log(`Label printer + preview API listening on :${port}`));
