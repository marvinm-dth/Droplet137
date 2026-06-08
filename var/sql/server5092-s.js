// // server.js
// require("dotenv").config();
// const fs      = require("fs");
// const https   = require("https");
// const express = require("express");
// const cors    = require("cors");
// const { createClient } = require("@supabase/supabase-js");

// // ── Configuration ────────────────────────────────────────────
// const PORT              = process.env.PORT || 5091;
// const SUPABASE_URL      = 'http://137.184.148.164:8000';
// const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// // ── Initialize Supabase client ──────────────────────────────
// const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// // ── Create Express app ──────────────────────────────────────
// const app = express();

// // ── Middleware ──────────────────────────────────────────────
// app.use(cors({ origin: "*" }));
// app.use(express.json());
// app.use((req, res, next) => {
//   console.log(`\n[${new Date().toISOString()}] ▶ ${req.method} ${req.originalUrl}`);
//   if (req.body && Object.keys(req.body).length) {
//     console.log("   ⮞ Body:", JSON.stringify(req.body));
//   }
//   next();
// });

// // ── Routes ────────────────────────────────────────────────────

// /**
//  * GET /items/:sku
//  *   Fetch from home_depot_items by DTH-prefixed internal_sku or temp_internal_sku.
//  */
// app.get("/items/:sku", async (req, res) => {
//   const { sku } = req.params;
//   console.log(`→ GET /items/${sku}`);

//   if (!/^DTH\d+$/.test(sku)) {
//     console.log("   • SKU not DTH-prefixed; returning 400");
//     return res.status(400).json({ error: "Use /items/backup/:backupSku for numeric SKUs" });
//   }

//   try {
//     console.log("   • Querying home_depot_items for", sku);
//     const { data, error } = await sb
//       .from("home_depot_items")
//       .select("item_desc, item_image, internal_sku, temp_internal_sku")
//       .or(`internal_sku.eq.${sku},temp_internal_sku.eq.${sku}`)
//       .maybeSingle();

//     console.log("   • home_depot_items returned:", { data, error });
//     if (error)      throw error;
//     if (!data)     return res.status(404).json({ error: "Item not found" });

//     const skuUsed = (data.internal_sku === sku)
//       ? data.internal_sku
//       : data.temp_internal_sku;

//     return res.json({
//       item_name:  data.item_desc,
//       item_image: data.item_image,
//       sku_used:   skuUsed
//     });

//   } catch (err) {
//     console.error("   ! Error in /items handler:", err.message);
//     return res.status(500).json({ error: err.message });
//   }
// });

// /**
//  * GET /items/backup/:backupSku
//  *   1) Lookup all_items_tracking by backup_sku → internal_sku
//  *   2) Query home_depot_items by that internal_sku OR temp_internal_sku
//  *   3) Return item_name, item_image, sku_used
//  */
// app.get("/items/backup/:backupSku", async (req, res) => {
//   const { backupSku } = req.params;
//   console.log(`→ GET /items/backup/${backupSku}`);

//   if (!/^\d{7}$/.test(backupSku)) {
//     console.log("   • Invalid backup_sku format:", backupSku);
//     return res.status(400).json({ error: "Backup SKU must be exactly 7 digits" });
//   }

//   try {
//     // 1) tracking lookup
//     console.log("   • Querying all_items_tracking for backup_sku =", backupSku);
//     const { data: track, error: trackErr } = await sb
//       .from("all_items_tracking")
//       .select("internal_sku")
//       .eq("backup_sku", backupSku)
//       .maybeSingle();

//     console.log("   • all_items_tracking returned:", { track, trackErr });
//     if (trackErr)     throw trackErr;
//     if (!track)       return res.status(404).json({ error: "Tracking record not found" });
//     if (!track.internal_sku) {
//       console.log("   • Tracking record missing internal_sku");
//       return res.status(500).json({ error: "Tracking record missing internal_sku" });
//     }

//     const resolvedSku = track.internal_sku;
//     console.log("   • Resolved internal_sku:", resolvedSku);

//     // 2) home_depot_items lookup
//     console.log("   • Querying home_depot_items for", resolvedSku);
//     const { data: item, error: itemErr } = await sb
//       .from("home_depot_items")
//       .select("item_desc, item_image, internal_sku, temp_internal_sku")
//       .or(`internal_sku.eq.${resolvedSku},temp_internal_sku.eq.${resolvedSku}`)
//       .maybeSingle();

//     console.log("   • home_depot_items returned:", { item, itemErr });
//     if (itemErr)    throw itemErr;
//     if (!item)      return res.status(404).json({ error: "Item not found in home_depot_items" });

//     const skuUsed = (item.internal_sku === resolvedSku)
//       ? item.internal_sku
//       : item.temp_internal_sku;

//     return res.json({
//       item_name:  item.item_desc,
//       item_image: item.item_image,
//       sku_used:   skuUsed
//     });

