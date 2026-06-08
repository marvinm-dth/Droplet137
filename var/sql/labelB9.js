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

// ─── Template (unchanged except some bounds tweak earlier) ────────────────
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

// ─── DB helper (unchanged) ────────────────────────────────────────────────
async function fetchElementData(el,val){ /* ... unchanged ... */ /* omitted for brevity */ }

// ─── wrapGreedy & drawElements (unchanged – already wrapped & auto-shrink) ─

// [ keep the same wrapGreedy, drawElements, createImageBuffers functions ]


// ─── PDF packaging (★ scaled 95 % anchored lower-right) ───────────────────
async function createPdf(bufs, id){
  const filePath = path.join('pdf', `${id}.pdf`);
  ensureDirectoryExists(filePath);

  const SCALE = 0.95;                       // 95 %
  const newW  = PT_W * SCALE;
  const newH  = PT_H * SCALE;
  const offX  = PT_W - newW;                // anchor lower-right
  const offY  = PT_H - newH;

  const doc = new PDFDocument({size:[PT_W,PT_H], margin:0});
  for(const [n,f] of Object.entries(PDF_FONTS)) doc.registerFont(n,f);
  const stream = fs.createWriteStream(filePath); doc.pipe(stream);

  bufs.forEach((b,i)=>{
    if(i) doc.addPage({size:[PT_W,PT_H], margin:0});
    doc.image(b, offX, offY, {width:newW, height:newH});
  });

  doc.end();
  await new Promise(r=>stream.on('finish',r));
  return filePath;
}

// ─── printBuffers, pollPendingOrders, REST endpoints, etc. remain identical ─
// [ keep remainder of previous code unchanged ]
