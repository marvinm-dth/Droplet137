// import "dotenv/config";
// import express from "express";
// import multer from "multer";
// import { parse } from "csv-parse/sync";
// import { createClient } from "@supabase/supabase-js";
// import path from "path";
// import { fileURLToPath } from "url";

// const PORT = 5093; // HARDCODED per request

// const app = express();
// app.use(express.json());
// app.use(express.static("public"));

// const upload = multer({ storage: multer.memoryStorage() });
// const SUPABASE_URL      = "http://137.184.148.164:8000";
// const supabase = createClient(
//   SUPABASE_URL,
//   process.env.SUPABASE_ANON_KEY
// );

// const BUCKET = process.env.SUPABASE_BUCKET || "item-images";

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// function clean(s) {
//   return (s ?? "").toString().trim();
// }

// /**
//  * GET /api/items
//  * Returns full items list.
//  */
// app.get("/api/items", async (req, res) => {
//   const { data, error } = await supabase
//     .from("items")
//     .select("*")
//     .order("supplier", { ascending: true });

//   if (error) return res.status(500).json({ error: error.message });
//   res.json(data);
// });

// /**
//  * POST /api/upload-csv
//  * CSV headers expected:
//  *   Supplier, Item Name, Quantity Ordered
//  *
//  * This upserts rows by the UNIQUE constraint:
//  *   (supplier, item_name_english)
//  *
//  * NOTE: This does NOT overwrite images.
//  */
// app.post("/api/upload-csv", upload.single("file"), async (req, res) => {
//   try {
//     if (!req.file) return res.status(400).json({ error: "No file uploaded" });

//     const csvText = req.file.buffer.toString("utf-8");
//     const records = parse(csvText, {
//       columns: true,
//       skip_empty_lines: true,
//       trim: true,
//     });

//     // Build rows
//     const rows = records.map((r) => {
//       const supplier = clean(r["Supplier"]);
//       const itemName = clean(r["Item Name"]);
//       const qtyOrdered = Number(clean(r["Quantity Ordered"]) || 0) || 0;

//       return {
//         supplier,
//         item_name_english: itemName,
//         quantity_ordered: qtyOrdered,
//         // Do NOT include image_url so import won't overwrite images.
//       };
//     });

//     // Upsert by (supplier,item_name_english)
//     const { data, error } = await supabase
//       .from("items")
//       .upsert(rows, { onConflict: "supplier,item_name_english" })
//       .select("item_id");

//     if (error) return res.status(500).json({ error: error.message });

//     res.json({ inserted_or_updated: data?.length ?? 0 });
//   } catch (e) {
//     res.status(500).json({ error: e.message });
//   }
// });

// /**
//  * POST /api/items/:id/image
//  * Uploads an image to Supabase Storage and updates items.image_url
//  */
// app.post("/api/items/:id/image", upload.single("image"), async (req, res) => {
//   try {
//     const itemId = req.params.id;
//     if (!req.file) return res.status(400).json({ error: "No image uploaded" });

//     const ext = (req.file.originalname.split(".").pop() || "jpg").toLowerCase();
//     const filePath = `${itemId}/${Date.now()}.${ext}`;

//     const { error: upErr } = await supabase.storage
//       .from(BUCKET)
//       .upload(filePath, req.file.buffer, {
//         contentType: req.file.mimetype,
//         upsert: true,
//       });

//     if (upErr) return res.status(500).json({ error: upErr.message });

//     const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
//     const imageUrl = pub.publicUrl;

//     const { error: dbErr } = await supabase
//       .from("items")
//       .update({ image_url: imageUrl })
//       .eq("item_id", itemId);

//     if (dbErr) return res.status(500).json({ error: dbErr.message });

//     res.json({ image_url: imageUrl });
//   } catch (e) {
//     res.status(500).json({ error: e.message });
//   }
// });

// app.get("/", (req, res) =>
//   res.sendFile(path.join(__dirname, "public/index.html"))
// );

// app.listen(PORT, () => {
//   console.log(`Web admin running on http://localhost:${PORT}`);
// });


/**
 * Dragon Tiny Homes – Inventory CSV + Images Web Admin Server
 * - Hardcoded PORT: 5093
 * - Hardcoded SUPABASE_URL: http://137.184.148.164:8000
 * - Uses SUPABASE_ANON_KEY from .env
 *
 * Endpoints:
 *  GET  /api/items
 *  POST /api/upload-csv        (multipart form-data field: file)
 *  POST /api/items/:id/image   (multipart form-data field: image)
 *  GET  /api/health            (quick connectivity check)
 *
 * Serves UI from csvuploader.html
 */