//   } catch (err) {
//     console.error("   ! Error in /items/backup handler:", err.message);
//     return res.status(500).json({ error: err.message });
//   }
// });

// /**
//  * POST /track/:uuid/received
//  */
// app.post("/track/:uuid/received", async (req, res) => {
//   const { uuid } = req.params;
//   console.log(`→ POST /track/${uuid}/received`);

//   try {
//     const { data, error } = await sb
//       .from("all_items_tracking")
//       .update({ status: "Received", received_at: new Date().toISOString() })
//       .eq("UUID", uuid);

//     console.log("   • all_items_tracking update returned:", { data, error });
//     if (error) throw error;

//     return res.json({ message: "Item marked received" });
//   } catch (err) {
//     console.error("   ! Error marking received:", err.message);
//     return res.status(400).json({ error: err.message });
//   }
// });

// /**
//  * POST /track/:uuid/missing
//  */
// app.post("/track/:uuid/missing", async (req, res) => {
//   const { uuid } = req.params;
//   console.log(`→ POST /track/${uuid}/missing`);

//   try {
//     const { data, error } = await sb
//       .from("all_items_tracking")
//       .update({ status: "Missing", missing_flagged_at: new Date().toISOString() })
//       .eq("UUID", uuid);

//     console.log("   • all_items_tracking update returned:", { data, error });
//     if (error) throw error;

//     return res.json({ message: "Item marked missing" });
//   } catch (err) {
//     console.error("   ! Error marking missing:", err.message);
//     return res.status(400).json({ error: err.message });
//   }
// });

// /**
//  * Health-check
//  */
// app.get("/", (req, res) => {
//   console.log("→ GET /");
//   res.send("Inventory API up");
// });

// // ── HTTPS Server Startup ─────────────────────────────────────
// const httpsOptions = {
//   key : fs.readFileSync("/etc/letsencrypt/live/inventory.orcagroup.io/privkey.pem"),
//   cert: fs.readFileSync("/etc/letsencrypt/live/inventory.orcagroup.io/fullchain.pem")
// };

// https.createServer(httpsOptions, app)
//   .listen(PORT, () => {
//     console.log(`\n🚀 HTTPS server listening on port ${PORT}`);
//   });


// server.js
// require("dotenv").config();

// const express = require("express");
// const cors    = require("cors");
// const { createClient } = require("@supabase/supabase-js");

// // ── Configuration ────────────────────────────────────────────
// const PORT              = process.env.PORT || 5092;
// const SUPABASE_URL      = 'http://137.184.148.164:8000';
// const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// // ── Initialize Supabase client ──────────────────────────────
// const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// // ── Create Express app ──────────────────────────────────────
// const app = express();

// // ── Middleware ──────────────────────────────────────────────
// app.use(cors({ origin: "*" }));
// app.use(express.json());
// app.use((req, res, next) => {
//   console.log(`\n[${new Date().toISOString()}] ▶ ${req.method} ${req.originalUrl}`);
//   if (req.body && Object.keys(req.body).length) {
//     console.log("   ⮞ Body:", JSON.stringify(req.body));
//   }
//   next();
// });

// // ── Routes ────────────────────────────────────────────────────

// /**
//  * GET /items/:sku
//  *   Fetch from home_depot_items by DTH-prefixed internal_sku or temp_internal_sku.
//  */
// app.get("/items/:sku", async (req, res) => {
//   const { sku } = req.params;
//   console.log(`→ GET /items/${sku}`);

//   if (!/^DTH\d+$/.test(sku)) {
//     console.log("   • SKU not DTH-prefixed; returning 400");
//     return res.status(400).json({ error: "Use /items/backup/:backupSku for numeric SKUs" });
//   }

//   try {
//     console.log("   • Querying home_depot_items for", sku);
//     const { data, error } = await sb
//       .from("home_depot_items")
//       .select("item_desc, item_image, internal_sku, temp_internal_sku")
//       .or(`internal_sku.eq.${sku},temp_internal_sku.eq.${sku}`)
//       .maybeSingle();

//     console.log("   • home_depot_items returned:", { data, error });
//     if (error)  throw error;
//     if (!data) return res.status(404).json({ error: "Item not found" });

//     const skuUsed = (data.internal_sku === sku)
//       ? data.internal_sku
//       : data.temp_internal_sku;

//     return res.json({
//       item_name:  data.item_desc,
//       item_image: data.item_image,
//       sku_used:   skuUsed
//     });

//   } catch (err) {
//     console.error("   ! Error in /items handler:", err.message);
//     return res.status(500).json({ error: err.message });
//   }
// });

// /**
//  * GET /items/backup/:backupSku
//  *   1) Lookup all_items_tracking by backup_sku → internal_sku
//  *   2) Query home_depot_items by that internal_sku OR temp_internal_sku
//  *   3) Return item_name, item_image, sku_used
//  */
// app.get("/items/backup/:backupSku", async (req, res) => {
//   const { backupSku } = req.params;
//   console.log(`→ GET /items/backup/${backupSku}`);

