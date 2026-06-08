// // /*  server.js ────────────────────────────────────────────────
// //     Run with:   node server.js
// //     Env  : PORT (optional)  ➜ defaults to 5024
// //            PUBLIC_PORT (optional) ➜ defaults to 5023 (used for URL generation)
// //            SUPABASE_ANON_KEY (required)
// //            TLS_KEY (optional, default to letsencrypt path)
// //            TLS_CERT (optional, default to letsencrypt path)
// //     Supabase: SUPABASE_URL, SUPABASE_ANON_KEY
// // ---------------------------------------------------------------- */

// // require("dotenv").config();
// // const express = require("express");
// // const multer = require("multer");
// // const mkdirp = require("mkdirp");
// // const path = require("path");
// // const fs = require("fs");
// // const https = require("https");
// // const axios = require("axios");
// // const mime = require("mime-types");
// // const bodyParser = require("body-parser");
// // const { createClient } = require("@supabase/supabase-js");

// // const app = express();

// // const PORT = process.env.PORT || 5024;
// // const PUBLIC_PORT = process.env.PUBLIC_PORT || 5023;

// // const SUPABASE_URL = process.env.SUPABASE_URL || "http://137.184.148.164:8000";
// // const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// // const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// // /* ---------- TLS paths (adjust or override via env) ---------- */
// // const TLS_KEY_PATH =
// //   process.env.TLS_KEY ||
// //   "/etc/letsencrypt/live/inventory.orcagroup.io/privkey.pem";
// // const TLS_CERT_PATH =
// //   process.env.TLS_CERT ||
// //   "/etc/letsencrypt/live/inventory.orcagroup.io/fullchain.pem";

// // /* ---------- folder structure --------------------------------- */
// // const ROOT = "/var/sql/dth_materials";
// // const DIRS = {
// //   image: path.join(ROOT, "downloaded_images"),
// //   receive: path.join(ROOT, "receive"),
// //   receive_item: path.join(ROOT, "receive_items"),
// //   location: path.join(ROOT, "location"),
// //   barcode_loc: path.join(ROOT, "barcode_loc"),
// //   kanban: "/var/sql/kanban",
// // };
// // Object.values(DIRS).forEach(mkdirp.sync);

// // /* ---------- helpers ------------------------------------------ */
// // const sanitize = (s) => s.replace(/[^a-zA-Z0-9.\-_]/g, "");
// // const canonFilename = ({ supplier, sku, ext = ".jpg" }) =>
// //   supplier && sku ? `${supplier}_${sku}${ext}` : `${Date.now()}${ext}`;

// // /* ---------- Multer storage engine ---------------------------- */
// // const storage = multer.diskStorage({
// //   destination: (req, _, cb) => {
// //     const dir = DIRS[req.query.category] || DIRS.image;
// //     cb(null, dir);
// //   },
// //   filename: (req, file, cb) => {
// //     const supplier = sanitize(req.body.supplierName || "");
// //     const sku = sanitize(req.body.supplierSku || "");
// //     cb(
// //       null,
// //       canonFilename({ supplier, sku, ext: path.extname(file.originalname) })
// //     );
// //   },
// // });
// // const upload = multer({ storage, limits: { fileSize: 12 * 1024 * 1024 } });

// // const kanbanStorage = multer.diskStorage({
// //   destination: (_, __, cb) => cb(null, DIRS.kanban),
// //   filename: (req, file, cb) => {
// //     const sku = sanitize(req.body.sku || Date.now().toString());
// //     cb(null, `${sku}${path.extname(file.originalname)}`);
// //   },
// // });
// // const uploadKanban = multer({
// //   storage: kanbanStorage,
// //   limits: { fileSize: 12 * 1024 * 1024 },
// // });

// // /* ---------- universal CORS header ---------------------------- */
// // app.use((_, res, next) => {
// //   res.header("Access-Control-Allow-Origin", "*");
// //   next();
// // });

// // app.use(bodyParser.urlencoded({ extended: true }));
// // app.use(express.json());

// // /* ---------- helper to download external files ---------------- */
// // async function downloadExternal(url, timeout = 15000) {
// //   const resp = await axios.get(url, { responseType: "arraybuffer", timeout });
// //   if (resp.status !== 200) throw new Error(`HTTP ${resp.status}`);
// //   return {
// //     buf: resp.data,
// //     mime:
// //       resp.headers["content-type"] ||
// //       mime.lookup(url) ||
// //       "application/octet-stream",
// //   };
// // }

