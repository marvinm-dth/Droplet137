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
require("dotenv").config();
const fs      = require("fs");
const https   = require("https");
const express = require("express");
const cors    = require("cors");
const { createClient } = require("@supabase/supabase-js");

// ── Configuration ────────────────────────────────────────────
const PORT              = process.env.PORT || 5091;
const SUPABASE_URL      = 'http://137.184.148.164:8000';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// ── Initialize Supabase client ──────────────────────────────
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Create Express app ──────────────────────────────────────
const app = express();

// ── Middleware ──────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use((req, res, next) => {
  console.log(`\n[${new Date().toISOString()}] ▶ ${req.method} ${req.originalUrl}`);
  if (req.body && Object.keys(req.body).length) {
    console.log("   ⮞ Body:", JSON.stringify(req.body));
  }
  next();
});

// ── Routes ────────────────────────────────────────────────────

/**
 * GET /items/:sku
 *   Fetch from home_depot_items by DTH-prefixed internal_sku or temp_internal_sku.
 */
app.get("/items/:sku", async (req, res) => {
  const { sku } = req.params;
  console.log(`→ GET /items/${sku}`);

  if (!/^DTH\d+$/.test(sku)) {
    console.log("   • SKU not DTH-prefixed; returning 400");
    return res.status(400).json({ error: "Use /items/backup/:backupSku for numeric SKUs" });
  }

  try {
    console.log("   • Querying home_depot_items for", sku);
    const { data, error } = await sb
      .from("home_depot_items")
      .select("item_desc, item_image, internal_sku, temp_internal_sku")
      .or(`internal_sku.eq.${sku},temp_internal_sku.eq.${sku}`)
      .maybeSingle();

    console.log("   • home_depot_items returned:", { data, error });
    if (error)  throw error;
    if (!data) return res.status(404).json({ error: "Item not found" });

    const skuUsed = (data.internal_sku === sku)
      ? data.internal_sku
      : data.temp_internal_sku;

    return res.json({
      item_name:  data.item_desc,
      item_image: data.item_image,
      sku_used:   skuUsed
    });

  } catch (err) {
    console.error("   ! Error in /items handler:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /items/backup/:backupSku
 *   1) Lookup all_items_tracking by backup_sku → internal_sku
 *   2) Query home_depot_items by that internal_sku OR temp_internal_sku
 *   3) Return item_name, item_image, sku_used
 */
app.get("/items/backup/:backupSku", async (req, res) => {
  const { backupSku } = req.params;
  console.log(`→ GET /items/backup/${backupSku}`);

  if (!/^\d{7}$/.test(backupSku)) {
    console.log("   • Invalid backup_sku format:", backupSku);
    return res.status(400).json({ error: "Backup SKU must be exactly 7 digits" });
  }

  try {
    // 1) all_items_tracking lookup
    console.log("   • Querying all_items_tracking for backup_sku =", backupSku);
    const { data: track, error: trackErr } = await sb
      .from("all_items_tracking")
      .select("internal_sku")
      .eq("backup_sku", backupSku)
      .maybeSingle();

    console.log("   • all_items_tracking returned:", { track, trackErr });
    if (trackErr)             throw trackErr;
    if (!track)               return res.status(404).json({ error: "Tracking record not found" });
    if (!track.internal_sku)  return res.status(500).json({ error: "Tracking record missing internal_sku" });

    const resolvedSku = track.internal_sku;
    console.log("   • Resolved internal_sku:", resolvedSku);

    // 2) home_depot_items lookup
    console.log("   • Querying home_depot_items for", resolvedSku);
    const { data: item, error: itemErr } = await sb
      .from("home_depot_items")
      .select("item_desc, item_image, internal_sku, temp_internal_sku")
      .or(`internal_sku.eq.${resolvedSku},temp_internal_sku.eq.${resolvedSku}`)
      .maybeSingle();

    console.log("   • home_depot_items returned:", { item, itemErr });
    if (itemErr)  throw itemErr;
    if (!item)    return res.status(404).json({ error: "Item not found in home_depot_items" });

    const skuUsed = (item.internal_sku === resolvedSku)
      ? item.internal_sku
      : item.temp_internal_sku;

    return res.json({
      item_name:  item.item_desc,
      item_image: item.item_image,
      sku_used:   skuUsed
    });

  } catch (err) {
    console.error("   ! Error in /items/backup handler:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /track/:uuid/received
 *   Mark the all_items_tracking row with this UUID as Received.
 */
app.post("/track/:uuid/received", async (req, res) => {
  const { uuid } = req.params;
  console.log(`→ POST /track/${uuid}/received`);

  try {
    const { data, error } = await sb
      .from("all_items_tracking")
      .update({ status: "Received", received_at: new Date().toISOString() })
      .eq("UUID", uuid);

    console.log("   • all_items_tracking update returned:", { data, error });
    if (error) throw error;

    return res.json({ message: "Item marked received" });
  } catch (err) {
    console.error("   ! Error marking received:", err.message);
    return res.status(400).json({ error: err.message });
  }
});

/**
 * POST /track/:uuid/missing
 *   Mark the all_items_tracking row with this UUID as Missing.
 */
app.post("/track/:uuid/missing", async (req, res) => {
  const { uuid } = req.params;
  console.log(`→ POST /track/${uuid}/missing`);

  try {
    const { data, error } = await sb
      .from("all_items_tracking")
      .update({ status: "Missing", missing_flagged_at: new Date().toISOString() })
      .eq("UUID", uuid);

    console.log("   • all_items_tracking update returned:", { data, error });
    if (error) throw error;

    return res.json({ message: "Item marked missing" });
  } catch (err) {
    console.error("   ! Error marking missing:", err.message);
    return res.status(400).json({ error: err.message });
  }
});
app.post("/track-sku/:backupSku/:action", async (req, res) => {
  const { backupSku, action } = req.params;
  console.log(`→ POST /track-sku/${backupSku}/${action}`);

  try {
    // 1) ensure the tracking record exists
    const { data: track, error: findErr } = await sb
      .from("all_items_tracking")
      .select("id")
      .eq("backup_sku", backupSku)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!track) return res.status(404).json({ error: "Tracking record not found" });

    // 2) build the update payload
    const payload = action === "received"
      ? { status: "Received", received_at: new Date().toISOString() }
      : { status: "Missing",  missing_flagged_at: new Date().toISOString() };

    // 3) apply it
    const { data, error: updErr } = await sb
      .from("all_items_tracking")
      .update(payload)
      .eq("backup_sku", backupSku);
    if (updErr) throw updErr;

    return res.json({ message: `Item flagged ${action}` });
  } catch (err) {
    console.error("   ! Error in /track-sku handler:", err.message);
    return res.status(400).json({ error: err.message });
  }
});
/**
 * POST /track-sku/:backupSku/received
 * POST /track-sku/:backupSku/missing
 *   Mark by backup_sku for manual lookups.
 */
app.post("/track-sku/:backupSku/:action", async (req, res) => {
  const { backupSku, action } = req.params;
  console.log(`→ POST /track-sku/${backupSku}/${action}`);

  try {
    // ensure the tracking record exists
    const { data: track, error: findErr } = await sb
      .from("all_items_tracking")
      .select("id")
      .eq("backup_sku", backupSku)
      .maybeSingle();

    console.log("   • all_items_tracking find returned:", { track, findErr });
    if (findErr) throw findErr;
    if (!track)  return res.status(404).json({ error: "Tracking record not found" });

    const payload = action === "received"
      ? { status: "Received", received_at: new Date().toISOString() }
      : { status: "Missing",  missing_flagged_at: new Date().toISOString() };

    const { data, error: updErr } = await sb
      .from("all_items_tracking")
      .update(payload)
      .eq("backup_sku", backupSku);

    console.log("   • all_items_tracking update returned:", { data, updErr });
    if (updErr) throw updErr;

    return res.json({ message: `Item flagged ${action}` });
  } catch (err) {
    console.error("   ! Error in /track-sku handler:", err.message);
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Health-check
 */
app.get("/", (req, res) => {
  console.log("→ GET /");
  res.send("Inventory API up");
});

// ── HTTPS Server Startup ─────────────────────────────────────
const httpsOptions = {
  key : fs.readFileSync("/etc/letsencrypt/live/inventory.orcagroup.io/privkey.pem"),
  cert: fs.readFileSync("/etc/letsencrypt/live/inventory.orcagroup.io/fullchain.pem")
};
https.createServer(httpsOptions, app)
  .listen(PORT, () => {
    console.log(`\n🚀 HTTPS server listening on port ${PORT}`);
  });