//   if (!/^\d{7}$/.test(backupSku)) {
//     console.log("   • Invalid backup_sku format:", backupSku);
//     return res.status(400).json({ error: "Backup SKU must be exactly 7 digits" });
//   }

//   try {
//     // 1) all_items_tracking lookup
//     console.log("   • Querying all_items_tracking for backup_sku =", backupSku);
//     const { data: track, error: trackErr } = await sb
//       .from("all_items_tracking")
//       .select("internal_sku")
//       .eq("backup_sku", backupSku)
//       .maybeSingle();

//     console.log("   • all_items_tracking returned:", { track, trackErr });
//     if (trackErr)             throw trackErr;
//     if (!track)               return res.status(404).json({ error: "Tracking record not found" });
//     if (!track.internal_sku)  return res.status(500).json({ error: "Tracking record missing internal_sku" });

//     const resolvedSku = track.internal_sku;
//     console.log("   • Resolved internal_sku:", resolvedSku);

//     // 2) home_depot_items lookup
//     console.log("   • Querying home_depot_items for", resolvedSku);
//     const { data: item, error: itemErr } = await sb
//       .from("home_depot_items")
//       .select("item_desc, item_image, internal_sku, temp_internal_sku")
//       .or(`internal_sku.eq.${resolvedSku},temp_internal_sku.eq.${resolvedSku}`)
//       .maybeSingle();

//     console.log("   • home_depot_items returned:", { item, itemErr });
//     if (itemErr)  throw itemErr;
//     if (!item)    return res.status(404).json({ error: "Item not found in home_depot_items" });

//     const skuUsed = (item.internal_sku === resolvedSku)
//       ? item.internal_sku
//       : item.temp_internal_sku;

//     return res.json({
//       item_name:  item.item_desc,
//       item_image: item.item_image,
//       sku_used:   skuUsed
//     });

//   } catch (err) {
//     console.error("   ! Error in /items/backup handler:", err.message);
//     return res.status(500).json({ error: err.message });
//   }
// });

// /**
//  * POST /track/:uuid/received
//  *   Mark the all_items_tracking row with this UUID as Received.
//  */
// app.post("/track/:uuid/received", async (req, res) => {
//   const { uuid } = req.params;
//   console.log(`→ POST /track/${uuid}/received`);

//   try {
//     const { data, error } = await sb
//       .from("all_items_tracking")
//       .update({ status: "Received", received_at: new Date().toISOString() })
//       .eq("UUID", uuid);

//     console.log("   • all_items_tracking update returned:", { data, error });
//     if (error) throw error;

//     return res.json({ message: "Item marked received" });
//   } catch (err) {
//     console.error("   ! Error marking received:", err.message);
//     return res.status(400).json({ error: err.message });
//   }
// });

// /**
//  * POST /track/:uuid/missing
//  *   Mark the all_items_tracking row with this UUID as Missing.
//  */
// app.post("/track/:uuid/missing", async (req, res) => {
//   const { uuid } = req.params;
//   console.log(`→ POST /track/${uuid}/missing`);

//   try {
//     const { data, error } = await sb
//       .from("all_items_tracking")
//       .update({ status: "Missing", missing_flagged_at: new Date().toISOString() })
//       .eq("UUID", uuid);

//     console.log("   • all_items_tracking update returned:", { data, error });
//     if (error) throw error;

//     return res.json({ message: "Item marked missing" });
//   } catch (err) {
//     console.error("   ! Error marking missing:", err.message);
//     return res.status(400).json({ error: err.message });
//   }
// });
// app.post("/track-sku/:backupSku/:action", async (req, res) => {
//   const { backupSku, action } = req.params;
//   console.log(`→ POST /track-sku/${backupSku}/${action}`);

//   try {
//     // 1) ensure the tracking record exists
//     const { data: track, error: findErr } = await sb
//       .from("all_items_tracking")
//       .select("id")
//       .eq("backup_sku", backupSku)
//       .maybeSingle();
//     if (findErr) throw findErr;
//     if (!track) return res.status(404).json({ error: "Tracking record not found" });

//     // 2) build the update payload
//     const payload = action === "received"
//       ? { status: "Received", received_at: new Date().toISOString() }
//       : { status: "Missing",  missing_flagged_at: new Date().toISOString() };

//     // 3) apply it
//     const { data, error: updErr } = await sb
//       .from("all_items_tracking")
//       .update(payload)
//       .eq("backup_sku", backupSku);
//     if (updErr) throw updErr;

