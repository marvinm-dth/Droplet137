
require("dotenv").config();
const fs      = require("fs");
const path    = require("path");
const https   = require("https");
const express = require("express");
const fsp     = fs.promises;  

const PORT = process.env.PORT || 5023;

// Serve /web
const app = express();
const WEB_DIR = path.join(__dirname, "web");
app.use(express.static(WEB_DIR, { maxAge: "1h", etag: true }));

const IMAGE_DIR = path.resolve(process.env.IMAGE_DIR || "/var/sql/dth_materials/downloaded_images");

// Health
app.get("/healthz", (_req, res) => res.json({ ok: true }));



// === Basic sanity checks on startup ===
(async () => {
  try {
    const st = await fsp.stat(IMAGE_DIR);
    if (!st.isDirectory()) {
      console.error(`[BOOT] IMAGE_DIR is not a directory: ${IMAGE_DIR}`);
      process.exit(1);
    }
    console.log(`[BOOT] Serving images from: ${IMAGE_DIR}`);
  } catch (e) {
    console.error(`[BOOT] IMAGE_DIR not accessible: ${IMAGE_DIR}`, e.message);
    process.exit(1);
  }
})();

// Simple request logger for /image
app.use("/image", (req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl}`);
  next();
});
// If you terminate TLS in Node (like Flask ssl_context), set these env vars:
const SSL_CERT = process.env.SSL_CERT || "/etc/letsencrypt/live/inventory.orcagroup.io/fullchain.pem";
const SSL_KEY  = process.env.SSL_KEY  || "/etc/letsencrypt/live/inventory.orcagroup.io/privkey.pem";

// === Route matching Flask: /image/<filename> ===
app.get("/image/:filename", async (req, res) => {
  try {
    const { filename } = req.params;

    // Prevent path traversal; your filenames look like "100124691.jpg"
    if (!/^[\w.\-]+$/.test(filename)) {
      console.warn(`[WARN] Invalid filename: ${filename}`);
      return res.status(400).send("Invalid filename");
    }

    const abs = path.resolve(IMAGE_DIR, filename);

    // Make sure resolved path stays within IMAGE_DIR
    const rootWithSep = IMAGE_DIR.endsWith(path.sep) ? IMAGE_DIR : IMAGE_DIR + path.sep;
    if (!abs.startsWith(rootWithSep)) {
      console.warn(`[WARN] Attempted path escape: ${abs}`);
      return res.status(400).send("Invalid path");
    }

    // Check existence before sendFile so we can log a clean 404
    await fsp.access(abs, fs.constants.R_OK);

    res.sendFile(abs, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        // "X-Content-Type-Options": "nosniff", // optional hardening
      },
    }, (err) => {
      if (err) {
        if (err.code === "ENOENT") return res.status(404).end();
        console.error("[ERR] sendFile failed:", err);
        return res.status(500).send("Server error");
      }
    });
  } catch (err) {
    
    console.error("[ERR] Route error:", err);
    return res.status(500).send("Server error");
  }
});

// Fallback to index.html for SPA routes
app.get("*", (_req, res) => {
  res.sendFile(path.join(WEB_DIR, "index.html"));
});


const httpsOptions = {
  key : fs.readFileSync("/etc/letsencrypt/live/inventory.orcagroup.io/privkey.pem"),
  cert: fs.readFileSync("/etc/letsencrypt/live/inventory.orcagroup.io/fullchain.pem"),
};

https.createServer(httpsOptions, app).listen(PORT, () => {
  console.log(`🌐 Web UI listening on https://0.0.0.0:${PORT}`);
});
