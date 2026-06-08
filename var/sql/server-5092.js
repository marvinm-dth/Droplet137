// require("dotenv").config();
// const fs = require("fs");
// const path = require("path");
// const https = require("https");
// const express = require("express");
// const cors = require("cors");
// const crypto = require("crypto");
// const { createClient } = require("@supabase/supabase-js");

// /* ── Config ───────────────────────────────────────────────────── */
// const PORT = process.env.PORT || 5092;
// const SUPABASE_URL = "http://137.184.148.164:8000";
// const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "SET_ME_IN_ENV"; // uses droplet env if present

// /* ── Supabase ─────────────────────────────────────────────────── */
// const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// /* ── Express ──────────────────────────────────────────────────── */
// const app = express();
// app.use(cors({ origin: "*" }));
// app.use(express.json({ limit: "2mb" }));
// app.use((req, _res, next) => {
//   console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
//   next();
// });

// /* ── Static: assets, PDFs, labels ─────────────────────────────── */
// const IMG_DIR = "/var/sql/images";
// const PDF_DIR = "/var/sql/pdfs";
// const LABEL_DIR = "/var/sql/labels";

// app.use(
//   "/assets",
//   express.static(IMG_DIR, {
//     setHeaders: (res) => res.set("Access-Control-Allow-Origin", "*"),
//     extensions: ["png", "jpg", "jpeg", "webp", "svg"],
//   })
// );
// app.use("/pdfs", express.static(PDF_DIR));
// app.use("/labels", express.static(LABEL_DIR));

// function listPdfNames(dir) {
//   try {
//     return fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf"));
//   } catch {
//     return [];
//   }
// }
// app.get("/pdfs-index", (_req, res) => res.json(listPdfNames(PDF_DIR)));
// app.get("/labels-index", (_req, res) => res.json(listPdfNames(LABEL_DIR)));

// /* ── Helpers ─────────────────────────────────────────────────── */
// const arrify = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
// const isBackupSku = (s) => /^\d{7}$/.test(s);
// function randomToken(n = 24) {
//   return crypto.randomBytes(n).toString("hex");
// }
// function randAlphaNum(len) {
//   const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
//   let out = "";
//   for (let i = 0; i < len; i++)
//     out += chars[crypto.randomBytes(1)[0] % chars.length];
//   return out;
// }

// function normalizeImage(pathOrUrl) {
//   if (!pathOrUrl) return null;
//   if (/^https?:\/\//i.test(String(pathOrUrl))) return pathOrUrl;
//   const fname = String(pathOrUrl).split("/").pop();
//   return (
//     "https://inventory.orcagroup.io:5023/image/" + encodeURIComponent(fname)
//   );
// }

// /* ── AUTH ─────────────────────────────────────────────────────── */
// app.post("/auth/login", async (req, res) => {
//   const { username, password, remember } = req.body || {};
//   if (!username || !password)
//     return res.status(400).json({ error: "username and password required" });
//   try {
//     const { data: user, error } = await sb
//       .from("all_users")
//       .select("*")
//       .eq("username", username)
//       .eq("password", password)
//       .maybeSingle();
//     if (error) throw error;
//     if (!user) return res.status(401).json({ error: "Invalid credentials" });

//     const token = randomToken(24);
//     await sb
//       .from("all_users")
//       .update({
//         token,
//         status_logged: true,
//         remember_me: !!remember,
//         login_duration: remember ? 60 * 60 * 24 * 30 : 60 * 60 * 8, // seconds
//       })
//       .eq("id", user.id);

//     res.json({
//       token,
//       id: user.id,
//       username: user.username,
//       role: user.role,
//       permission_level: user.permission_level,
//       user_manager: user.user_manager,
//       project_manager: user.project_manager,
//       is_user_jacob: user.is_user_jacob,
//     });
//   } catch (e) {
//     res.status(500).json({ error: e.message });
//   }
// });

// async function auth(req, res, next) {
//   const h = req.headers["authorization"];
//   if (!h)
//     return res.status(401).json({ error: "Missing Authorization header" });
//   const token = h.replace(/^Bearer\s+/i, "").trim();
//   const { data: user, error } = await sb
//     .from("all_users")
//     .select("*")
//     .eq("token", token)
//     .maybeSingle();
//   if (error) return res.status(500).json({ error: error.message });
//   if (!user) return res.status(401).json({ error: "Invalid token" });
//   req.user = user;
//   next();
// }
// app.get("/auth/me", auth, (req, res) => {
//   const u = req.user;
//   res.json({
//     id: u.id,
//     username: u.username,
//     role: u.role,
//     permission_level: u.permission_level,
//     user_manager: u.user_manager,
//     project_manager: u.project_manager,
//     is_user_jacob: u.is_user_jacob,
//   });
// });
// app.post("/auth/logout", auth, async (req, res) => {
//   try {
//     await sb
//       .from("all_users")
//       .update({ token: null, status_logged: false })
//       .eq("id", req.user.id);
//     res.json({ ok: true });
//   } catch (e) {
//     res.status(500).json({ error: e.message });
//   }
// });

// /* ── ITEMS (templates) ───────────────────────────────────────── */

// // Suppliers (id + supplier_name)
// app.get("/suppliers", auth, async (_req, res) => {
//   try {
//     const { data, error } = await sb
//       .from("dragon_tiny_homes_supplier")
//       .select("id,supplier_name")
//       .order("supplier_name", { ascending: true });
//     if (error) throw error;
//     res.json(data);
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });
// // Approvers = all_users where user_manager=true
// app.get("/approvers", auth, async (_req, res) => {
//   try {
//     const { data, error } = await sb
//       .from("all_users")
//       .select("id,username,email,role,user_manager")
//       .eq("user_manager", true)
//       .order("username", { ascending: true });
//     if (error) throw error;
//     res.json(data);
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });

// // List with basic filters