//     return res.json({ message: `Item flagged ${action}` });
//   } catch (err) {
//     console.error("   ! Error in /track-sku handler:", err.message);
//     return res.status(400).json({ error: err.message });
//   }
// });
// /**
//  * POST /track-sku/:backupSku/received
//  * POST /track-sku/:backupSku/missing
//  *   Mark by backup_sku for manual lookups.
//  */
// app.post("/track-sku/:backupSku/:action", async (req, res) => {
//   const { backupSku, action } = req.params;
//   console.log(`→ POST /track-sku/${backupSku}/${action}`);

//   try {
//     // ensure the tracking record exists
//     const { data: track, error: findErr } = await sb
//       .from("all_items_tracking")
//       .select("id")
//       .eq("backup_sku", backupSku)
//       .maybeSingle();

//     console.log("   • all_items_tracking find returned:", { track, findErr });
//     if (findErr) throw findErr;
//     if (!track)  return res.status(404).json({ error: "Tracking record not found" });

//     const payload = action === "received"
//       ? { status: "Received", received_at: new Date().toISOString() }
//       : { status: "Missing",  missing_flagged_at: new Date().toISOString() };

//     const { data, error: updErr } = await sb
//       .from("all_items_tracking")
//       .update(payload)
//       .eq("backup_sku", backupSku);

//     console.log("   • all_items_tracking update returned:", { data, updErr });
//     if (updErr) throw updErr;

//     return res.json({ message: `Item flagged ${action}` });
//   } catch (err) {
//     console.error("   ! Error in /track-sku handler:", err.message);
//     return res.status(400).json({ error: err.message });
//   }
// });

// // ── Home-Depot Order-History CRUD ───────────────────────────────────────────
// // POST /order-history               → create new row
// app.post("/order-history", async (req, res) => {
//   try {
//     const { data, error } = await sb
//       .from("home_depot_order_history")
//       .insert(req.body)        // body should contain any columns you want to set
//       .select()
//       .single();

//     if (error) throw error;
//     return res.status(201).json(data);          // created row (incl. order_item_number)
//   } catch (err) {
//     console.error("! POST /order-history:", err.message);
//     return res.status(400).json({ error: err.message });
//   }
// });

// // GET /order-history                → list (optionally filter by query-params)
// app.get("/order-history", async (req, res) => {
//   try {
//     const { order_id, user_id, sku_number } = req.query;   // add more filters if needed

//     let q = sb.from("home_depot_order_history").select("*").order("created_at", { ascending:false });
//     if (order_id)   q = q.eq("order_id",   order_id);
//     if (user_id)    q = q.eq("user_id",    user_id);
//     if (sku_number) q = q.eq("sku_number", sku_number);

//     const { data, error } = await q;
//     if (error) throw error;
//     return res.json(data);                    // array (could be empty)
//   } catch (err) {
//     console.error("! GET /order-history:", err.message);
//     return res.status(400).json({ error: err.message });
//   }
// });

// // GET /order-history/:itemId        → single row by primary-key
// app.get("/order-history/:itemId", async (req, res) => {
//   const { itemId } = req.params;
//   try {
//     const { data, error } = await sb
//       .from("home_depot_order_history")
//       .select("*")
//       .eq("order_item_number", itemId)
//       .maybeSingle();

//     if (error) throw error;
//     if (!data)  return res.status(404).json({ error: "Not found" });
//     return res.json(data);
//   } catch (err) {
//     console.error(`! GET /order-history/${itemId}:`, err.message);
//     return res.status(400).json({ error: err.message });
//   }
// });

// // PUT /order-history/:itemId        → update one/​many fields
// app.put("/order-history/:itemId", async (req, res) => {
//   const { itemId } = req.params;
//   try {
//     const { data, error } = await sb
//       .from("home_depot_order_history")
//       .update(req.body)                     // ONLY the columns you want to change
//       .eq("order_item_number", itemId)
//       .select()
//       .single();

//     if (error) throw error;
//     return res.json(data);
//   } catch (err) {
//     console.error(`! PUT /order-history/${itemId}:`, err.message);
//     return res.status(400).json({ error: err.message });
//   }
// });

// // DELETE /order-history/:itemId     → hard-delete row (remove if you prefer soft delete)
// app.delete("/order-history/:itemId", async (req, res) => {
//   const { itemId } = req.params;
//   try {
//     const { error } = await sb
//       .from("home_depot_order_history")
//       .delete()
//       .eq("order_item_number", itemId);

//     if (error) throw error;
//     return res.json({ message: "Row deleted" });
//   } catch (err) {
//     console.error(`! DELETE /order-history/${itemId}:`, err.message);
//     return res.status(400).json({ error: err.message });
//   }
// });
// // ────────────────────────────────────────────────────────────────────────────



// /**
//  * Health-check
//  */
// app.get("/", (req, res) => {
//   console.log("→ GET /");
//   res.send("Inventory API up");
// });

// // example – adjust table/columns to match your schema
// app.get("/orders/:orderId", async (req, res) => {
//   const { orderId } = req.params;
//   const { data, error } = await sb
//     .from("home_depot_orders")           // or whatever table holds the header
//     .select("*")
//     .eq("order_id", orderId)
//     .maybeSingle();