// // /* ---------- /proxy?url=… (read-only CORS fixer) -------------- */
// // app.get("/proxy", async (req, res) => {
// //   const { url } = req.query;
// //   if (!url) return res.status(400).send("Missing ?url=");

// //   try {
// //     const { buf, mime: ct } = await downloadExternal(url);
// //     res.set("Content-Type", ct);
// //     res.send(Buffer.from(buf));
// //   } catch (err) {
// //     console.error("Proxy error:", err.message);
// //     res.status(502).send("Proxy fetch failed");
// //   }
// // });

// // /* ---------- /upload (file or imageUrl) ----------------------- */
// // app.post("/upload", upload.single("image"), async (req, res) => {
// //   if (req.file) {
// //     const cat =
// //       req.query.category && DIRS[req.query.category]
// //         ? req.query.category
// //         : "image";
// //     const url = `https://inventory.orcagroup.io:${PUBLIC_PORT}/${cat}/${req.file.filename}`;
// //     return res.status(201).json({ url });
// //   }

// //   const { imageUrl } = req.body;
// //   if (!imageUrl)
// //     return res.status(400).json({ error: "No file or imageUrl provided" });

// //   try {
// //     const { buf, mime: ct } = await downloadExternal(imageUrl);
// //     const supplier = sanitize(req.body.supplierName || "");
// //     const sku = sanitize(req.body.supplierSku || "");
// //     const ext =
// //       path.extname(imageUrl.split("?")[0]) || `.${mime.extension(ct) || "jpg"}`;
// //     const filename = canonFilename({ supplier, sku, ext });

// //     fs.writeFileSync(path.join(DIRS.image, filename), buf);
// //     const url = `https://inventory.orcagroup.io:${PUBLIC_PORT}/image/${filename}`;
// //     res.status(201).json({ url });
// //   } catch (err) {
// //     console.error("Download failed:", err.message);
// //     res.status(502).json({ error: "Could not fetch remote image" });
// //   }
// // });

// // /* ---------- /kanban-upload ----------------------------------- */
// // app.post("/kanban-upload", uploadKanban.single("image"), async (req, res) => {
// //   const { material_id } = req.body;
// //   if (!material_id)
// //     return res.status(400).json({ error: "material_id required" });

// //   const filename = req.file.filename;

// //   const { error } = await supabase
// //     .from("home_depot_items")
// //     .update({ kanban_image: filename })
// //     .eq("material_id", material_id);

// //   if (error) {
// //     console.error(error);
// //     return res.status(500).json({ error: error.message });
// //   }

// //   const url = `https://inventory.orcagroup.io:${PUBLIC_PORT}/kanban/${filename}`;
// //   res.status(201).json({ url, filename });
// // });

// // /* ---------- GET /kanban-by-material/:material_id ------------- */
// // app.get("/kanban-by-material/:material_id", async (req, res) => {
// //   try {
// //     const material_id = Number(req.params.material_id);
// //     if (Number.isNaN(material_id)) {
// //       return res.status(400).json({ error: "material_id must be a number" });
// //     }

// //     const { data, error } = await supabase
// //       .from("home_depot_items")
// //       .select("kanban_image")
// //       .eq("material_id", material_id)
// //       .single();

// //     if (error) {
// //       console.error(error);
// //       return res.status(500).json({ error: error.message });
// //     }

// //     if (!data || !data.kanban_image) {
// //       return res
// //         .status(404)
// //         .json({ error: "No kanban image for this material_id" });
// //     }

// //     const filePath = path.join(DIRS.kanban, data.kanban_image);
// //     if (!fs.existsSync(filePath)) {
// //       return res.status(404).json({ error: "Kanban file is missing on disk" });
// //     }

// //     res.type(mime.lookup(filePath) || "application/octet-stream");
// //     return res.sendFile(filePath);
// //   } catch (e) {
// //     console.error(e);
// //     return res.status(500).json({ error: "Unexpected server error" });
// //   }
// // });

// // /* ---------- static file serving ------------------------------ */
// // Object.entries(DIRS).forEach(([key, dir]) =>
// //   app.use(`/${key}`, express.static(dir))
// // );

// // /* ───────────────  DTH SKU helpers + endpoints  ─────────────── */

// // const isTwoDigits = (s) => /^\d{2}$/.test(s);
// // const composeSku = ({ department, item_type, category, material_id }) =>
// //   `DTH${department}${item_type}${category}${String(material_id).padStart(
// //     5,
// //     "0"
// //   )}`;

