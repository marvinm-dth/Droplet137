// server.js — NO AUTH, CORS *, ACCUMULATES PAGES, UI-MAPPED /api/data
// ===================================================================

const PORT     = 5077;
const HOST     = "0.0.0.0";
const SSL_CERT = "/etc/letsencrypt/live/inventory.orcagroup.io/fullchain.pem";
const SSL_KEY  = "/etc/letsencrypt/live/inventory.orcagroup.io/privkey.pem";

const fs      = require("fs");
const path    = require("path");
const https   = require("https");
const express = require("express");

const WEB_DIR   = path.join(__dirname, "web");
const IMAGE_DIR = path.resolve("/var/sql/dth_materials/downloaded_images");

const app = express();

// ===== Boot banner =====
console.log("==================================================");
console.log(" Dragon Tiny Homes • Inventory Server (ACCUMULATING) ");
console.log("==================================================");
console.log("[BOOT] HOST=" + HOST + " PORT=" + PORT);
console.log("[BOOT] WEB_DIR = " + WEB_DIR);
console.log("[BOOT] IMAGE_DIR = " + IMAGE_DIR);
console.log("[BOOT] TLS cert  = " + SSL_CERT + " " + (fs.existsSync(SSL_CERT) ? "(OK)" : "(MISSING)"));
console.log("[BOOT] TLS key   = " + SSL_KEY + " " + (fs.existsSync(SSL_KEY) ? "(OK)" : "(MISSING)"));
console.log("[BOOT] /api/notion AUTH = NONE (NO TOKEN)");
console.log("[BOOT] Accumulates multiple POSTs into one dataset");
console.log("==================================================");

// ===== State =====
let pageStore = new Map();     // pageId -> page object
let lastDbMeta = null;         // if a Notion database object arrives

// ===== Middleware =====
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => {
    const ms  = Date.now() - t0;
    const len = res.getHeader("content-length") || "-";
    console.log("[REQ] " + req.ip + " " + req.method + " " + req.originalUrl + " -> " + res.statusCode + " (" + ms + "ms, " + len + "B)");
  });
  next();
});

app.use(express.static(WEB_DIR, { maxAge: "1h", etag: true }));
app.use(express.json({ limit: "50mb" })); // allow big bundles

// --- CORS (open) ---
function corsTight(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
}