//   if (error)  return res.status(500).json({ error: error.message });
//   if (!data)  return res.status(404).json({ error: "Order not found" });
//   res.json(data);
// });


// // ── HTTPS Server Startup ─────────────────────────────────────

//  app.listen(PORT, () => {
//    console.log(`\n🚀 HTTP server listening on port ${PORT}`);
//  });
// require("dotenv").config();
// const fs      = require("fs");
// const https   = require("https");
// const express = require("express");
// const cors    = require("cors");
// const { createClient } = require("@supabase/supabase-js");

// /* ── Configuration ────────────────────────────────────────── */
// const PORT              = process.env.PORT || 5092;          // stays 5092
// const SUPABASE_URL      = "http://137.184.148.164:8000";
// const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// /* ── Initialize Supabase client ───────────────────────────── */
// const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// /* ── Express app & basic middleware ───────────────────────── */
// const app = express();
// app.use(cors({ origin: "*" }));
// app.use(express.json());
// app.use((req, _res, next) => {
//   console.log(`[${new Date().toISOString()}] ▶ ${req.method} ${req.originalUrl}`);
//   if (Object.keys(req.body || {}).length) console.log("   body:", req.body);
//   next();
// });

// /* ── Little helpers ───────────────────────────────────────── */
// const arrify      = v => (Array.isArray(v) ? v : [v]);
// const isBackupSku = s => /^\d{7}$/.test(s);


// const path = require("path");

// /* ---------- static images (CORS-friendly) ---------- */
// const IMG_DIR = "/var/sql/images";                // <-- where you’ll SCP / upload files
// app.use(
//   "/assets",                                      // GET /assets/<filename>
//   express.static(IMG_DIR, {
//     setHeaders: (res) => {
//       res.set("Access-Control-Allow-Origin", "*"); // let html2canvas pull it
//     },
//     extensions: ["png", "jpg", "jpeg", "webp"],
//   })
// );

// /* ── ITEMS ENDPOINTS (unchanged) ──────────────────────────── */
// // …  (keep your existing /items and /items/backup handlers)

// /* ── TRACKING (deduped into ONE route) ────────────────────── */
// app.post("/track/:uuid/:action(received|missing)", async (req, res) => {
//   const { uuid, action } = req.params;
//   const payload = action === "received"
//     ? { status: "Received", received_at: new Date().toISOString() }
//     : { status: "Missing",  missing_flagged_at: new Date().toISOString() };

//   try {
//     const { error } = await sb
//       .from("all_items_tracking")
//       .update(payload)
//       .eq("UUID", uuid);
//     if (error) throw error;
//     res.json({ message: `Item ${action}` });
//   } catch (err) {
//     console.error("! /track handler:", err.message);
//     res.status(400).json({ error: err.message });
//   }
// });

// /* track by backupSku */
// app.post("/track-sku/:backupSku/:action(received|missing)", async (req, res) => {
//   const { backupSku, action } = req.params;
//   if (!isBackupSku(backupSku)) {
//     return res.status(400).json({ error: "backupSku must be 7 digits" });
//   }
//   const payload = action === "received"
//     ? { status: "Received", received_at: new Date().toISOString() }
//     : { status: "Missing",  missing_flagged_at: new Date().toISOString() };

//   try {
//     const { error } = await sb
//       .from("all_items_tracking")
//       .update(payload)
//       .eq("backup_sku", backupSku);
//     if (error) throw error;
//     res.json({ message: `Item ${action}` });
//   } catch (err) {
//     console.error("! /track-sku handler:", err.message);
//     res.status(400).json({ error: err.message });
//   }
// });

// /* ── ORDER-HISTORY CRUD (array-aware) ─────────────────────── */

// /* CREATE */
// app.post("/order-history", async (req, res) => {
//   if (req.body.delivery_id && !Array.isArray(req.body.delivery_id)) {
//     req.body.delivery_id = arrify(req.body.delivery_id);
//   }
//   try {
//     const { data, error } = await sb
//       .from("home_depot_order_history")
//       .insert(req.body)
//       .select()
//       .single();
//     if (error) throw error;
//     res.status(201).json(data);
//   } catch (err) {
//     console.error("! POST /order-history:", err.message);
//     res.status(400).json({ error: err.message });
//   }
// });

// /* LIST */
// app.get("/order-history", async (req, res) => {
//   try {
//     const { order_id, user_id, sku_number, delivery_id } = req.query;

//     let q = sb.from("home_depot_order_history")
//               .select("*")
//               .order("created_at", { ascending: false });

//     if (order_id)   q = q.eq("order_id",   order_id);
//     if (user_id)    q = q.eq("user_id",    user_id);
//     if (sku_number) q = q.eq("sku_number", sku_number);
//     if (delivery_id) {
//       const id = parseInt(delivery_id, 10);
//       if (!Number.isInteger(id)) {
//         return res.status(400).json({ error: "delivery_id must be integer" });
//       }
//       q = q.contains("delivery_id", [id]);   // array-contains
//     }