import "dotenv/config";
import express from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 5093; // HARDCODED
const SUPABASE_URL = "http://137.184.148.164:8000"; // HARDCODED (no trailing slash)

const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.length < 20) {
  console.error("❌ Missing/invalid SUPABASE_ANON_KEY in .env");
}

const BUCKET = process.env.SUPABASE_BUCKET || "item-images";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const app = express();
app.use(express.json());

const UI_FILE = path.join(__dirname, "csvuploader.html");
app.use(express.static(__dirname));

const upload = multer({ storage: multer.memoryStorage() });

function clean(s) {
  return (s ?? "").toString().trim();
}

function toNullableNumber(value, fieldName) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (Number.isNaN(n)) {
    throw new Error(`Invalid number for ${fieldName}`);
  }
  return n;
}

function toNullableDate(value, fieldName) {
  if (value === undefined || value === null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date for ${fieldName}`);
  }
  return d.toISOString();
}

/**
 * Health: checks if Supabase is reachable from THIS Node server.
 */
app.get("/api/health", async (_req, res) => {
  try {
    const url = `${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/health`;
    const r = await fetch(url);
    res.json({ ok: true, status: r.status, url });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/**
 * Image proxy (avoids mixed-content + hotlinking issues)
 * Only allows URLs under SUPABASE_URL/storage/
 */
app.get("/api/image-proxy", async (req, res) => {
  try {
    const rawUrl = String(req.query.url || "");
    if (!rawUrl) return res.status(400).json({ error: "Missing url param." });

    const base = SUPABASE_URL.replace(/\/$/, "");
    if (!rawUrl.startsWith(`${base}/storage/`)) {
      return res.status(400).json({ error: "URL not allowed." });
    }

    const r = await fetch(rawUrl);
    if (!r.ok) {
      return res.status(502).json({ error: `Image fetch failed (${r.status}).` });
    }

    const contentType = r.headers.get("content-type") || "application/octet-stream";
    const buffer = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/**
 * List items
 */
app.get("/api/items", async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const { data, error } = await supabase
      .from("items")
      .select("*")
      .order("supplier", { ascending: true })
      .order("item_name_english", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: String(e), stack: e?.stack });
  }
});

/**
 * Create single item
 */
app.post("/api/items", async (req, res) => {
  try {
    const body = req.body || {};
    const supplier = clean(body.supplier);
    const itemName = clean(body.item_name_english);

    if (!supplier || !itemName) {
      return res.status(400).json({ error: "supplier and item_name_english are required." });
    }

    const row = {
      supplier,
      item_name_english: itemName,
      item_name_chinese: clean(body.item_name_chinese) || null,
      quantity_ordered: toNullableNumber(body.quantity_ordered, "quantity_ordered"),
      quantity_on_hand: toNullableNumber(body.quantity_on_hand, "quantity_on_hand"),
      category: clean(body.category) || null,
    };

    const updatedDate = toNullableDate(body.on_hand_quantity_updated_date, "on_hand_quantity_updated_date");
    if (updatedDate) {
      row.on_hand_quantity_updated_date = updatedDate;
    } else if (row.quantity_on_hand !== null) {
      row.on_hand_quantity_updated_date = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("items")
      .insert(row)
      .select("*");

    if (error) return res.status(400).json({ error: error.message });

    res.json(data?.[0] || {});
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

/**
 * Update item details
 */
app.patch("/api/items/:id", async (req, res) => {
  try {
    const itemId = req.params.id;
    const body = req.body || {};
    const updates = {};

    if (Object.prototype.hasOwnProperty.call(body, "supplier")) {
      const supplier = clean(body.supplier);
      if (!supplier) return res.status(400).json({ error: "supplier cannot be empty." });
      updates.supplier = supplier;
    }
    if (Object.prototype.hasOwnProperty.call(body, "item_name_english")) {
      const nameEn = clean(body.item_name_english);
      if (!nameEn) return res.status(400).json({ error: "item_name_english cannot be empty." });
      updates.item_name_english = nameEn;
    }
    if (Object.prototype.hasOwnProperty.call(body, "item_name_chinese")) {
      updates.item_name_chinese = clean(body.item_name_chinese) || null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "quantity_ordered")) {
      updates.quantity_ordered = toNullableNumber(body.quantity_ordered, "quantity_ordered");
    }
    if (Object.prototype.hasOwnProperty.call(body, "quantity_on_hand")) {
      updates.quantity_on_hand = toNullableNumber(body.quantity_on_hand, "quantity_on_hand");
    }
    if (Object.prototype.hasOwnProperty.call(body, "on_hand_quantity_updated_date")) {
      updates.on_hand_quantity_updated_date = toNullableDate(
        body.on_hand_quantity_updated_date,
        "on_hand_quantity_updated_date"
      );
    }
    if (Object.prototype.hasOwnProperty.call(body, "category")) {
      const category = clean(body.category);
      updates.category = category ? category : null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    if (
      Object.prototype.hasOwnProperty.call(updates, "quantity_on_hand") &&
      !Object.prototype.hasOwnProperty.call(updates, "on_hand_quantity_updated_date")
    ) {
      updates.on_hand_quantity_updated_date = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("items")
      .update(updates)
      .eq("item_id", itemId)
      .select("*");

    if (error) return res.status(400).json({ error: error.message });

    const updated = data?.[0];
    if (!updated) return res.status(404).json({ error: "Item not found." });

    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

/**
 * Upload CSV
 * CSV headers expected:
 *   Supplier, Item, Quantity Ordered
 *
 * IMPORTANT:
 * - Inserts every row (no deduping)
 * - Does NOT overwrite image_url (keeps images you already attached)
 */
app.post("/api/upload-csv", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded. Field name must be 'file'." });
    }

    const csvText = req.file.buffer.toString("utf-8");

    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    // Build rows
    const rows = records.map((r) => {
      const supplier = clean(r["Supplier"]);
      const itemName = clean(r["Item"] ?? r["Item Name"]);
      const qtyOrdered = Number(clean(r["Quantity Ordered"]) || 0) || 0;
      const category = clean(r["Category"] ?? r["category"]);

      return {
        supplier,
        item_name_english: itemName,
        quantity_ordered: qtyOrdered,
        category: category || null,
        // do NOT include image_url here
      };
    });

    if (rows.length === 0) {
      return res.status(400).json({ error: "CSV contained no usable rows." });
    }

    const { data, error } = await supabase
      .from("items")
      .insert(rows)
      .select("item_id");

    if (error) return res.status(400).json({ error: error.message });

    res.json({
      inserted: data?.length ?? 0,
      csv_rows: rows.length,
    });
  } catch (e) {
    res.status(500).json({ error: String(e), stack: e?.stack });
  }
});

/**
 * Upload image for an item_id
 * multipart field: image
 */
app.post("/api/items/:id/image", upload.single("image"), async (req, res) => {
  try {
    const itemId = req.params.id;

    if (!req.file) return res.status(400).json({ error: "No image uploaded. Field name must be 'image'." });

    const ext = (req.file.originalname.split(".").pop() || "jpg").toLowerCase();
    const filePath = `${itemId}/${Date.now()}.${ext}`;

    // Upload to Supabase Storage
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });

    if (upErr) return res.status(500).json({ error: upErr.message });

    // Public URL (if bucket is public)
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
    const imageUrl = pub.publicUrl;

    // Update DB
    const { error: dbErr } = await supabase
      .from("items")
      .update({ image_url: imageUrl })
      .eq("item_id", itemId);

    if (dbErr) return res.status(500).json({ error: dbErr.message });

    res.json({ image_url: imageUrl });
  } catch (e) {
    res.status(500).json({ error: String(e), stack: e?.stack });
  }
});

/**
 * List distinct categories from items
 */
app.get("/api/categories", async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const { data, error } = await supabase
      .from("items")
      .select("category");

    if (error) return res.status(500).json({ error: error.message });

    const set = new Set();
    (data || []).forEach((row) => {
      const cat = clean(row?.category);
      if (cat) set.add(cat);
    });

    const categories = Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );

    res.json(categories);
  } catch (e) {
    res.status(500).json({ error: String(e), stack: e?.stack });
  }
});

// Serve UI
app.get("/", (_req, res) => res.sendFile(UI_FILE));

app.listen(PORT, () => {
  console.log(`✅ Web admin running on http://localhost:${PORT}`);
  console.log(`✅ Using SUPABASE_URL = ${SUPABASE_URL}`);
});