// // /**
// //  * POST /sku
// //  * Body: { material_id, department:"01", item_type:"11", category:"01", also_update_internal?: true }
// //  * -> generates & saves dth_sku (and internal_sku if also_update_internal=true)
// //  */
// // app.post("/sku", async (req, res) => {
// //   try {
// //     const {
// //       material_id,
// //       department,
// //       item_type,
// //       category,
// //       also_update_internal = true,
// //     } = req.body || {};

// //     if (
// //       !material_id ||
// //       !isTwoDigits(department) ||
// //       !isTwoDigits(item_type) ||
// //       !isTwoDigits(category)
// //     ) {
// //       return res
// //         .status(400)
// //         .json({
// //           error:
// //             "material_id, department(2), item_type(2), category(2) are required",
// //         });
// //     }

// //     const dth_sku = composeSku({
// //       department,
// //       item_type,
// //       category,
// //       material_id,
// //     });
// //     const payload = { dth_sku };
// //     if (also_update_internal) payload.internal_sku = dth_sku;

// //     const { error } = await supabase
// //       .from("home_depot_items")
// //       .update(payload)
// //       .eq("material_id", material_id);

// //     if (error) throw error;
// //     res.json({ dth_sku });
// //   } catch (err) {
// //     console.error("POST /sku error:", err.message);
// //     res.status(500).json({ error: err.message });
// //   }
// // });

// // /**
// //  * POST /sku/preview
// //  * Body: { material_id, department, item_type, category }
// //  * -> returns the composed SKU WITHOUT saving it
// //  */
// // app.post("/sku/preview", (req, res) => {
// //   try {
// //     const { material_id, department, item_type, category } = req.body || {};
// //     if (
// //       !material_id ||
// //       !isTwoDigits(department) ||
// //       !isTwoDigits(item_type) ||
// //       !isTwoDigits(category)
// //     ) {
// //       return res
// //         .status(400)
// //         .json({
// //           error:
// //             "material_id, department(2), item_type(2), category(2) are required",
// //         });
// //     }
// //     const dth_sku = composeSku({
// //       department,
// //       item_type,
// //       category,
// //       material_id,
// //     });
// //     res.json({ dth_sku });
// //   } catch (err) {
// //     console.error("POST /sku/preview error:", err.message);
// //     res.status(500).json({ error: err.message });
// //   }
// // });

// // /**
// //  * PUT /sku/:material_id
// //  * Body: { dth_sku: "DTH01110100042", also_update_internal?: true }
// //  * -> directly sets dth_sku (and internal_sku if flag true)
// //  */
// // app.put("/sku/:material_id", async (req, res) => {
// //   try {
// //     const material_id = Number(req.params.material_id);
// //     if (Number.isNaN(material_id)) {
// //       return res.status(400).json({ error: "material_id must be a number" });
// //     }

// //     const { dth_sku, also_update_internal = true } = req.body || {};
// //     if (!dth_sku || !/^DTH\d+$/.test(dth_sku)) {
// //       return res
// //         .status(400)
// //         .json({ error: "dth_sku must be provided and start with DTH" });
// //     }

// //     const payload = { dth_sku };
// //     if (also_update_internal) payload.internal_sku = dth_sku;

// //     const { error } = await supabase
// //       .from("home_depot_items")
// //       .update(payload)
// //       .eq("material_id", material_id);

// //     if (error) throw error;
// //     res.json({ dth_sku });
// //   } catch (err) {
// //     console.error("PUT /sku/:material_id error:", err.message);
// //     res.status(500).json({ error: err.message });
// //   }
// // });

// // /**
// //  * GET /sku/:material_id
// //  * -> returns { dth_sku, internal_sku } for the row
// //  */
// // app.get("/sku/:material_id", async (req, res) => {
// //   try {
// //     const material_id = Number(req.params.material_id);
// //     if (Number.isNaN(material_id)) {
// //       return res.status(400).json({ error: "material_id must be a number" });
// //     }

// //     const { data, error } = await supabase
// //       .from("home_depot_items")
// //       .select("dth_sku, internal_sku")
// //       .eq("material_id", material_id)
// //       .maybeSingle();

// //     if (error) throw error;
// //     if (!data) return res.status(404).json({ error: "Material not found" });

// //     res.json(data);
// //   } catch (err) {
// //     console.error("GET /sku/:material_id error:", err.message);
// //     res.status(500).json({ error: err.message });
// //   }
// // });

// // /* ---------- POST /home-depot-items  --------------------------
// //    Body = single row matching public.home_depot_items schema.
// //    The server inserts it with Supabase and returns the created row.
// //    ------------------------------------------------------------*/
// // app.post("/home-depot-items", async (req, res) => {
// //   try {
// //     const row = req.body || {};