// app.get("/items", async (req, res) => {
//   const {
//     supplier_id,
//     q,
//     limit = 500,
//     offset = 0,
//     material_id,
//     internal_sku,
//     temp_internal_sku,
//     sku,
//     backup_sku,
//   } = req.query;
//   try {
//     const limitN = Math.min(2000, Number(limit) || 500);
//     const offsetN = Math.max(0, Number(offset) || 0);
//     let qy = sb
//       .from("home_depot_items")
//       .select("*")
//       .range(offsetN, offsetN + limitN - 1);
//     if (supplier_id) qy = qy.eq("supplier_id", supplier_id);
//     if (material_id) qy = qy.eq("material_id", material_id);
//     if (internal_sku) qy = qy.eq("internal_sku", internal_sku);
//     if (temp_internal_sku) qy = qy.eq("temp_internal_sku", temp_internal_sku);
//     if (sku) qy = qy.or(`internal_sku.eq.${sku},temp_internal_sku.eq.${sku}`);
//     if (q) qy = qy.ilike("item_desc", `%${q}%`);
//     const { data, error } = await qy;
//     if (error) throw error;
//     const out = (data || []).map((it) => ({
//       ...it,
//       item_image: normalizeImage(it.item_image),
//     }));
//     res.json(out);
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });

// // Create
// app.post("/items", auth, async (req, res) => {
//   try {
//     const payload = req.body || {};
//     const { data, error } = await sb
//       .from("home_depot_items")
//       .insert(payload)
//       .select()
//       .single();
//     if (error) throw error;
//     res.status(201).json(data);
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });

// // Update
// app.put("/items/:material_id", auth, async (req, res) => {
//   const { material_id } = req.params;
//   try {
//     const { data, error } = await sb
//       .from("home_depot_items")
//       .update(req.body)
//       .eq("material_id", material_id)
//       .select()
//       .single();
//     if (error) throw error;
//     res.json(data);
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });

// // Delete
// app.delete("/items/:material_id", auth, async (req, res) => {
//   const { material_id } = req.params;
//   try {
//     const { error } = await sb
//       .from("home_depot_items")
//       .delete()
//       .eq("material_id", material_id);
//     if (error) throw error;
//     res.json({ message: "deleted" });
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });

// /* DTH SKU & labels helpers */
// function composeDTHSku({
//   dept = "00",
//   type = "0",
//   category = "AA",
//   number = 1,
// }) {
//   const dd = String(dept).padStart(2, "0");
//   const tt = String(type).slice(0, 1); // 1 char
//   const cc = String(category).padStart(2, "A");
//   const nn = String(number).padStart(4, "0"); // 4+1? examples vary; use 4 here
//   return `DTH${dd}${tt}${cc}${nn}`;
// }

// app.post("/sku/compose", auth, (req, res) => {
//   try {
//     res.json({ dth_sku: composeDTHSku(req.body || {}) });
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });

// app.post("/labels/temp/batch", auth, async (req, res) => {
//   const { count = 100, dept = "00" } = req.body || {};
//   const out = [];
//   for (let i = 0; i < Math.min(2000, Number(count)); i++) {
//     const serial = String(Math.floor(Math.random() * 10 ** 8)).padStart(8, "0");
//     out.push(`DTH${dept}${serial}`);
//   }
//   res.json({ labels: out });
// });

// /* ── TRACK & LOOKUP (unchanged core) ───────────────────────── */
// app.get("/items/:sku", async (req, res) => {
//   const { sku } = req.params;
//   if (!/^DTH\d+$/.test(sku))
//     return res
//       .status(400)
//       .json({ error: "Use /items/backup/:backupSku for numeric SKUs" });
//   try {
//     const { data, error } = await sb
//       .from("home_depot_items")
//       .select("item_desc, item_image, internal_sku, temp_internal_sku")
//       .or(`internal_sku.eq.${sku},temp_internal_sku.eq.${sku}`)
//       .maybeSingle();
//     if (error) throw error;
//     if (!data) return res.status(404).json({ error: "Item not found" });
//     const skuUsed =
//       data.internal_sku === sku ? data.internal_sku : data.temp_internal_sku;
//     res.json({
//       item_name: data.item_desc,
//       item_image: normalizeImage(data.item_image),
//       sku_used: skuUsed,
//     });
//   } catch (e) {
//     res.status(500).json({ error: e.message });
//   }
// });

// app.get("/items/backup/:backupSku", async (req, res) => {
//   const { backupSku } = req.params;
//   if (!isBackupSku(backupSku))
//     return res
//       .status(400)
//       .json({ error: "Backup SKU must be exactly 7 digits" });
//   try {
//     const { data: track, error: tErr } = await sb
//       .from("all_items_tracking")
//       .select("internal_sku")
//       .eq("backup_sku", backupSku)
//       .maybeSingle();
//     if (tErr) throw tErr;
//     if (!track || !track.internal_sku)
//       return res.status(404).json({ error: "Tracking record not found" });

//     const { data: item, error: iErr } = await sb
//       .from("home_depot_items")
//       .select("item_desc, item_image, internal_sku, temp_internal_sku")
//       .or(
//         `internal_sku.eq.${track.internal_sku},temp_internal_sku.eq.${track.internal_sku}`
//       )
//       .maybeSingle();
//     if (iErr) throw iErr;
//     if (!item)
//       return res
//         .status(404)
//         .json({ error: "Item not found in home_depot_items" });
//     const skuUsed =
//       item.internal_sku === track.internal_sku
//         ? item.internal_sku
//         : item.temp_internal_sku;
//     res.json({
//       item_name: item.item_desc,
//       item_image: normalizeImage(item.item_image),
//       sku_used: skuUsed,
//     });
//   } catch (e) {
//     res.status(500).json({ error: e.message });
//   }
// });

// app.post("/track/:uuid/:action(received|missing)", async (req, res) => {
//   const { uuid, action } = req.params;
//   const payload =
//     action === "received"
//       ? { status: "Received", received_at: new Date().toISOString() }
//       : { status: "Missing", missing_flagged_at: new Date().toISOString() };
//   try {
//     const { error } = await sb
//       .from("all_items_tracking")
//       .update(payload)
//       .eq("UUID", uuid);
//     if (error) throw error;
//     res.json({ message: `Item ${action}` });
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });

