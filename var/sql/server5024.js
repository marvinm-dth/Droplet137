/*  server.js ────────────────────────────────────────────────
    Run with:   node server.js
    Env  : PORT (optional)  ➜ defaults to 5024
    Supabase: SUPABASE_URL, SUPABASE_SERVICE_KEY
---------------------------------------------------------------- */

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const mkdirp = require('mkdirp');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const mime = require('mime-types');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 5024;
const PUBLIC_PORT = 5023;

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "http://137.184.148.164:8000";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------- folder structure --------------------------------- */
const ROOT = '/var/sql/dth_materials';
const DIRS = {
  image: path.join(ROOT, 'downloaded_images'),
  receive: path.join(ROOT, 'receive'),
  receive_item: path.join(ROOT, 'receive_items'),
  location: path.join(ROOT, 'location'),
  barcode_loc: path.join(ROOT, 'barcode_loc'),
  kanban: '/var/sql/kanban',
};
Object.values(DIRS).forEach(mkdirp.sync);

/* ---------- helpers ------------------------------------------ */
const sanitize = (s) => s.replace(/[^a-zA-Z0-9.\-_]/g, '');
const canonFilename = ({ supplier, sku, ext = '.jpg' }) =>
  supplier && sku ? `${supplier}_${sku}${ext}` : `${Date.now()}${ext}`;

/* ---------- Multer storage engine ---------------------------- */
const storage = multer.diskStorage({
  destination: (req, _, cb) => {
    const dir = DIRS[req.query.category] || DIRS.image;
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const supplier = sanitize(req.body.supplierName || '');
    const sku = sanitize(req.body.supplierSku || '');
    cb(null, canonFilename({ supplier, sku, ext: path.extname(file.originalname) }));
  },
});
const upload = multer({ storage, limits: { fileSize: 12 * 1024 * 1024 } });

const kanbanStorage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, DIRS.kanban),
  filename: (req, file, cb) => {
    const sku = sanitize(req.body.sku || Date.now().toString());
    cb(null, `${sku}${path.extname(file.originalname)}`);
  },
});
const uploadKanban = multer({ storage: kanbanStorage, limits: { fileSize: 12 * 1024 * 1024 } });

/* ---------- universal CORS header ---------------------------- */
app.use((_, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

app.use(bodyParser.urlencoded({ extended: true }));

/* ---------- helper to download external files ---------------- */
async function downloadExternal(url, timeout = 15000) {
  const resp = await axios.get(url, { responseType: 'arraybuffer', timeout });
  if (resp.status !== 200) throw new Error(`HTTP ${resp.status}`);
  return { buf: resp.data, mime: resp.headers['content-type'] || mime.lookup(url) || 'application/octet-stream' };
}

/* ---------- /proxy?url=… (read-only CORS fixer) -------------- */
app.get('/proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing ?url=');

  try {
    const { buf, mime } = await downloadExternal(url);
    res.set('Content-Type', mime);
    res.send(Buffer.from(buf));
  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(502).send('Proxy fetch failed');
  }
});

/* ---------- /upload (file or imageUrl) ----------------------- */
app.post('/upload', upload.single('image'), async (req, res) => {
  if (req.file) {
    const cat = req.query.category && DIRS[req.query.category] ? req.query.category : 'image';
    const url = `https://inventory.orcagroup.io:${PUBLIC_PORT}/${cat}/${req.file.filename}`;
    return res.status(201).json({ url });
  }

  const { imageUrl } = req.body;
  if (!imageUrl) return res.status(400).json({ error: 'No file or imageUrl provided' });

  try {
    const { buf, mime: ct } = await downloadExternal(imageUrl);
    const supplier = sanitize(req.body.supplierName || '');
    const sku = sanitize(req.body.supplierSku || '');
    const ext = path.extname(imageUrl.split('?')[0]) || `.${mime.extension(ct) || 'jpg'}`;
    const filename = canonFilename({ supplier, sku, ext });

    fs.writeFileSync(path.join(DIRS.image, filename), buf);
    const url = `https://inventory.orcagroup.io:${PUBLIC_PORT}/image/${filename}`;
    res.status(201).json({ url });
  } catch (err) {
    console.error('Download failed:', err.message);
    res.status(502).json({ error: 'Could not fetch remote image' });
  }
});

/* ---------- /kanban-upload ----------------------------------- */
app.post('/kanban-upload', uploadKanban.single('image'), async (req, res) => {
  const { material_id } = req.body;
  if (!material_id) return res.status(400).json({ error: 'material_id required' });

  const filename = req.file.filename;

  const { error } = await supabase
    .from('home_depot_items')
    .update({ kanban_image: filename })
    .eq('material_id', material_id);

  if (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }

  const url = `https://inventory.orcagroup.io:${PUBLIC_PORT}/kanban/${filename}`;
  res.status(201).json({ url, filename });
});

/* ---------- static file serving ------------------------------ */
Object.entries(DIRS).forEach(([key, dir]) => app.use(`/${key}`, express.static(dir)));

app.listen(PORT, () => {
  console.log(`🖼️  Image server listening on 0.0.0.0:${PORT}`);
  console.log(`    Public URLs advertise port :${PUBLIC_PORT}`);
});

// ---------- GET /kanban-by-material/:material_id -------------
app.get('/kanban-by-material/:material_id', async (req, res) => {
  try {
    const material_id = Number(req.params.material_id);
    if (Number.isNaN(material_id)) {
      return res.status(400).json({ error: 'material_id must be a number' });
    }

    const { data, error } = await supabase
      .from('home_depot_items')
      .select('kanban_image')
      .eq('material_id', material_id)
      .single();

    if (error) {
      console.error(error);
      return res.status(500).json({ error: error.message });
    }

    if (!data || !data.kanban_image) {
      return res.status(404).json({ error: 'No kanban image for this material_id' });
    }

    const filePath = path.join(DIRS.kanban, data.kanban_image);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Kanban file is missing on disk' });
    }

    res.type(mime.lookup(filePath) || 'application/octet-stream');
    return res.sendFile(filePath);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
});