// //     // Very small validation – internet_sku_number is required
// //     if (!row.internet_sku_number) {
// //       return res.status(400).json({ error: "internet_sku_number required" });
// //     }

// //     const { data, error } = await supabase
// //       .from("home_depot_items")
// //       .insert([row])
// //       .select()
// //       .single();                     // return the inserted row

// //     if (error) throw error;
// //     res.status(201).json(data);      // { … all columns … }
// //   } catch (err) {
// //     console.error("POST /home-depot-items:", err.message);
// //     res.status(500).json({ error: err.message });
// //   }
// // });


// // /* ---------- HTTPS server startup ----------------------------- */
// // const httpsOptions = {
// //   key: fs.readFileSync(TLS_KEY_PATH),
// //   cert: fs.readFileSync(TLS_CERT_PATH),
// //   // ca: fs.readFileSync('/path/to/chain.pem'), // if you need it
// // };

// // https.createServer(httpsOptions, app).listen(PORT, () => {
// //   console.log(`🖼️  HTTPS Image server listening on 0.0.0.0:${PORT}`);
// //   console.log(`    Public URLs advertise port :${PUBLIC_PORT}`);
// // });


// /*  server.js ────────────────────────────────────────────────
//     Run with:   node server.js

//     Env  : PORT           (optional, defaults 5024 — HTTPS listener)
//            PUBLIC_PORT    (optional, defaults 5023 — used in URLs we return)
//            SUPABASE_URL   (required, or fallback below)
//            SUPABASE_ANON_KEY (required)

//            TLS_KEY        (optional, default lets-encrypt path)
//            TLS_CERT       (optional, default lets-encrypt path)
// ---------------------------------------------------------------- */

// require('dotenv').config();
// const express    = require('express');
// const multer     = require('multer');
// const mkdirp     = require('mkdirp');
// const path       = require('path');
// const fs         = require('fs');
// const https      = require('https');
// const axios      = require('axios');
// const mime       = require('mime-types');
// const bodyParser = require('body-parser');
// const { createClient } = require('@supabase/supabase-js');

// const app = express();

// /* ─── basic config ────────────────────────────────────────── */
// const PORT        = Number(process.env.PORT        || 5024);  // HTTPS only
// const PUBLIC_PORT = Number(process.env.PUBLIC_PORT || 5023);

// const SUPABASE_URL      = process.env.SUPABASE_URL      || 'http://137.184.148.164:8000';
// const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
// const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// /* TLS certificate files */
// const TLS_KEY_PATH  = process.env.TLS_KEY  ||
//   '/etc/letsencrypt/live/inventory.orcagroup.io/privkey.pem';
// const TLS_CERT_PATH = process.env.TLS_CERT ||
//   '/etc/letsencrypt/live/inventory.orcagroup.io/fullchain.pem';

// /* ─── folder layout ───────────────────────────────────────── */
// const ROOT = '/var/sql/dth_materials';
// const DIRS = {
//   image       : path.join(ROOT, 'downloaded_images'),
//   receive     : path.join(ROOT, 'receive'),
//   receive_item: path.join(ROOT, 'receive_items'),
//   location    : path.join(ROOT, 'location'),
//   barcode_loc : path.join(ROOT, 'barcode_loc'),
//   kanban      : '/var/sql/kanban'
// };
// Object.keys(DIRS).forEach(function (k) { mkdirp.sync(DIRS[k]); });

// /* ─── helpers ─────────────────────────────────────────────── */
// function sanitize (s) { return String(s || '').replace(/[^a-zA-Z0-9.\-_]/g, ''); }
// function canonFilename (o) {
//   var supplier = o.supplier, sku = o.sku, ext = o.ext || '.jpg';
//   return (supplier && sku) ? (supplier + '_' + sku + ext) : (Date.now() + ext);
// }

// /* ─── multer storage ──────────────────────────────────────── */
// const storage = multer.diskStorage({
//   destination: function (req, _file, cb) {
//     var dir = DIRS[req.query.category] || DIRS.image;
//     cb(null, dir);
//   },
//   filename: function (req, file, cb) {
//     var supplier = sanitize(req.body.supplierName);
//     var sku      = sanitize(req.body.supplierSku);
//     cb(null, canonFilename({ supplier: supplier, sku: sku, ext: path.extname(file.originalname) }));
//   }
// });

// /* Accept ONE file in field “image” OR “file” */
// const upload = multer({ storage: storage, limits: { fileSize: 12 * 1024 * 1024 } })
//                .fields([{ name: 'image', maxCount: 1 }, { name: 'file', maxCount: 1 }]);