// --- health ---
app.get("/healthz", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// --- verify image dir at boot ---
(function () {
  try {
    const st = fs.statSync(IMAGE_DIR);
    if (!st.isDirectory()) {
      console.error("[BOOT] IMAGE_DIR is not a directory: " + IMAGE_DIR);
      process.exit(1);
    }
    console.log("[BOOT] Serving images from: " + IMAGE_DIR);
  } catch (e) {
    console.error("[BOOT] IMAGE_DIR not accessible: " + IMAGE_DIR + " :: " + e.message);
    process.exit(1);
  }
})();

// --- /image/:filename (with traversal protection) ---
app.use("/image", (req, _res, next) => { console.log("[IMAGE] " + req.method + " " + req.originalUrl); next(); });
app.get("/image/:filename", (req, res) => {
  try {
    const filename = req.params.filename;
    if (!/^[\w.\-]+$/.test(filename)) return res.status(400).send("Invalid filename");

    const abs = path.resolve(IMAGE_DIR, filename);
    const rootWithSep = IMAGE_DIR.endsWith(path.sep) ? IMAGE_DIR : IMAGE_DIR + path.sep;
    if (abs.indexOf(rootWithSep) !== 0) return res.status(400).send("Invalid path");

    fs.promises.access(abs, fs.constants.R_OK).then(() => {
      res.sendFile(abs, { headers: { "Cache-Control": "public, max-age=31536000, immutable" } }, (err) => {
        if (err) {
          if (err.code === "ENOENT") return res.status(404).end();
          console.error("[ERR] sendFile failed:", err);
          return res.status(500).send("Server error");
        }
      });
    }).catch(() => res.status(404).end());
  } catch (err) {
    console.error("[ERR] Route error:", err);
    return res.status(500).send("Server error");
  }
});

// --- optional inspections page ---
app.get("/inspections", (_req, res) => res.sendFile(path.join(WEB_DIR, "inspections.html")));

// ===================================================
// Helpers: parsing Notion payloads
// ===================================================
function getFirstPlainText(arr) {
  if (!arr || !arr.length) return "";
  const x = arr[0];
  if (!x) return "";
  return (x.plain_text || (x.text && x.text.content) || "").trim();
}

// getters that work with properties_value OR standard properties
function getTitle(p, name) {
  if (p && p.properties_value && Array.isArray(p.properties_value[name])) {
    return getFirstPlainText(p.properties_value[name]);
  }
  if (p && p.properties && Array.isArray(p.properties)) {
    for (const it of p.properties) {
      if (it && it.label === name && it.title && it.title.length) return getFirstPlainText(it.title);
    }
  }
  if (p && p.properties && p.properties[name] && p.properties[name].title && p.properties[name].title.length) {
    return getFirstPlainText(p.properties[name].title);
  }
  return "";
}
function getSelectName(p, name) {
  if (p && p.properties_value && p.properties_value[name] && p.properties_value[name].name) return p.properties_value[name].name;
  if (p && p.properties && Array.isArray(p.properties)) {
    for (const it of p.properties) if (it && it.label === name && it.select && it.select.name) return it.select.name;
  }
  if (p && p.properties && p.properties[name] && p.properties[name].select && p.properties[name].select.name) return p.properties[name].select.name;
  return null;
}
function getStatusName(p, name) {
  if (p && p.properties_value && p.properties_value[name] && p.properties_value[name].name) return p.properties_value[name].name;
  if (p && p.properties && Array.isArray(p.properties)) {
    for (const it of p.properties) if (it && it.label === name && it.status && it.status.name) return it.status.name;
  }
  if (p && p.properties && p.properties[name] && p.properties[name].status && p.properties[name].status.name) return p.properties[name].status.name;
  return null;
}
function getDateStart(p, name) {
  if (p && p.properties_value && p.properties_value[name] && p.properties_value[name].start) return p.properties_value[name].start;
  if (p && p.properties && Array.isArray(p.properties)) {
    for (const it of p.properties) if (it && it.label === name && it.date && it.date.start) return it.date.start;
  }
  if (p && p.properties && p.properties[name] && p.properties[name].date && p.properties[name].date.start) return p.properties[name].date.start;
  return null;
}
function getUrlProp(p, name) {
  if (p && p.properties_value && p.properties_value[name]) {
    const v = p.properties_value[name];
    if (typeof v === "string") return v;
    if (v && v.url) return v.url;
  }
  if (p && p.properties && Array.isArray(p.properties)) {
    for (const it of p.properties) if (it && it.label === name && typeof it.url === "string") return it.url;
  }
  if (p && p.properties && p.properties[name] && typeof p.properties[name].url === "string") return p.properties[name].url;
  return null;
}

// Normalize any payload to an array of pages OR special DB marker
function normalizeNotionArray(payload) {
  if (!payload) return [];
  // [{json:"..."}]
  if (Array.isArray(payload) && payload.length && typeof payload[0].json === "string") {
    console.log("[XNORM] Detected array of {json:string} from Make");
    const out = [];
    for (const el of payload) {
      try { out.push(JSON.parse(el.json)); } catch (e) { console.warn("[XNORM] JSON.parse failed:", e.message); }
    }
    return out;
  }
  if (Array.isArray(payload)) return payload; // array of pages
  if (payload.object === "list" && Array.isArray(payload.results)) return payload.results;
  if (payload.object === "page") return [payload];
  if (payload.data && Array.isArray(payload.data)) return payload.data;
  if (payload.object === "database") return { __NOTION_DB__: true, __db: payload };
  return [];
}

// extract pages from any payload (for merging)
function extractPages(payload) {
  const norm = normalizeNotionArray(payload);
  if (Array.isArray(norm)) return norm.filter(p => p && p.object === "page");
  return [];
}

function typeKeyFromName(n) {
  if (!n) return null;
  const s = String(n).toLowerCase();
  if (s.includes("foundation")) return "foundation";
  if (s.includes("framing"))    return "framing";
  if (s.includes("dry") && s.includes("in")) return "dry_in";
  if (s.includes("electrical")) return "electrical";
  if (s.includes("plumbing"))   return "plumbing";
  if (s.includes("insulation")) return "insulation";
  if (s.includes("final"))      return "final";
  return null;
}

function databaseToSyntheticProject(db) {
  let title = "";
  if (db && Array.isArray(db.title) && db.title[0] && db.title[0].plain_text) title = db.title[0].plain_text;

  const inspections = {
    foundation: { status: "pending" },
    framing:    { status: "pending" },
    dry_in:     { status: "pending" },
    electrical: { status: "pending" },
    plumbing:   { status: "pending" },
    insulation: { status: "pending" },
    final:      { status: "pending" }
  };
  try {
    let opts = null;
    if (Array.isArray(db.properties)) {
      for (const p of db.properties) if (p && p.name === "Inspection Type" && p.select && Array.isArray(p.select.options)) { opts = p.select.options; break; }
    }
    if (!opts && db.properties_value && db.properties_value["Inspection Type"] && Array.isArray(db.properties_value["Inspection Type"].options)) {
      opts = db.properties_value["Inspection Type"].options;
    }
    if (opts) {
      for (const o of opts) {
        const n = (o && o.name ? String(o.name) : "").toLowerCase();
        if (n.includes("foundation")) inspections.foundation = { status: "pending" };
        if (n.includes("framing"))    inspections.framing    = { status: "pending" };
        if (n.includes("dry") && n.includes("in")) inspections.dry_in = { status: "pending" };
        if (n.includes("electrical")) inspections.electrical = { status: "pending" };
        if (n.includes("plumbing"))   inspections.plumbing   = { status: "pending" };
        if (n.includes("insulation")) inspections.insulation = { status: "pending" };
        if (n.includes("final"))      inspections.final      = { status: "pending" };
      }
    }
  } catch (_) {}
  const id = db && db.id ? db.id : "notion-database";
  const name = title ? ("Inspection " + title) : "Inspection Database";
  return { updated_at: new Date().toISOString(), projects: [ { id, name, inspections } ] };
}

// Map pages -> UI schema expected by inspections.html
function mapToProjectsSchema(notionPages) {
  const groups = {}; // projectId -> project

  for (const p of notionPages) {
    const dth   = getTitle(p, "DTH #") || "";
    const title = dth || (function extractTitleFromProperties(pp){
      const props = pp && pp.properties ? pp.properties : [];
      for (const it of props) if (it && it.id === "title" && it.title && it.title.length) return it.title[0].plain_text || "";
      return "";
    })(p) || p.id;

    const projectId = dth || title || p.id;

    if (!groups[projectId]) {
      groups[projectId] = {
        id: projectId,
        name: "Inspection " + (title || projectId),
        inspections: {
          foundation: { status: "pending" },
          framing:    { status: "pending" },
          dry_in:     { status: "pending" },
          electrical: { status: "pending" },
          plumbing:   { status: "pending" },
          insulation: { status: "pending" },
          final:      { status: "pending" }
        }
      };
    }

    const g = groups[projectId];

    const typeName = getSelectName(p, "Inspection Type"); // "Framing", "Dry-In", ...
    const key      = typeKeyFromName(typeName);
    if (key) {
      const sched = getDateStart(p, "Date Scheduled");     // "YYYY-MM-DD" or ISO
      const link  = getUrlProp(p, "Link to Inspection Sheet");
      const st    = getStatusName(p, "Status");            // "Scheduled", "Passed", "Failed"

      const override = {};
      // status normalization
      if (st) {
        const s = st.toLowerCase();
        override.status = (s === "passed") ? "passed" : (s === "failed" ? "failed" : "pending");
      } else {
        override.status = "pending";
      }

      // IMPORTANT: keep a date-only string to avoid timezone flips in the UI
      if (sched) {
        const ymd = String(sched).slice(0,10);          // "YYYY-MM-DD" regardless of ISO or date-only
        override.date = { scheduled: ymd, iso: ymd + "T12:00:00Z" }; // midday UTC avoids shifting
      }
      if (link) override.link = link;

      g.inspections[key] = override;
    }
  }

  const projects = Object.values(groups);
  console.log("[MAP] Built UI projects: " + projects.length);
  return { updated_at: new Date().toISOString(), projects };
}

// ===================================================
// RECEIVE FROM MAKE — MERGE, DON'T OVERWRITE
// ===================================================
app.post("/api/notion", corsTight, (req, res) => {
  try {
    const body = req.body;
    let jsonStr = "";
    try { jsonStr = JSON.stringify(body, null, 2); } catch (e) { jsonStr = "[[UNSTRINGIFIABLE BODY: " + (e && e.message || "unknown") + "]]"; }

    const size = Buffer.byteLength(jsonStr);
    console.log("--------------------------------------------------");
    console.log("[NOTION_PUSH] Received payload (NO-AUTH) from " + (req.ip || "unknown"));
    console.log("[NOTION_PUSH] Content-Type: " + (req.headers["content-type"] || "unknown"));
    console.log("[NOTION_PUSH] Size: " + size + " bytes");
    console.log("[NOTION_PUSH] FULL JSON PAYLOAD BELOW ⬇⬇⬇");
    console.log(jsonStr);
    console.log("--------------------------------------------------");

    if (req.query && req.query.reset === "1") {
      pageStore.clear();
      lastDbMeta = null;
      console.log("[NOTION_PUSH] RESET pageStore");
    }

    if (body && body.object === "database") {
      lastDbMeta = body;
      console.log("[NOTION_PUSH] Stored Notion DATABASE metadata");
    }

    const pages = extractPages(body);
    if (pages.length) {
      for (const p of pages) {
        const id = p.id;
        if (id) {
          pageStore.set(id, p);
          console.log("[NOTION_PUSH] Upsert page:", id);
        }
      }
    } else if (!body || (body.object !== "database")) {
      console.log("[NOTION_PUSH] No page objects found; nothing merged");
    }

    // Persist snapshot for debugging
    try {
      const snapshot = { object: "list", results: Array.from(pageStore.values()) };
      fs.writeFileSync("/tmp/notion_inspections_latest.json", JSON.stringify(snapshot, null, 2));
      console.log("[NOTION_PUSH] Saved snapshot to /tmp/notion_inspections_latest.json (pages:", pageStore.size, ")");
    } catch (e) {
      console.warn("[NOTION_PUSH] Persist failed:", e.message);
    }

    res.sendStatus(204);
  } catch (err) {
    console.error("[NOTION_PUSH][ERR]", err && err.stack ? err.stack : err);
    res.status(500).json({ error: "Server error" });
  }
});

// ===== RAW (everything accumulated) =====
app.get("/api/raw", corsTight, (_req, res) => {
  res.json({ object: "list", results: Array.from(pageStore.values()) });
});

// ===== UI-MAPPED for the HTML =====
app.get("/api/data", corsTight, (_req, res) => {
  const allPages = Array.from(pageStore.values());
  if (allPages.length) {
    const ui = mapToProjectsSchema(allPages);
    return res.json(ui);
  }
  if (lastDbMeta) {
    console.log("[DATA] Only DB meta present; sending synthetic placeholder");
    return res.json(databaseToSyntheticProject(lastDbMeta));
  }
  return res.status(503).json({ error: "No data yet" });
});

// --- SPA fallback (optional) ---
app.get("*", (_req, res) => res.sendFile(path.join(WEB_DIR, "index.html")));

// --- HTTPS ---
const httpsOptions = (function () {
  try {
    const key  = fs.readFileSync(SSL_KEY);
    const cert = fs.readFileSync(SSL_CERT);
    console.log("[TLS] Loaded key+cert");
    return { key, cert };
  } catch (e) {
    console.error("[TLS] Failed to read cert/key:", e.message);
    process.exit(1);
  }
})();

https.createServer(httpsOptions, app).listen(PORT, HOST, () => {
  console.log("🌐 Listening on https://" + HOST + ":" + PORT);
  console.log("   Endpoints:");
  console.log("   - GET  /healthz");
  console.log("   - GET  /inspections");
  console.log("   - GET  /image/:filename");
  console.log("   - POST /api/notion      (NO AUTH, merges pages; ?reset=1 to clear)");
  console.log("   - GET  /api/raw         (accumulated raw pages)");
  console.log("   - GET  /api/data        (UI-mapped schema from ALL pages)");
  console.log("==================================================");
});