// app.post(
//   "/track-sku/:backupSku/:action(received|missing)",
//   async (req, res) => {
//     const { backupSku, action } = req.params;
//     if (!isBackupSku(backupSku))
//       return res.status(400).json({ error: "backupSku must be 7 digits" });
//     const payload =
//       action === "received"
//         ? { status: "Received", received_at: new Date().toISOString() }
//         : { status: "Missing", missing_flagged_at: new Date().toISOString() };
//     try {
//       const { error } = await sb
//         .from("all_items_tracking")
//         .update(payload)
//         .eq("backup_sku", backupSku);
//       if (error) throw error;
//       res.json({ message: `Item ${action}` });
//     } catch (e) {
//       res.status(400).json({ error: e.message });
//     }
//   }
// );

// /* ── ORDER HISTORY (deliveries) – preserved API shape ───────── */
// app.post("/order-history", async (req, res) => {
//   if (req.body.delivery_id && !Array.isArray(req.body.delivery_id))
//     req.body.delivery_id = arrify(req.body.delivery_id);
//   try {
//     const { data, error } = await sb
//       .from("home_depot_order_history")
//       .insert(req.body)
//       .select()
//       .single();
//     if (error) throw error;
//     res.status(201).json(data);
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });

// app.get("/order-history", async (req, res) => {
//   try {
//     const { order_id, user_id, sku_number, delivery_id } = req.query;
//     let q = sb
//       .from("home_depot_order_history")
//       .select("*")
//       .order("created_at", { ascending: false });
//     if (order_id) q = q.eq("order_id", order_id);
//     if (user_id) q = q.eq("user_id", user_id);
//     if (sku_number) q = q.eq("sku_number", sku_number);
//     if (delivery_id) q = q.contains("delivery_id", [parseInt(delivery_id, 10)]);
//     const { data, error } = await q;
//     if (error) throw error;
//     res.json(data);
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });

// app.get("/order-history/:itemId", async (req, res) => {
//   try {
//     const { data, error } = await sb
//       .from("home_depot_order_history")
//       .select("*")
//       .eq("order_item_number", req.params.itemId)
//       .maybeSingle();
//     if (error) throw error;
//     if (!data) return res.status(404).json({ error: "Not found" });
//     res.json(data);
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });

// app.put("/order-history/:itemId", async (req, res) => {
//   if (req.body.delivery_id && !Array.isArray(req.body.delivery_id))
//     req.body.delivery_id = arrify(req.body.delivery_id);
//   try {
//     const { data, error } = await sb
//       .from("home_depot_order_history")
//       .update(req.body)
//       .eq("order_item_number", req.params.itemId)
//       .select()
//       .single();
//     if (error) throw error;
//     res.json(data);
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });

// app.delete("/order-history/:itemId", async (req, res) => {
//   try {
//     const { error } = await sb
//       .from("home_depot_order_history")
//       .delete()
//       .eq("order_item_number", req.params.itemId);
//     if (error) throw error;
//     res.json({ message: "Row deleted" });
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });

// /* ── ORDER headers (for deliveries page) ───────────────────── */
// app.get("/orders/:orderId", async (req, res) => {
//   const { orderId } = req.params;
//   try {
//     const { data, error } = await sb
//       .from("home_depot_orders")
//       .select("*")
//       .eq("order_id", orderId)
//       .maybeSingle();
//     if (error) throw error;
//     if (!data) return res.status(404).json({ error: "Order not found" });
//     res.json(data);
//   } catch (e) {
//     res.status(500).json({ error: e.message });
//   }
// });

// /* ── ORDERS CRUD + approvals (simple) ──────────────────────── */
// app.get("/orders", auth, async (req, res) => {
//   const { status, limit = 200 } = req.query;
//   try {
//     let q = sb
//       .from("home_depot_orders")
//       .select("*")
//       .order("created_at", { ascending: false })
//       .limit(+limit);
//     if (status) q = q.eq("order_status", status);
//     const { data, error } = await q;
//     if (error) throw error;
//     res.json(data);
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });

// app.post("/orders", auth, async (req, res) => {
//   try {
//     const payload = {
//       ...req.body,
//       created_at: new Date().toISOString(),
//       created_by: req.user && req.user.id ? req.user.id : null,
//     };

//     const { data, error } = await sb
//       .from("home_depot_orders")
//       .insert(payload)
//       .select()
//       .single();
//     if (error) throw error;
//     res.status(201).json(data);
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });

// app.put("/orders/:orderId", auth, async (req, res) => {
//   try {
//     const { data, error } = await sb
//       .from("home_depot_orders")
//       .update(req.body)
//       .eq("order_id", req.params.orderId)
//       .select()
//       .single();
//     if (error) throw error;
//     res.json(data);
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });

// app.post("/orders/:orderId/approve", auth, async (req, res) => {
//   // only managers or Jacob
//   if (!(req.user && (req.user.user_manager || req.user.is_user_jacob))) {
//     return res.status(403).json({ error: "Not authorized" });
//   }

//   try {
//     const { data, error } = await sb
//       .from("home_depot_orders")
//       .update({
//         order_status: "Approved",
//         approved_by: req.user.id,
//         approved_at: new Date().toISOString(),
//       })
//       .eq("order_id", req.params.orderId)
//       .select()
//       .single();
//     if (error) throw error;
//     // notify
//     await sb.from("inventory_notifications").insert({
//       notification_type: "order_approved",
//       user_lists: "managers",
//       is_cleared_for: null,
//       notification_message: `Order ${req.params.orderId} approved by ${req.user.username}`,
//     });
//     res.json(data);
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });

// /* ── Notifications ─────────────────────────────────────────── */
// app.get("/notifications", auth, async (req, res) => {
//   try {
//     const { data, error } = await sb
//       .from("inventory_notifications")
//       .select("*")
//       .order("created_at", { ascending: false })
//       .limit(200);
//     if (error) throw error;
//     res.json(data);
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });
// app.post("/notifications", auth, async (req, res) => {
//   try {
//     const payload = { created_at: new Date().toISOString(), ...req.body };
//     const { data, error } = await sb
//       .from("inventory_notifications")
//       .insert(payload)
//       .select()
//       .single();
//     if (error) throw error;
//     res.status(201).json(data);
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });
// app.post("/notifications/:id/clear", auth, async (req, res) => {
//   try {
//     const { data, error } = await sb
//       .from("inventory_notifications")
//       .update({ is_cleared_for: String(req.user.id) })
//       .eq("id", req.params.id)
//       .select()
//       .single();
//     if (error) throw error;
//     res.json(data);
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });

// /* ── Locations (simple tree) ───────────────────────────────── */
// // assumes a table inventory_locations(id bigint, name text, parent_id bigint null, barcode text, created_at timestamptz)
// app.get("/locations", auth, async (_req, res) => {
//   try {
//     const { data, error } = await sb
//       .from("inventory_locations")
//       .select("*")
//       .order("name", { ascending: true });
//     if (error) throw error;
//     res.json(data);
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });
// app.post("/locations", auth, async (req, res) => {
//   try {
//     const name = req.body?.name || "Location";
//     const parent_id = req.body?.parent_id || null;
//     const barcode = "DL-" + randAlphaNum(6);
//     const { data, error } = await sb
//       .from("inventory_locations")
//       .insert({
//         name,
//         parent_id,
//         barcode,
//         created_at: new Date().toISOString(),
//       })
//       .select()
//       .single();
//     if (error) throw error;
//     res.status(201).json(data);
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });
// app.post("/locations/assign", auth, async (req, res) => {
//   const { sku, location_id } = req.body || {};
//   if (!sku || !location_id)
//     return res.status(400).json({ error: "sku and location_id required" });
//   try {
//     // write both id and readable path if your schema has it
//     const { data, error } = await sb
//       .from("home_depot_items")
//       .update({ inventory_location_id: location_id })
//       .or(`internal_sku.eq.${sku},temp_internal_sku.eq.${sku}`)
//       .select()
//       .single();
//     if (error) throw error;
//     res.json({ ok: true, item: data });
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });

// /* ── Inventory analytics & pulls ───────────────────────────── */
// app.get("/inventory/summary", auth, async (_req, res) => {
//   try {
//     const { data, error } = await sb
//       .from("home_depot_items")
//       .select(
//         "material_id,item_desc,inventory,reorder_point,pack_size,inventory_location_id"
//       );
//     if (error) throw error;
//     res.json(data);
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });
// app.get("/inventory/usage", auth, async (req, res) => {
//   const { project_id, days = 90 } = req.query;
//   try {
//     let q = sb
//       .from("home_depot_inventory_logs")
//       .select("log_date,material_id,project_id,project_name,quantity_change");
//     const since = new Date(
//       Date.now() - (Number(days) || 90) * 24 * 3600 * 1000
//     ).toISOString();
//     q = q.gte("log_date", since);
//     if (project_id) q = q.eq("project_id", project_id);
//     const { data, error } = await q;
//     if (error) throw error;
//     res.json(data);
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });
// app.post("/inventory/pull", auth, async (req, res) => {
//   const { material_id, quantity, project_id, project_name } = req.body || {};
//   if (!material_id || !quantity)
//     return res.status(400).json({ error: "material_id and quantity required" });
//   try {
//     // decrement inventory
//     const { data: item, error: e1 } = await sb
//       .from("home_depot_items")
//       .select("inventory")
//       .eq("material_id", material_id)
//       .maybeSingle();
//     if (e1) throw e1;
//     const prev =
//       item && typeof item.inventory === "number" ? item.inventory : 0;
//     const cur = prev - Number(quantity);
//     await sb
//       .from("home_depot_items")
//       .update({ inventory: cur })
//       .eq("material_id", material_id);
//     await sb.from("home_depot_inventory_logs").insert({
//       name: "Pull",
//       log_date: new Date().toISOString(),
//       material_id,
//       previous_quantity: prev,
//       current_quantity: cur,
//       quantity_change: -Math.abs(Number(quantity)),
//       project_id: project_id || null,
//       project_name: project_name || null,
//       log_description: "Material requested/used",
//     });
//     const reorderPoint =
//       item && typeof item.reorder_point === "number" ? item.reorder_point : 0;
//     if (cur <= 0 || cur <= reorderPoint) {
//       await sb.from("inventory_notifications").insert({
//         notification_type: "reorder",
//         user_lists: "managers",
//         notification_message: `Material ${material_id} below reorder point`,
//       });
//     }
//     res.json({ ok: true, current_quantity: cur });
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });

// /* ── Health ─────────────────────────────────────────────────── */
// app.get("/", (_req, res) => res.send("Inventory API up (HTTPS)"));

// /* ── HTTPS startup ──────────────────────────────────────────── */
// const httpsOptions = {
//   key: fs.readFileSync(
//     "/etc/letsencrypt/live/inventory.orcagroup.io/privkey.pem"
//   ),
//   cert: fs.readFileSync(
//     "/etc/letsencrypt/live/inventory.orcagroup.io/fullchain.pem"
//   ),
// };
// https.createServer(httpsOptions, app).listen(PORT, () => {
//   console.log(`🚀 HTTPS API listening on port ${PORT}`);
// });

/* Dragon Tiny Homes – Inventory API (HTTPS, port 5092)
   - Extends your existing server with: auth, items CRUD, orders CRUD + approvals,
     notifications, locations, inventory analytics, PDFs/labels indices.
*/
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const https = require("https");
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

/* ── Config ───────────────────────────────────────────────────── */
const PORT = process.env.PORT || 5092;
const SUPABASE_URL = "http://137.184.148.164:8000";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "SET_ME_IN_ENV"; // uses droplet env if present

/* ── Supabase ─────────────────────────────────────────────────── */
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ── Express ──────────────────────────────────────────────────── */
const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "2mb" }));
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

/* ── Static: assets, PDFs, labels ─────────────────────────────── */
const IMG_DIR = "/var/sql/images";
const PDF_DIR = "/var/sql/pdfs";
const LABEL_DIR = "/var/sql/labels";