// /* kanban uploads */
// const kanbanStorage = multer.diskStorage({
//   destination: function (_r,_f,cb){ cb(null, DIRS.kanban); },
//   filename   : function (req,file,cb){
//     var sku = sanitize(req.body.sku || Date.now().toString());
//     cb(null, sku + path.extname(file.originalname));
//   }
// });
// const uploadKanban = multer({ storage: kanbanStorage, limits: { fileSize: 12 * 1024 * 1024 } });

// /* ─── middleware ──────────────────────────────────────────── */
// app.use(function (_req, res, next) {
//   res.header('Access-Control-Allow-Origin', '*');
//   next();
// });
// app.use(bodyParser.urlencoded({ extended: true }));
// app.use(express.json());

// /* ─── tiny helper to fetch remote file ────────────────────── */
// function downloadExternal (url, timeout) {
//   timeout = timeout || 15000;
//   return axios.get(url, { responseType: 'arraybuffer', timeout: timeout })
//     .then(function (resp) {
//       if (resp.status !== 200) throw new Error('HTTP ' + resp.status);
//       return {
//         buf : resp.data,
//         mime: resp.headers['content-type'] || mime.lookup(url) || 'application/octet-stream'
//       };
//     });
// }

// /* ─── /proxy ------------------------------------------------- */
// app.get('/proxy', function (req, res) {
//   if (!req.query.url) return res.status(400).send('Missing ?url=');
//   downloadExternal(req.query.url)
//     .then(function (o) { res.set('Content-Type', o.mime).send(Buffer.from(o.buf)); })
//     .catch(function (e) { console.error('Proxy error:', e.message); res.status(502).send('Proxy fetch failed'); });
// });

// /* ─── /upload (file OR imageUrl) ----------------------------- */
// app.post('/upload', upload, function (req, res) {
//   /* 1️⃣  direct file upload (image OR file) */
//   var file = null;
//   if (req.files && req.files.image && req.files.image.length) file = req.files.image[0];
//   else if (req.files && req.files.file && req.files.file.length) file = req.files.file[0];

//   if (file) {
//     var cat = (req.query.category && DIRS[req.query.category]) ? req.query.category : 'image';
//     var url = 'https://inventory.orcagroup.io:' + PUBLIC_PORT + '/' + cat + '/' + file.filename;
//     return res.status(201).json({ url: url });
//   }

//   /* 2️⃣  remote image via imageUrl */
//   var imageUrl = req.body.imageUrl;
//   if (!imageUrl) return res.status(400).json({ error: 'No file or imageUrl provided' });

//   downloadExternal(imageUrl)
//     .then(function (o) {
//       var supplier = sanitize(req.body.supplierName);
//       var sku      = sanitize(req.body.supplierSku);
//       var ext      = path.extname(imageUrl.split('?')[0]) || '.' + (mime.extension(o.mime) || 'jpg');
//       var filename = canonFilename({ supplier: supplier, sku: sku, ext: ext });

//       fs.writeFileSync(path.join(DIRS.image, filename), o.buf);
//       var url = 'https://inventory.orcagroup.io:' + PUBLIC_PORT + '/image/' + filename;
//       res.status(201).json({ url: url });
//     })
//     .catch(function (e) {
//       console.error('Download failed:', e.message);
//       res.status(502).json({ error: 'Could not fetch remote image' });
//     });
// });

// /* ─── /kanban-upload ---------------------------------------- */
// app.post('/kanban-upload', uploadKanban.single('image'), function (req, res) {
//   var material_id = req.body.material_id;
//   if (!material_id) return res.status(400).json({ error: 'material_id required' });

//   var filename = req.file.filename;
//   supabase
//     .from('home_depot_items')
//     .update({ kanban_image: filename })
//     .eq('material_id', material_id)
//     .then(function () {
//       var url = 'https://inventory.orcagroup.io:' + PUBLIC_PORT + '/kanban/' + filename;
//       res.status(201).json({ url: url, filename: filename });
//     })
//     .catch(function (e) {
//       console.error(e);
//       res.status(500).json({ error: e.message });
//     });
// });

// /* ─── GET /kanban-by-material/:material_id ------------------ */
// app.get('/kanban-by-material/:material_id', function (req, res) {
//   var material_id = Number(req.params.material_id);
//   if (isNaN(material_id)) return res.status(400).json({ error: 'material_id must be a number' });

