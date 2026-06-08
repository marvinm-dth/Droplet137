/* server.js  –  single-image wrapper around rembg
 * ------------------------------------------------
 * 1) POST /api/remove  (multipart form-data, field name “file”)
 * 2) Spawns /usr/local/bin/rembg once per request:
 *         rembg i - -      (stdin → stdout)
 * 3) Streams the cut-out PNG back, then the child exits
 */

const express = require("express");
const multer  = require("multer");
const cors    = require("cors");
const { spawn } = require("child_process");

/* ── configuration ──────────────────────────────── */
const PORT      = process.env.PORT || 7000;
const HOST      = "0.0.0.0";
const REMBG_BIN = "/usr/local/bin/rembg";      // ← hard-coded path

/* ── Express app ────────────────────────────────── */
const upload = multer({ storage: multer.memoryStorage() });
const app    = express();

app.use(cors({ origin: "*" }));                // allow any front-end

/* ── POST /api/remove ──────────────────────────── */
app.post("/api/remove", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).send("No file uploaded");

  // spawn rembg:  rembg i - -   (stdin, stdout)
  const rembg = spawn(REMBG_BIN, ["i", "-", "-"]);

  rembg.stdin.end(req.file.buffer);            // feed image

  const chunks = [];
  rembg.stdout.on("data",  c => chunks.push(c));
  rembg.stderr.on("data",  e => console.error("[rembg]", e.toString()));

  rembg.on("close", code => {
    if (code !== 0) {
      return res.status(500).send("rembg exited with code " + code);
    }
    res.type("png").send(Buffer.concat(chunks));
  });
});

/* ── health-check ──────────────────────────────── */
app.get("/", (_req, res) => res.send("rembg Node wrapper running"));

/* ── start server ──────────────────────────────── */
app.listen(PORT, HOST, () =>
  console.log(`🚀 listening on http://${HOST}:${PORT}`)
);