app.use(
  "/assets",
  express.static(IMG_DIR, {
    setHeaders: (res) => res.set("Access-Control-Allow-Origin", "*"),
    extensions: ["png", "jpg", "jpeg", "webp", "svg"],
  })
);
app.use("/pdfs", express.static(PDF_DIR));
app.use("/labels", express.static(LABEL_DIR));

function listPdfNames(dir) {
  try {
    return fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf"));
  } catch {
    return [];
  }
}
app.get("/pdfs-index", (_req, res) => res.json(listPdfNames(PDF_DIR)));
app.get("/labels-index", (_req, res) => res.json(listPdfNames(LABEL_DIR)));

/* ── Helpers ─────────────────────────────────────────────────── */
const arrify = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const isBackupSku = (s) => /^\d{7}$/.test(s);
function randomToken(n = 24) {
  return crypto.randomBytes(n).toString("hex");
}
function randAlphaNum(len) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < len; i++)
    out += chars[crypto.randomBytes(1)[0] % chars.length];
  return out;
}

function normalizeImage(pathOrUrl) {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(String(pathOrUrl))) return pathOrUrl;
  const fname = String(pathOrUrl).split("/").pop();
  return (
    "https://inventory.orcagroup.io:5023/image/" + encodeURIComponent(fname)
  );
}