//   supabase
//     .from('home_depot_items')
//     .select('kanban_image')
//     .eq('material_id', material_id)
//     .single()
//     .then(function (result) {
//       if (result.error) throw result.error;
//       if (!result.data || !result.data.kanban_image) {
//         return res.status(404).json({ error: 'No kanban image for this material_id' });
//       }
//       var filePath = path.join(DIRS.kanban, result.data.kanban_image);
//       if (!fs.existsSync(filePath)) {
//         return res.status(404).json({ error: 'Kanban file is missing on disk' });
//       }
//       res.type(mime.lookup(filePath) || 'application/octet-stream').sendFile(filePath);
//     })
//     .catch(function (e) {
//       console.error(e);
//       res.status(500).json({ error: e.message });
//     });
// });

// /* ─── static file serving ----------------------------------- */
// Object.keys(DIRS).forEach(function (k) {
//   app.use('/' + k, express.static(DIRS[k]));
// });

// /* ─── DTH SKU helpers + CRUD endpoints (unchanged) ────────── */
// function isTwoDigits (s) { return /^\d{2}$/.test(s); }
// function composeSku (o) {
//   return 'DTH' + o.department + o.item_type + o.category +
//          String(o.material_id).padStart(5, '0');
// }

// /* POST /sku */
// app.post('/sku', function (req, res) {
//   var b = req.body || {};
//   if (!b.material_id || !isTwoDigits(b.department) || !isTwoDigits(b.item_type) || !isTwoDigits(b.category)) {
//     return res.status(400).json({ error: 'material_id, department(2), item_type(2), category(2) are required' });
//   }
//   var dth_sku = composeSku(b);
//   var payload = { dth_sku: dth_sku };
//   if (b.also_update_internal !== false) payload.internal_sku = dth_sku;

//   supabase.from('home_depot_items').update(payload).eq('material_id', b.material_id)
//     .then(function (r) { if (r.error) throw r.error; res.json({ dth_sku: dth_sku }); })
//     .catch(function (e) { console.error(e); res.status(500).json({ error: e.message }); });
// });

// /* POST /sku/preview */
// app.post('/sku/preview', function (req, res) {
//   var b = req.body || {};
//   if (!b.material_id || !isTwoDigits(b.department) || !isTwoDigits(b.item_type) || !isTwoDigits(b.category)) {
//     return res.status(400).json({ error: 'material_id, department(2), item_type(2), category(2) are required' });
//   }
//   res.json({ dth_sku: composeSku(b) });
// });

// /* PUT /sku/:material_id */
// app.put('/sku/:material_id', function (req, res) {
//   var material_id = Number(req.params.material_id);
//   if (isNaN(material_id)) return res.status(400).json({ error: 'material_id must be a number' });

//   var dth_sku = req.body.dth_sku;
//   if (!dth_sku || !/^DTH\d+$/.test(dth_sku)) return res.status(400).json({ error: 'dth_sku must start with DTH' });

//   var payload = { dth_sku: dth_sku };
//   if (req.body.also_update_internal !== false) payload.internal_sku = dth_sku;

//   supabase.from('home_depot_items').update(payload).eq('material_id', material_id)
//     .then(function (r) { if (r.error) throw r.error; res.json({ dth_sku: dth_sku }); })
//     .catch(function (e) { console.error(e); res.status(500).json({ error: e.message }); });
// });

// /* GET /sku/:material_id */
// app.get('/sku/:material_id', function (req, res) {
//   var material_id = Number(req.params.material_id);
//   if (isNaN(material_id)) return res.status(400).json({ error: 'material_id must be a number' });

//   supabase.from('home_depot_items')
//     .select('dth_sku, internal_sku')
//     .eq('material_id', material_id)
//     .maybeSingle()
//     .then(function (r) {
//       if (r.error) throw r.error;
//       if (!r.data) return res.status(404).json({ error: 'Material not found' });
//       res.json(r.data);
//     })
//     .catch(function (e) { console.error(e); res.status(500).json({ error: e.message }); });
// });

// /* POST /home-depot-items */
// app.post('/home-depot-items', function (req, res) {
//   var row = req.body || {};
//   if (!row.internet_sku_number)
//     return res.status(400).json({ error: 'internet_sku_number required' });

//   supabase.from('home_depot_items').insert([row]).select().single()
//     .then(function (r) {
//       if (r.error) throw r.error;
//       res.status(201).json(r.data);
//     })
//     .catch(function (e) { console.error(e); res.status(500).json({ error: e.message }); });
// });

