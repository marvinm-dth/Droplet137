/*  server.js  ────────────────────────────────────────────────
   Run with: PORT=5023 node server.js
---------------------------------------------------------------- */
require('dotenv').config();
const express = require('express');
const multer  = require('multer');
const mkdirp  = require('mkdirp');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 5024;

/* ---------- fixed folder structure (match the Python app) ---- */
const ROOT = '/var/sql/dth_materials';
const DIRS = {
  image        : path.join(ROOT, 'downloaded_images'),
  receive      : path.join(ROOT, 'receive'),
  receive_item : path.join(ROOT, 'receive_items'),
  location     : path.join(ROOT, 'location'),
  barcode_loc  : path.join(ROOT, 'barcode_loc'),
};

/* ensure folders exist */
Object.values(DIRS).forEach(dir => mkdirp.sync(dir));

/* ---------- Multer storage engine with Python-style naming ---- */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    /* pick sub-folder via ?category=image|receive|… (default: image) */
    const cat = req.query.category && DIRS[req.query.category]
              ? req.query.category
              : 'image';
    cb(null, DIRS[cat]);
  },
  filename: (req, file, cb) => {
    const safeName  = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '');
    const supplier  = (req.body.supplierName || '').trim().replace(/\s+/g, '');
    const sku       = (req.body.supplierSku  || '').trim();

    /* If caller passed supplierName+supplierSku → fabricate the canonical name,
       otherwise keep the original filename like the Python update route */
    if (supplier && sku) {
      cb(null, `${supplier}_${sku}${path.extname(safeName) || '.jpg'}`);
    } else {
      cb(null, safeName);
    }
  }
});
const upload = multer({ storage });

/* ---------- single upload endpoint --------------------------- */
/**
 *  POST /upload
 *       Body: multipart/form-data
 *         • image          – file field (required)
 *         • supplierName   – text  (optional: triggers canonical naming)
 *         • supplierSku    – text  (optional)
 *       Querystring:
 *         ?category=image|receive|receive_item|location|barcode_loc
 *           (defaults to image)
 *
 *  Returns: { url: "https://inventory.orcagroup.io:5023/<category>/<filename>" }
 */
app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const category = req.query.category && DIRS[req.query.category]
                 ? req.query.category
                 : 'image';
  const url = `https://inventory.orcagroup.io:${PORT}/${category}/${req.file.filename}`;
  res.status(201).json({ url });
});

/* ---------- static file serving (matches Flask routes) ------- */
Object.entries(DIRS).forEach(([key, dir]) => {
  app.use(`/${key}`, express.static(dir));
});

/* ------------------------------------------------------------- */
app.listen(PORT, () =>
  console.log(`🖼️  Image server listening on 0.0.0.0:${PORT}`)
);