//     const { data, error } = await q;
//     if (error) throw error;
//     res.json(data);
//   } catch (err) {
//     console.error("! GET /order-history:", err.message);
//     res.status(400).json({ error: err.message });
//   }
// });

// /* READ ONE */
// app.get("/order-history/:itemId", async (req, res) => {
//   const { itemId } = req.params;
//   try {
//     const { data, error } = await sb
//       .from("home_depot_order_history")
//       .select("*")
//       .eq("order_item_number", itemId)
//       .maybeSingle();
//     if (error) throw error;
//     if (!data)  return res.status(404).json({ error: "Not found" });
//     res.json(data);
//   } catch (err) {
//     console.error(`! GET /order-history/${itemId}:`, err.message);
//     res.status(400).json({ error: err.message });
//   }
// });

// /* UPDATE */
// app.put("/order-history/:itemId", async (req, res) => {
//   const { itemId } = req.params;
//   if (req.body.delivery_id && !Array.isArray(req.body.delivery_id)) {
//     req.body.delivery_id = arrify(req.body.delivery_id);
//   }
//   try {
//     const { data, error } = await sb
//       .from("home_depot_order_history")
//       .update(req.body)
//       .eq("order_item_number", itemId)
//       .select()
//       .single();
//     if (error) throw error;
//     res.json(data);
//   } catch (err) {
//     console.error(`! PUT /order-history/${itemId}:`, err.message);
//     res.status(400).json({ error: err.message });
//   }
// });

// /* DELETE */
// app.delete("/order-history/:itemId", async (req, res) => {
//   const { itemId } = req.params;
//   try {
//     const { error } = await sb
//       .from("home_depot_order_history")
//       .delete()
//       .eq("order_item_number", itemId);
//     if (error) throw error;
//     res.json({ message: "Row deleted" });
//   } catch (err) {
//     console.error(`! DELETE /order-history/${itemId}:`, err.message);
//     res.status(400).json({ error: err.message });
//   }
// });

// /* ── ORDER HEADER for deliveries page ─────────────────────── */
// app.get("/orders/:orderId", async (req, res) => {
//   const { orderId } = req.params;
//   try {
//     const { data, error } = await sb
//       .from("home_depot_orders")     // adjust if your table name differs
//       .select("*")
//       .eq("order_id", orderId)
//       .maybeSingle();
//     if (error) throw error;
//     if (!data) return res.status(404).json({ error: "Order not found" });
//     res.json(data);
//   } catch (err) {
//     console.error("! GET /orders/:orderId:", err.message);
//     res.status(500).json({ error: err.message });
//   }
// });

// /* ── Health-check (example) ───────────────────────────────── */
// app.get("/", (_req, res) => res.send("Inventory API up (HTTPS)"));

// /* ── HTTPS server startup ─────────────────────────────────── */
// const httpsOptions = {
//   key : fs.readFileSync("/etc/letsencrypt/live/inventory.orcagroup.io/privkey.pem"),
//   cert: fs.readFileSync("/etc/letsencrypt/live/inventory.orcagroup.io/fullchain.pem"),
//   // If you have an intermediate chain file, add `ca: fs.readFileSync('chain.pem')`
// };

// https.createServer(httpsOptions, app).listen(PORT, () => {
//   console.log(`🚀 HTTPS server listening on port ${PORT}`);
// });

require("dotenv").config();
const fs      = require("fs");
const https   = require("https");
const express = require("express");
const cors    = require("cors");
const multer  = require("multer");
const { createClient } = require("@supabase/supabase-js");

/* ── Configuration ────────────────────────────────────────── */
const PORT              = process.env.PORT || 5092;          // stays 5092
const SUPABASE_URL      = "http://137.184.148.164:8000";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