// /* PUT /home-depot-items/:internet_sku */
// app.put('/home-depot-items/:internet_sku', function (req, res) {
//   var sku = Number(req.params.internet_sku);
//   if (isNaN(sku)) return res.status(400).json({ error: 'bad SKU' });

//   supabase.from('home_depot_items').update(req.body || {}).eq('internet_sku_number', sku).select().single()
//     .then(function (r) { if (r.error) throw r.error; res.json(r.data); })
//     .catch(function (e) { console.error(e); res.status(500).json({ error: e.message }); });
// });

// /* ─── HTTPS-only server startup ───────────────────────────── */
// const httpsOptions = {
//   key : fs.readFileSync(TLS_KEY_PATH),
//   cert: fs.readFileSync(TLS_CERT_PATH)
// };
// https.createServer(httpsOptions, app).listen(PORT, function () {
//   console.log('🔒 HTTPS Image server listening on 0.0.0.0:' + PORT);
//   console.log('    Public URLs advertise port :' + PUBLIC_PORT);
// });


/*  server.js ────────────────────────────────────────────────
    Run with:   node server.js
---------------------------------------------------------------- */

require("dotenv").config();
const express    = require("express");
const multer     = require("multer");
const mkdirp     = require("mkdirp");
const path       = require("path");
const fs         = require("fs");
const https      = require("https");
const axios      = require("axios");
const mime       = require("mime-types");
const bodyParser = require("body-parser");
const { createClient } = require("@supabase/supabase-js");

const app = express();

/* ─── CONFIG ─────────────────────────────────────────────── */
const PORT        = Number(process.env.PORT        || 5024); // HTTPS listener
const PUBLIC_PORT = Number(process.env.PUBLIC_PORT || 5023); // used only in URLs

const SUPABASE_URL      = "http://137.184.148.164:8000";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TLS_KEY_PATH  = process.env.TLS_KEY  || "/etc/letsencrypt/live/inventory.orcagroup.io/privkey.pem";
const TLS_CERT_PATH = process.env.TLS_CERT || "/etc/letsencrypt/live/inventory.orcagroup.io/fullchain.pem";

/* ─── FOLDERS ─────────────────────────────────────────────── */
const ROOT = "/var/sql/dth_materials";
const DIRS = {
  image       : path.join(ROOT, "downloaded_images"),
  receive     : path.join(ROOT, "receive"),
  receive_item: path.join(ROOT, "receive_items"),
  location    : path.join(ROOT, "location"),
  barcode_loc : path.join(ROOT, "barcode_loc"),
  kanban      : "/var/sql/kanban",
};
Object.keys(DIRS).forEach(k => mkdirp.sync(DIRS[k]));

/* ─── HELPERS ─────────────────────────────────────────────── */
const sanitize = s => (s || "").replace(/[^a-zA-Z0-9.\-_]/g, "");
const canonFilename = ({ supplier, sku, ext = ".jpg" }) =>
  supplier && sku ? `${supplier}_${sku}${ext}` : `${Date.now()}${ext}`;

/* ─── MULTER CONFIG ───────────────────────────────────────── */
const storage = multer.diskStorage({
  destination: (req, _file, cb) => cb(null, DIRS[req.query.category] || DIRS.image),
  filename   : (req, file, cb)  => {
    const supplier = sanitize(req.body.supplierName);
    const sku      = sanitize(req.body.supplierSku);
    cb(null, canonFilename({ supplier, sku, ext: path.extname(file.originalname) }));
  }
});

/* Accept one file in EITHER field name: “image” OR “file” */
const upload = multer({ storage, limits: { fileSize: 12 * 1024 * 1024 } })
  .fields([{ name: "image", maxCount: 1 }, { name: "file", maxCount: 1 }]);

const kanbanStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DIRS.kanban),
  filename   : (req, file, cb)   => {
    const sku = sanitize(req.body.sku) || Date.now().toString();
    cb(null, `${sku}${path.extname(file.originalname)}`);
  }
});
const uploadKanban = multer({ storage: kanbanStorage, limits: { fileSize: 12 * 1024 * 1024 } });

/* ─── MIDDLEWARE ──────────────────────────────────────────── */
app.use(( _req, res, next) => { res.header("Access-Control-Allow-Origin", "*"); next(); });
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

/* ─── SMALL UTILITY TO DOWNLOAD REMOTE FILES ──────────────── */
async function downloadExternal(url, timeout = 15000) {
  const r = await axios.get(url, { responseType: "arraybuffer", timeout });
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  return { buf: r.data, mime: r.headers["content-type"] || mime.lookup(url) || "application/octet-stream" };
}