/* ── AUTH ─────────────────────────────────────────────────────── */
app.post("/auth/login", async (req, res) => {
  const body = req.body || {};
  const username = body.username;
  const password = body.password;
  const remember = body.remember;

  if (!username || !password)
    return res.status(400).json({ error: "username and password required" });
  try {
    const { data: user, error } = await sb
      .from("all_users")
      .select("*")
      .eq("username", username)
      .eq("password", password)
      .maybeSingle();
    if (error) throw error;
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const token = randomToken(24);
    await sb
      .from("all_users")
      .update({
        token,
        status_logged: true,
        remember_me: !!remember,
        login_duration: remember ? 60 * 60 * 24 * 30 : 60 * 60 * 8, // seconds
      })
      .eq("id", user.id);

    res.json({
      token,
      id: user.id,
      username: user.username,
      role: user.role,
      permission_level: user.permission_level,
      user_manager: user.user_manager,
      project_manager: user.project_manager,
      is_user_jacob: user.is_user_jacob,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function auth(req, res, next) {
  const h = req.headers["authorization"];
  if (!h)
    return res.status(401).json({ error: "Missing Authorization header" });
  const token = h.replace(/^Bearer\s+/i, "").trim();
  const { data: user, error } = await sb
    .from("all_users")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!user) return res.status(401).json({ error: "Invalid token" });
  req.user = user;
  next();
}
app.get("/auth/me", auth, (req, res) => {
  const u = req.user;
  res.json({
    id: u.id,
    username: u.username,
    role: u.role,
    permission_level: u.permission_level,
    user_manager: u.user_manager,
    project_manager: u.project_manager,
    is_user_jacob: u.is_user_jacob,
  });
});
app.post("/auth/logout", auth, async (req, res) => {
  try {
    await sb
      .from("all_users")
      .update({ token: null, status_logged: false })
      .eq("id", req.user.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── ITEMS (templates) ───────────────────────────────────────── */

// Suppliers (id + supplier_name)
app.get("/suppliers", auth, async (_req, res) => {
  try {
    const { data, error } = await sb
      .from("dragon_tiny_homes_supplier")
      .select("id,supplier_name")
      .order("supplier_name", { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
// Approvers = all_users where user_manager=true
app.get("/approvers", auth, async (_req, res) => {
  try {
    const { data, error } = await sb
      .from("all_users")
      .select("id,username,email,role,user_manager")
      .eq("user_manager", true)
      .order("username", { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// List with basic filters
app.get("/items", async (req, res) => {
  const qparams = req.query || {};
  const supplier_id = qparams.supplier_id;
  const q = qparams.q;
  const limit = qparams.limit || 500;
  const offset = qparams.offset || 0;
  const material_id = qparams.material_id;
  const internal_sku = qparams.internal_sku;
  const temp_internal_sku = qparams.temp_internal_sku;
  const sku = qparams.sku;

  try {
    const limitN = Math.min(2000, Number(limit) || 500);
    const offsetN = Math.max(0, Number(offset) || 0);
    let qy = sb
      .from("home_depot_items")
      .select("*")
      .range(offsetN, offsetN + limitN - 1);
    if (supplier_id) qy = qy.eq("supplier_id", supplier_id);
    if (material_id) qy = qy.eq("material_id", material_id);
    if (internal_sku) qy = qy.eq("internal_sku", internal_sku);
    if (temp_internal_sku) qy = qy.eq("temp_internal_sku", temp_internal_sku);
    if (sku) qy = qy.or(`internal_sku.eq.${sku},temp_internal_sku.eq.${sku}`);
    if (q) qy = qy.ilike("item_desc", `%${q}%`);
    const { data, error } = await qy;
    if (error) throw error;
    const out = (data || []).map((it) => ({
      ...it,
      item_image: normalizeImage(it.item_image),
    }));
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* DTH SKU & labels helpers */
function composeDTHSku({
  dept = "00",
  type = "0",
  category = "AA",
  number = 1,
}) {
  const dd = String(dept).padStart(2, "0");
  const tt = String(type).slice(0, 1); // 1 char
  const cc = String(category).padStart(2, "A");
  const nn = String(number).padStart(4, "0"); // 4+1? examples vary; use 4 here
  return `DTH${dd}${tt}${cc}${nn}`;
}
app.post("/sku/compose", auth, (req, res) => {
  try {
    res.json({ dth_sku: composeDTHSku(req.body || {}) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/labels/temp/batch", auth, async (req, res) => {
  const body = req.body || {};
  const count = body.count || 100;
  const dept = body.dept || "00";
  const out = [];
  const max = Math.min(2000, Number(count));
  for (let i = 0; i < max; i++) {
    const serial = String(Math.floor(Math.random() * Math.pow(10, 8))).padStart(
      8,
      "0"
    );
    out.push(`DTH${dept}${serial}`);
  }
  res.json({ labels: out });
});

/* ── TRACK & LOOKUP ─────────────────────────────────────────── */
/* Place the more specific backup route BEFORE /items/:sku to avoid shadowing */
app.get("/items/backup/:backupSku", async (req, res) => {
  const backupSku = req.params.backupSku;
  if (!isBackupSku(backupSku))
    return res
      .status(400)
      .json({ error: "Backup SKU must be exactly 7 digits" });
  try {
    const { data: track, error: tErr } = await sb
      .from("all_items_tracking")
      .select("internal_sku")
      .eq("backup_sku", backupSku)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!track || !track.internal_sku)
      return res.status(404).json({ error: "Tracking record not found" });

    const fields = "item_desc, item_image, internal_sku, temp_internal_sku";
    let { data: item, error: iErr } = await sb
      .from("home_depot_items")
      .select(fields)
      .eq("internal_sku", track.internal_sku)
      .maybeSingle();
    if (iErr) throw iErr;
    if (!item) {
      const r = await sb
        .from("home_depot_items")
        .select(fields)
        .eq("temp_internal_sku", track.internal_sku)
        .maybeSingle();
      if (r.error) throw r.error;
      item = r.data;
    }
    if (!item)
      return res
        .status(404)
        .json({ error: "Item not found in home_depot_items" });

    const skuUsed =
      item.internal_sku === track.internal_sku
        ? item.internal_sku
        : item.temp_internal_sku;
    res.json({
      item_name: item.item_desc,
      item_image: normalizeImage(item.item_image),
      sku_used: skuUsed,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/items/:sku", async (req, res) => {
  const sku = req.params.sku;
  if (!/^DTH\d+$/.test(sku))
    return res
      .status(400)
      .json({ error: "Use /items/backup/:backupSku for numeric SKUs" });
  try {
    const fields = "item_desc, item_image, internal_sku, temp_internal_sku";
    let { data: item, error } = await sb
      .from("home_depot_items")
      .select(fields)
      .eq("internal_sku", sku)
      .maybeSingle();
    if (error) throw error;
    if (!item) {
      const r = await sb
        .from("home_depot_items")
        .select(fields)
        .eq("temp_internal_sku", sku)
        .maybeSingle();
      if (r.error) throw r.error;
      item = r.data;
    }
    if (!item) return res.status(404).json({ error: "Item not found" });
    const skuUsed =
      item.internal_sku === sku ? item.internal_sku : item.temp_internal_sku;
    res.json({
      item_name: item.item_desc,
      item_image: normalizeImage(item.item_image),
      sku_used: skuUsed,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/track/:uuid/:action(received|missing)", async (req, res) => {
  const uuid = req.params.uuid;
  const action = req.params.action;
  const payload =
    action === "received"
      ? { status: "Received", received_at: new Date().toISOString() }
      : { status: "Missing", missing_flagged_at: new Date().toISOString() };
  try {
    const { error } = await sb
      .from("all_items_tracking")
      .update(payload)
      .eq("UUID", uuid);
    if (error) throw error;
    res.json({ message: `Item ${action}` });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post(
  "/track-sku/:backupSku/:action(received|missing)",
  async (req, res) => {
    const backupSku = req.params.backupSku;
    const action = req.params.action;
    if (!isBackupSku(backupSku))
      return res.status(400).json({ error: "backupSku must be 7 digits" });
    const payload =
      action === "received"
        ? { status: "Received", received_at: new Date().toISOString() }
        : { status: "Missing", missing_flagged_at: new Date().toISOString() };
    try {
      const { error } = await sb
        .from("all_items_tracking")
        .update(payload)
        .eq("backup_sku", backupSku);
      if (error) throw error;
      res.json({ message: `Item ${action}` });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);
// GET /tracking?order_id=271  (optional: &internal_sku=DTH010A0001)
app.get("/tracking", async (req, res) => {
  try {
    const { order_id, internal_sku } = req.query;
    let q = sb
      .from("all_items_tracking")
      .select("*")
      .order("created_at", { ascending: true });
    if (order_id) q = q.eq("order_number", Number(order_id));
    if (internal_sku)
      q = q.eq("internal_sku", String(internal_sku).toUpperCase());
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
// POST /tracking/alloc  { order_id, delivery_id?, internal_sku, qty }
app.post("/tracking/alloc", async (req, res) => {
  try {
    const { order_id, delivery_id, internal_sku, qty } = req.body || {};
    if (!order_id || !internal_sku || !qty) {
      return res
        .status(400)
        .json({ error: "order_id, internal_sku, qty required" });
    }
    const n = Math.max(0, Number(qty) | 0);
    if (!n) return res.json({ inserted: 0 });

    const rows = Array.from({ length: n }, () => ({
      order_number: Number(order_id),
      internal_sku: String(internal_sku).toUpperCase(),
      status: null,
      ordered_at: new Date().toISOString(),
      UUID: crypto.randomUUID(),
      // optional: stash delivery id somewhere if you want
      // location: delivery_id ? `DEL-${delivery_id}` : null,
    }));

    const { data, error } = await sb
      .from("all_items_tracking")
      .insert(rows)
      .select();
    if (error) throw error;
    var inserted = data && data.length ? data.length : 0;
    res.json({ inserted: inserted, rows: data });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
// POST /tracking/by-sku/:action(received|missing)
// body: { order_id, internal_sku }
app.post("/tracking/by-sku/:action(received|missing)", async (req, res) => {
  try {
    const action = req.params.action;
    const { order_id, internal_sku } = req.body || {};
    if (!order_id || !internal_sku) {
      return res
        .status(400)
        .json({ error: "order_id and internal_sku required" });
    }
    const sku = String(internal_sku).toUpperCase();

    const { data: one, error: e1 } = await sb
      .from("all_items_tracking")
      .select("*")
      .eq("order_number", Number(order_id))
      .eq("internal_sku", sku)
      .is("status", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (e1) throw e1;
    if (!one) return res.status(404).json({ error: "No open row to update" });

    const payload =
      action === "received"
        ? { status: "Received", received_at: new Date().toISOString() }
        : { status: "Missing", missing_flagged_at: new Date().toISOString() };

    const { data, error: e2 } = await sb
      .from("all_items_tracking")
      .update(payload)
      .eq("id", one.id)
      .select()
      .single();
    if (e2) throw e2;

    res.json({ updated: 1, row: data });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
// GET /order-history/enriched?order_id=271 (&delivery_id=12 optional)
app.get("/order-history/enriched", async (req, res) => {
  try {
    const { order_id, user_id, sku_number, delivery_id } = req.query;

    // 1) pull the raw rows
    let q = sb
      .from("home_depot_order_history")
      .select("*")
      .order("created_at", { ascending: false });
    if (order_id) q = q.eq("order_id", order_id);
    if (user_id) q = q.eq("user_id", user_id);
    if (sku_number) q = q.eq("sku_number", sku_number);
    if (delivery_id) {
      const d = parseInt(delivery_id, 10);
      if (!isNaN(d)) q = q.contains("delivery_id", [d]);
    }
    const { data: rows, error } = await q;
    if (error) throw error;

    if (!rows || !rows.length) return res.json([]);

    // 2) best-effort item resolution for each row
    const out = [];
    for (const r of rows) {
      let item = null;

      // Try match by internal/temp if present on the row already
      if (r.internal_sku || r.temp_internal_sku) {
        const key = r.internal_sku || r.temp_internal_sku;
        const { data } = await sb
          .from("home_depot_items")
          .select("item_desc,item_image,internal_sku,temp_internal_sku,dth_sku")
          .or(`internal_sku.eq.${key},temp_internal_sku.eq.${key}`)
          .maybeSingle();
        item = data || null;
      }

      // Try by sku_number (numeric), material_id, or internet_sku_number
      if (!item) {
        const cand = [];
        if (r.sku_number) cand.push(`sku_number.eq.${r.sku_number}`);
        if (r.material_id) cand.push(`material_id.eq.${r.material_id}`);
        if (r.internet_sku_number)
          cand.push(`internet_sku_number.eq.${r.internet_sku_number}`);
        if (cand.length) {
          const { data } = await sb
            .from("home_depot_items")
            .select(
              "item_desc,item_image,internal_sku,temp_internal_sku,dth_sku"
            )
            .or(cand.join(","))
            .maybeSingle();
          item = data || null;
        }
      }

      out.push({
        item_desc:
          item && item.item_desc != null
            ? item.item_desc
            : r.item_desc != null
            ? r.item_desc
            : null,

        item_image:
          item && item.item_image != null
            ? item.item_image
            : r.item_image != null
            ? r.item_image
            : null,

        internal_sku:
          item && item.internal_sku != null
            ? item.internal_sku
            : r.internal_sku != null
            ? r.internal_sku
            : null,

        temp_internal_sku:
          item && item.temp_internal_sku != null
            ? item.temp_internal_sku
            : r.temp_internal_sku != null
            ? r.temp_internal_sku
            : null,

        dth_sku:
          item && item.dth_sku != null
            ? item.dth_sku
            : r.dth_sku != null
            ? r.dth_sku
            : null,

        // keep all original row fields too
        id: r.id,
        order_id: r.order_id,
        order_item_number: r.order_item_number,
        delivery_id: r.delivery_id,
        delivery_qty: r.delivery_qty,
        created_at: r.created_at,
        updated_at: r.updated_at,
        sku_number: r.sku_number,
        material_id: r.material_id,
        internet_sku_number: r.internet_sku_number,
        user_id: r.user_id,
      });
    }

    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ── ORDER HISTORY (deliveries) – preserved API shape ───────── */
app.post("/order-history", async (req, res) => {
  if (req.body && req.body.delivery_id && !Array.isArray(req.body.delivery_id))
    req.body.delivery_id = arrify(req.body.delivery_id);
  try {
    const { data, error } = await sb
      .from("home_depot_order_history")
      .insert(req.body)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/order-history", async (req, res) => {
  try {
    const qp = req.query || {};
    const order_id = qp.order_id;
    const user_id = qp.user_id;
    const sku_number = qp.sku_number;
    const delivery_id = qp.delivery_id;

    let q = sb
      .from("home_depot_order_history")
      .select("*")
      .order("created_at", { ascending: false });
    if (order_id) q = q.eq("order_id", order_id);
    if (user_id) q = q.eq("user_id", user_id);
    if (sku_number) q = q.eq("sku_number", sku_number);
    if (delivery_id) {
      const d = parseInt(delivery_id, 10);
      if (!isNaN(d)) q = q.contains("delivery_id", [d]);
    }
    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/order-history/:itemId", async (req, res) => {
  try {
    const { data, error } = await sb
      .from("home_depot_order_history")
      .select("*")
      .eq("order_item_number", req.params.itemId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Not found" });
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put("/order-history/:itemId", async (req, res) => {
  if (req.body && req.body.delivery_id && !Array.isArray(req.body.delivery_id))
    req.body.delivery_id = arrify(req.body.delivery_id);
  try {
    const { data, error } = await sb
      .from("home_depot_order_history")
      .update(req.body)
      .eq("order_item_number", req.params.itemId)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/order-history/:itemId", async (req, res) => {
  try {
    const { error } = await sb
      .from("home_depot_order_history")
      .delete()
      .eq("order_item_number", req.params.itemId);
    if (error) throw error;
    res.json({ message: "Row deleted" });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ── ORDER headers (for deliveries page) ───────────────────── */
app.get("/orders/:orderId", async (req, res) => {
  const orderId = req.params.orderId;
  try {
    const { data, error } = await sb
      .from("home_depot_orders")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Order not found" });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── ORDERS CRUD + approvals (simple) ──────────────────────── */
app.get("/orders", auth, async (req, res) => {
  const qparams = req.query || {};
  const status = qparams.status;
  const limit = qparams.limit || 200;
  try {
    let q = sb
      .from("home_depot_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(+limit);
    if (status) q = q.eq("order_status", status);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/orders", auth, async (req, res) => {
  try {
    const payload = {
      ...(req.body || {}),
      created_at: new Date().toISOString(),
      created_by: req.user && req.user.id ? req.user.id : null,
    };
    const { data, error } = await sb
      .from("home_depot_orders")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put("/orders/:orderId", auth, async (req, res) => {
  try {
    const { data, error } = await sb
      .from("home_depot_orders")
      .update(req.body)
      .eq("order_id", req.params.orderId)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/orders/:orderId/approve", auth, async (req, res) => {
  // only managers or Jacob
  if (!(req.user && (req.user.user_manager || req.user.is_user_jacob))) {
    return res.status(403).json({ error: "Not authorized" });
  }
  try {
    const { data, error } = await sb
      .from("home_depot_orders")
      .update({
        order_status: "Approved",
        approved_by: req.user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("order_id", req.params.orderId)
      .select()
      .single();
    if (error) throw error;
    // notify
    await sb.from("inventory_notifications").insert({
      notification_type: "order_approved",
      user_lists: "managers",
      is_cleared_for: null,
      notification_message:
        "Order " + req.params.orderId + " approved by " + req.user.username,
    });
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ── Notifications ─────────────────────────────────────────── */
app.get("/notifications", auth, async (req, res) => {
  try {
    const { data, error } = await sb
      .from("inventory_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post("/notifications", auth, async (req, res) => {
  try {
    const payload = {
      created_at: new Date().toISOString(),
      ...(req.body || {}),
    };
    const { data, error } = await sb
      .from("inventory_notifications")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post("/notifications/:id/clear", auth, async (req, res) => {
  try {
    const { data, error } = await sb
      .from("inventory_notifications")
      .update({ is_cleared_for: String(req.user.id) })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ── Locations (simple tree) ───────────────────────────────── */
// assumes a table inventory_locations(id bigint, name text, parent_id bigint null, barcode text, created_at timestamptz)
app.get("/locations", auth, async (_req, res) => {
  try {
    const { data, error } = await sb
      .from("inventory_locations")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post("/locations", auth, async (req, res) => {
  try {
    const b = req.body || {};
    const name = b.name || "Location";
    const parent_id = typeof b.parent_id !== "undefined" ? b.parent_id : null;
    const barcode = "DL-" + randAlphaNum(6);
    const { data, error } = await sb
      .from("inventory_locations")
      .insert({
        name,
        parent_id,
        barcode,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post("/locations/assign", auth, async (req, res) => {
  const body = req.body || {};
  const sku = body.sku;
  const location_id = body.location_id;
  if (!sku || !location_id)
    return res.status(400).json({ error: "sku and location_id required" });
  try {
    const { data, error } = await sb
      .from("home_depot_items")
      .update({ inventory_location_id: location_id })
      .or(`internal_sku.eq.${sku},temp_internal_sku.eq.${sku}`)
      .select()
      .single();
    if (error) throw error;
    res.json({ ok: true, item: data });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ── Inventory analytics & pulls ───────────────────────────── */
app.get("/inventory/summary", auth, async (_req, res) => {
  try {
    const { data, error } = await sb
      .from("home_depot_items")
      .select(
        "material_id,item_desc,inventory,reorder_point,pack_size,inventory_location_id"
      );
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.get("/inventory/usage", auth, async (req, res) => {
  const qp = req.query || {};
  const project_id = qp.project_id;
  const days = qp.days || 90;
  try {
    let q = sb
      .from("home_depot_inventory_logs")
      .select("log_date,material_id,project_id,project_name,quantity_change");
    const since = new Date(
      Date.now() - (Number(days) || 90) * 24 * 3600 * 1000
    ).toISOString();
    q = q.gte("log_date", since);
    if (project_id) q = q.eq("project_id", project_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post("/inventory/pull", auth, async (req, res) => {
  const body = req.body || {};
  const material_id = body.material_id;
  const quantity = body.quantity;
  const project_id = body.project_id;
  const project_name = body.project_name;

  if (!material_id || !quantity)
    return res.status(400).json({ error: "material_id and quantity required" });
  try {
    // decrement inventory (note: includes reorder_point so notifications can trigger correctly)
    const { data: item, error: e1 } = await sb
      .from("home_depot_items")
      .select("inventory,reorder_point")
      .eq("material_id", material_id)
      .maybeSingle();
    if (e1) throw e1;

    const prev =
      item && typeof item.inventory === "number" ? item.inventory : 0;
    const cur = prev - Number(quantity);

    await sb
      .from("home_depot_items")
      .update({ inventory: cur })
      .eq("material_id", material_id);

    await sb.from("home_depot_inventory_logs").insert({
      name: "Pull",
      log_date: new Date().toISOString(),
      material_id,
      previous_quantity: prev,
      current_quantity: cur,
      quantity_change: -Math.abs(Number(quantity)),
      project_id: project_id || null,
      project_name: project_name || null,
      log_description: "Material requested/used",
    });

    const reorderPoint =
      item && typeof item.reorder_point === "number" ? item.reorder_point : 0;
    if (cur <= 0 || cur <= reorderPoint) {
      await sb.from("inventory_notifications").insert({
        notification_type: "reorder",
        user_lists: "managers",
        notification_message:
          "Material " + material_id + " below reorder point",
      });
    }
    res.json({ ok: true, current_quantity: cur });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ── Health ─────────────────────────────────────────────────── */
app.get("/", (_req, res) => res.send("Inventory API up (HTTPS)"));

/* ── HTTPS startup ──────────────────────────────────────────── */
const httpsOptions = {
  key: fs.readFileSync(
    "/etc/letsencrypt/live/inventory.orcagroup.io/privkey.pem"
  ),
  cert: fs.readFileSync(
    "/etc/letsencrypt/live/inventory.orcagroup.io/fullchain.pem"
  ),
};
https.createServer(httpsOptions, app).listen(PORT, () => {
  console.log(`🚀 HTTPS API listening on port ${PORT}`);
});