/* ── Initialize Supabase client ───────────────────────────── */
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ── Express app & basic middleware ───────────────────────── */
const app = express();
app.use(cors({ origin: "*" })); // NOTE: if your client uses credentials (cookies), switch to { origin: ["https://inventory.orcagroup.io"], credentials: true }
app.use(express.json());
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ▶ ${req.method} ${req.originalUrl}`);
  if (Object.keys(req.body || {}).length) console.log("   body:", req.body);
  next();
});

/* ── Little helpers ───────────────────────────────────────── */
const arrify      = v => (Array.isArray(v) ? v : [v]);
const isBackupSku = s => /^\d{7}$/.test(s);


const path = require("path");

/* ---------- static images (CORS-friendly) ---------- */
const IMG_DIR = "/var/sql/images";                // <-- where you’ll SCP / upload files
app.use(
  "/assets",                                      // GET /assets/<filename>
  express.static(IMG_DIR, {
    setHeaders: (res) => {
      res.set("Access-Control-Allow-Origin", "*"); // let html2canvas pull it
    },
    extensions: ["png", "jpg", "jpeg", "webp"],
  })
);

/* ---------- PDF uploads (save to /var/sql/delivery_pdfs) ---------- */
const PDF_DIR = "/var/sql/delivery_pdfs";
fs.mkdirSync(PDF_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PDF_DIR),
  filename: (req, file, cb) => {
    // Accept either a custom `filename`, or build from order_id & delivery_id
    const { filename, order_id, delivery_id } = req.body || {};
    const base =
      (typeof filename === "string" && filename.trim()) ||
      (order_id && delivery_id
        ? `order-${String(order_id)}-delivery-${String(delivery_id)}.pdf`
        : `upload-${Date.now()}.pdf`);

    // Very small sanitization (underscores for odd chars)
    let safe = String(base).replace(/[^-\w.]/g, "_");
    if (!safe.toLowerCase().endsWith(".pdf")) safe += ".pdf";
    cb(null, safe);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB cap (tune as needed)
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("PDFs only"));
    }
    cb(null, true);
  }
});

// Optional: serve saved PDFs for viewing
app.use(
  "/pdfs", // e.g., https://inventory.orcagroup.io:5092/pdfs/<filename>.pdf
  express.static(PDF_DIR, {
    setHeaders: (res) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("X-Content-Type-Options", "nosniff");
    }
  })
);

// Upload endpoint used by the front-end "Save to Server" button
/**
 * POST /delivery-pdfs
 * Form-data fields:
 *   - file: the PDF blob (required)
 *   - order_id: optional, used for filename if provided
 *   - delivery_id: optional, used for filename if provided
 *   - filename: optional explicit filename (takes precedence)
 * Returns: { ok, path, filename }
 */
app.post("/delivery-pdfs", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: "No file" });
    return res.json({
      ok: true,
      path: req.file.path,                       // absolute on-disk path
      filename: path.basename(req.file.path)
    });
  } catch (err) {
    console.error("! POST /delivery-pdfs:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// List all PDFs so the front-end can discover them
app.get("/pdfs-index", (req, res) => {
  fs.readdir(PDF_DIR, (err, files) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(files.filter(f => f.toLowerCase().endsWith(".pdf")));
  });
});

/* ---------- LABEL PDFs (/var/sql/pdf) ---------- */
const LABEL_DIR = "/var/sql/pdf";
fs.mkdirSync(LABEL_DIR, { recursive: true });

// Serve files (GET https://inventory.orcagroup.io:5092/labels/<filename>.pdf)
app.use(
  "/labels",
  express.static(LABEL_DIR, {
    setHeaders: (res) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("X-Content-Type-Options", "nosniff");
    },
  })
);

// List files (simple array of filenames, like [ "label-123.pdf", ... ])
// GET https://inventory.orcagroup.io:5092/labels-index
// Optional: GET .../labels-index?meta=1 returns [{name,size,mtimeMs}]
app.get("/labels-index", async (req, res) => {
  try {
    const entries = await fs.promises.readdir(LABEL_DIR, { withFileTypes: true });
    const pdfs = entries.filter(d => d.isFile() && /\.pdf$/i.test(d.name));

    if (req.query.meta === "1" || req.query.meta === "true") {
      const detailed = await Promise.all(
        pdfs.map(async d => {
          const full = path.join(LABEL_DIR, d.name);
          const st = await fs.promises.stat(full);
          return { name: d.name, size: st.size, mtimeMs: st.mtimeMs };
        })
      );
      detailed.sort((a,b) => b.mtimeMs - a.mtimeMs);
      res.set("Cache-Control", "no-store");
      return res.json(detailed);
    }

    // default: just filenames, sorted newest first by mtime
    const withTimes = await Promise.all(
      pdfs.map(async d => {
        const st = await fs.promises.stat(path.join(LABEL_DIR, d.name));
        return { name: d.name, mtimeMs: st.mtimeMs };
      })
    );
    withTimes.sort((a,b) => b.mtimeMs - a.mtimeMs);
    res.set("Cache-Control", "no-store");
    res.json(withTimes.map(x => x.name));
  } catch (e) {
    res.status(500).json({ error: e.message, dir: LABEL_DIR });
  }
});


/* ── ITEMS ENDPOINTS (unchanged) ──────────────────────────── */
// …  (keep your existing /items and /items/backup handlers)

/* ── TRACKING (deduped into ONE route) ────────────────────── */
app.post("/track/:uuid/:action(received|missing)", async (req, res) => {
  const { uuid, action } = req.params;
  const payload = action === "received"
    ? { status: "Received", received_at: new Date().toISOString() }
    : { status: "Missing",  missing_flagged_at: new Date().toISOString() };

  try {
    const { error } = await sb
      .from("all_items_tracking")
      .update(payload)
      .eq("UUID", uuid);
    if (error) throw error;
    res.json({ message: `Item ${action}` });
  } catch (err) {
    console.error("! /track handler:", err.message);
    res.status(400).json({ error: err.message });
  }
});

/* track by backupSku */
app.post("/track-sku/:backupSku/:action(received|missing)", async (req, res) => {
  const { backupSku, action } = req.params;
  if (!isBackupSku(backupSku)) {
    return res.status(400).json({ error: "backupSku must be 7 digits" });
  }
  const payload = action === "received"
    ? { status: "Received", received_at: new Date().toISOString() }
    : { status: "Missing",  missing_flagged_at: new Date().toISOString() };

  try {
    const { error } = await sb
      .from("all_items_tracking")
      .update(payload)
      .eq("backup_sku", backupSku);
    if (error) throw error;
    res.json({ message: `Item ${action}` });
  } catch (err) {
    console.error("! /track-sku handler:", err.message);
    res.status(400).json({ error: err.message });
  }
});

/* ── ORDER-HISTORY CRUD (array-aware) ─────────────────────── */

/* CREATE */
app.post("/order-history", async (req, res) => {
  if (req.body.delivery_id && !Array.isArray(req.body.delivery_id)) {
    req.body.delivery_id = arrify(req.body.delivery_id);
  }
  try {
    const { data, error } = await sb
      .from("home_depot_order_history")
      .insert(req.body)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error("! POST /order-history:", err.message);
    res.status(400).json({ error: err.message });
  }
});

/* LIST */
app.get("/order-history", async (req, res) => {
  try {
    const { order_id, user_id, sku_number, delivery_id } = req.query;

    let q = sb.from("home_depot_order_history")
              .select("*")
              .order("created_at", { ascending: false });

    if (order_id)   q = q.eq("order_id",   order_id);
    if (user_id)    q = q.eq("user_id",    user_id);
    if (sku_number) q = q.eq("sku_number", sku_number);
    if (delivery_id) {
      const id = parseInt(delivery_id, 10);
      if (!Number.isInteger(id)) {
        return res.status(400).json({ error: "delivery_id must be integer" });
      }
      q = q.contains("delivery_id", [id]);   // array-contains
    }

    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error("! GET /order-history:", err.message);
    res.status(400).json({ error: err.message });
  }
});

/* READ ONE */
app.get("/order-history/:itemId", async (req, res) => {
  const { itemId } = req.params;
  try {
    const { data, error } = await sb
      .from("home_depot_order_history")
      .select("*")
      .eq("order_item_number", itemId)
      .maybeSingle();
    if (error) throw error;
    if (!data)  return res.status(404).json({ error: "Not found" });
    res.json(data);
  } catch (err) {
    console.error(`! GET /order-history/${itemId}:`, err.message);
    res.status(400).json({ error: err.message });
  }
});

/* UPDATE */
app.put("/order-history/:itemId", async (req, res) => {
  const { itemId } = req.params;
  if (req.body.delivery_id && !Array.isArray(req.body.delivery_id)) {
    req.body.delivery_id = arrify(req.body.delivery_id);
  }
  try {
    const { data, error } = await sb
      .from("home_depot_order_history")
      .update(req.body)
      .eq("order_item_number", itemId)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(`! PUT /order-history/${itemId}:`, err.message);
    res.status(400).json({ error: err.message });
  }
});

/* DELETE */
app.delete("/order-history/:itemId", async (req, res) => {
  const { itemId } = req.params;
  try {
    const { error } = await sb
      .from("home_depot_order_history")
      .delete()
      .eq("order_item_number", itemId);
    if (error) throw error;
    res.json({ message: "Row deleted" });
  } catch (err) {
    console.error(`! DELETE /order-history/${itemId}:`, err.message);
    res.status(400).json({ error: err.message });
  }
});

/* ── ORDER HEADER for deliveries page ─────────────────────── */
app.get("/orders/:orderId", async (req, res) => {
  const { orderId } = req.params;
  try {
    const { data, error } = await sb
      .from("home_depot_orders")     // adjust if your table name differs
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Order not found" });
    res.json(data);
  } catch (err) {
    console.error("! GET /orders/:orderId:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── Health-check (example) ───────────────────────────────── */
app.get("/", (_req, res) => res.send("Inventory API up (HTTPS)"));

/* ── HTTPS server startup ─────────────────────────────────── */
const httpsOptions = {
  key : fs.readFileSync("/etc/letsencrypt/live/inventory.orcagroup.io/privkey.pem"),
  cert: fs.readFileSync("/etc/letsencrypt/live/inventory.orcagroup.io/fullchain.pem"),
  // If you have an intermediate chain file, add `ca: fs.readFileSync('chain.pem')`
};

https.createServer(httpsOptions, app).listen(PORT, () => {
  console.log(`🚀 HTTPS server listening on port ${PORT}`);
});