/* ─── /proxy ------------------------------------------------- */
app.get("/proxy", async (req, res) => {
  if (!req.query.url) return res.status(400).send("Missing ?url=");
  try {
    const { buf, mime: ct } = await downloadExternal(req.query.url);
    res.set("Content-Type", ct).send(Buffer.from(buf));
  } catch (e) {
    console.error("Proxy error:", e.message);
    res.status(502).send("Proxy fetch failed");
  }
});

/* ─── /upload (file or imageUrl) ----------------------------- */
app.post("/upload", upload, async (req, res) => {
  /* 1️⃣  DIRECT FILE UPLOAD (image OR file) */
  let file = null;
  if (req.files && req.files.image && req.files.image.length) {
    file = req.files.image[0];
  } else if (req.files && req.files.file && req.files.file.length) {
    file = req.files.file[0];
  }

  if (file) {
    const cat = DIRS[req.query.category] ? req.query.category : "image";
    const url = `https://inventory.orcagroup.io:${PUBLIC_PORT}/${cat}/${file.filename}`;
    return res.status(201).json({ url });
  }

  /* 2️⃣  REMOTE IMAGE VIA imageUrl */
  const imageUrl = req.body.imageUrl;
  if (!imageUrl) return res.status(400).json({ error: "No file or imageUrl provided" });

  try {
    const { buf, mime: ct } = await downloadExternal(imageUrl);
    const supplier = sanitize(req.body.supplierName);
    const sku      = sanitize(req.body.supplierSku);
    const ext      = path.extname(imageUrl.split("?")[0]) || `.${mime.extension(ct) || "jpg"}`;
    const filename = canonFilename({ supplier, sku, ext });

    fs.writeFileSync(path.join(DIRS.image, filename), buf);
    const url = `https://inventory.orcagroup.io:${PUBLIC_PORT}/image/${filename}`;
    res.status(201).json({ url });
  } catch (e) {
    console.error("Download failed:", e.message);
    res.status(502).json({ error: "Could not fetch remote image" });
  }
});

/* ─── /kanban-upload ---------------------------------------- */
app.post("/kanban-upload", uploadKanban.single("image"), async (req, res) => {
  const material_id = Number(req.body.material_id);
  if (!material_id) return res.status(400).json({ error: "material_id required" });

  const filename = req.file.filename;
  const { error } = await supabase.from("home_depot_items")
                                  .update({ kanban_image: filename })
                                  .eq("material_id", material_id);
  if (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
  const url = `https://inventory.orcagroup.io:${PUBLIC_PORT}/kanban/${filename}`;
  res.status(201).json({ url, filename });
});

/* ─── /kanban-by-material/:id -------------------------------- */
app.get("/kanban-by-material/:material_id", async (req, res) => {
  const material_id = Number(req.params.material_id);
  if (!material_id) return res.status(400).json({ error: "material_id must be a number" });

  const { data, error } = await supabase.from("home_depot_items")
                                        .select("kanban_image")
                                        .eq("material_id", material_id)
                                        .single();
  if (error)       return res.status(500).json({ error: error.message });
  if (!data || !data.kanban_image)
    return res.status(404).json({ error: "No kanban image for this material_id" });

  const filePath = path.join(DIRS.kanban, data.kanban_image);
  if (!fs.existsSync(filePath))
    return res.status(404).json({ error: "Kanban file is missing on disk" });

  res.type(mime.lookup(filePath) || "application/octet-stream").sendFile(filePath);
});

/* ─── STATIC FILES ------------------------------------------ */
Object.keys(DIRS).forEach(k => app.use(`/${k}`, express.static(DIRS[k])));

/* ─── EVERYTHING ELSE (SKU helpers, CRUD routes) ------------- */
/* Nothing changed at all – paste your original /sku, /sku/preview,
   /home-depot-items, PUTs, etc. below this line.               */

/* ############ PLACE YOUR ORIGINAL ROUTES HERE ############### */
// (I left them out of this snippet only to keep the message readable.)
// Simply copy-paste the exact blocks you already had.


// ─────────────────────────────────────────────────────────────
/* HTTPS SERVER ------------------------------------------------ */
const httpsOptions = {
  key : fs.readFileSync(TLS_KEY_PATH),
  cert: fs.readFileSync(TLS_CERT_PATH)
};

https.createServer(httpsOptions, app).listen(PORT, () => {
  console.log(`🔒  HTTPS server listening on 0.0.0.0:${PORT}`);
  console.log(`    Public URLs advertise port :${PUBLIC_PORT}`);
});
