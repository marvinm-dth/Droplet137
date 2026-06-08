// server.js
require("dotenv").config();

const fs        = require("fs");
const path      = require("path");
const https     = require("https");
const express   = require("express");
const fsp       = fs.promises;
const cors      = require("cors");
const multer    = require("multer");
const cp        = require("child_process");
const compression = require("compression");

/* ------------------------------ CLI flags --------------------------------- */
const ARGV = new Set(process.argv.slice(2));
const FORCE_MODE = ARGV.has("-force") || ARGV.has("--force");

/* ------------------------- capability detection --------------------------- */

// Try to load sharp, but NEVER depend on it.
let HAVE_SHARP = true;
let sharp = null;
try { sharp = require("sharp"); } catch (e) { HAVE_SHARP = false; console.warn("[BOOT] sharp not available:", (e && e.message) || e); }

// Try to load exifr for EXIF parsing (JPEG/HEIC/WEBP)
let HAVE_EXIFR = true;
let exifr = null;
try { exifr = require("exifr"); } catch (e) { HAVE_EXIFR = false; console.warn("[BOOT] exifr not available:", (e && e.message) || e); }

// CLI availability
function hasCmd(cmd) {
  try { cp.execFileSync("which", [cmd], { stdio: "ignore" }); return true; }
  catch (_e) { return false; }
}

function getMagickBin() {
  if (hasCmd("magick")) return "magick";   // ImageMagick 7
  if (hasCmd("convert")) return "convert"; // ImageMagick 6
  return null;
}

const MAGICK_BIN   = getMagickBin();
const HAVE_MAGICK  = !!MAGICK_BIN;
const HAVE_GM      = hasCmd("gm");
const HAVE_FFMPEG  = hasCmd("ffmpeg");
const HAVE_FFPROBE = hasCmd("ffprobe");
const HAVE_IDENTIFY = hasCmd("identify"); // ImageMagick identify for EXIF as a fallback

// small promise wrapper for child processes
function execFileP(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = cp.spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    p.stdout.on("data", d => { stdout += d.toString(); });
    p.stderr.on("data", d => { stderr += d.toString(); });
    p.on("error", reject);
    p.on("close", code => {
      if (code === 0) return resolve(stdout);
      reject(new Error(cmd + " exit " + code + (stderr ? (": " + stderr) : "")));
    });
  });
}

/* --------------------------------- utils ---------------------------------- */

const isTemp = (n) => /\.temp$|\.tmp$/i.test(n);
const isPhotoFile = (n) => /\.(jpe?g|png|webp|heic)$/i.test(n);
const isVideoFile = (n) => /\.(mp4|mov|webm|mkv)$/i.test(n);

function robustMtimeMs(st) {
  if (Number.isFinite(st.mtimeMs) && st.mtimeMs > 0) return st.mtimeMs;
  if (st.mtime && st.mtime.getTime) return st.mtime.getTime();
  return Date.now();
}

// Parse a variety of date strings into ms
function parseDateToMs(s) {
  if (!s || typeof s !== "string") return null;
  // Common EXIF format "YYYY:MM:DD HH:MM:SS"
  const exifRe = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:([+-]\d{2}:?\d{2})|Z)?$/;
  const m = s.match(exifRe);
  if (m) {
    const [ , Y, M, D, h, i, sec ] = m;
    const iso = `${Y}-${M}-${D}T${h}:${i}:${sec}Z`; // treat as UTC if no tz
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : null;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/* ------------------------------ server setup ------------------------------ */

const PORT = process.env.PORT || 5078;

// Base URL this server is reachable at (ABSOLUTE URLs in responses)
const PUBLIC_BASE = process.env.PUBLIC_BASE || "https://inventory.orcagroup.io:5078";
function makeUrl(prefix, name) { return PUBLIC_BASE + prefix + "/" + name; }

const app = express();
app.use(compression());

// Minimal security headers
function setSecurityHeaders(_req, res, next) {
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer-when-downgrade");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
}
app.use(setSecurityHeaders);

// CORS
const WEB_ORIGIN = process.env.WEB_ORIGIN || "https://orcagroup.io";
app.use(cors({ origin: WEB_ORIGIN }));

// Optional: static web on this droplet
const WEB_DIR = path.join(__dirname, "web");
app.use(express.static(WEB_DIR, { maxAge: "1h", etag: true }));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// === Absolute media roots ===
const IMAGE_DIR = "/var/sql/recorder/images";
const PHOTO_DIR = "/var/sql/recorder/photos";
const VIDEO_DIR = "/var/sql/recorder/videos";
const THUMB_DIR = "/var/sql/recorder/thumbs"; // Thumbnails live here (.webp or .jpg)

// Ensure dirs exist
try { fs.mkdirSync(PHOTO_DIR, { recursive: true }); } catch (e) {}
try { fs.mkdirSync(VIDEO_DIR, { recursive: true }); } catch (e) {}
try { fs.mkdirSync(IMAGE_DIR, { recursive: true }); } catch (e) {}
try { fs.mkdirSync(THUMB_DIR, { recursive: true }); } catch (e) {}

// Sanity check images dir
(async function () {
  try {
    const st = await fsp.stat(IMAGE_DIR);
    if (!st.isDirectory()) {
      console.error("[BOOT] IMAGE_DIR is not a directory:", IMAGE_DIR);
      process.exit(1);
    }
    console.log("[BOOT] Serving images from:", IMAGE_DIR);
  } catch (e) {
    console.error("[BOOT] IMAGE_DIR not accessible:", IMAGE_DIR, e && e.message);
    process.exit(1);
  }
})();

/* -------------------------------- health -------------------------------- */

app.get("/healthz", function (_req, res) {
  res.json({
    ok: true,
    haveSharp: HAVE_SHARP,
    haveMagick: HAVE_MAGICK,
    haveGM: HAVE_GM,
    haveFFmpeg: HAVE_FFMPEG,
    haveFfprobe: HAVE_FFPROBE,
    haveExifr: HAVE_EXIFR,
    haveIdentify: HAVE_IDENTIFY,
    forceMode: FORCE_MODE
  });
});

/* --------------------------- static media routes -------------------------- */

const oneYear = "public, max-age=31536000, immutable";
app.use("/media/photos", express.static(PHOTO_DIR, {
  fallthrough: false,
  setHeaders: (res) => res.setHeader("Cache-Control", oneYear)
}));
app.use("/media/videos", express.static(VIDEO_DIR, {
  fallthrough: false,
  setHeaders: (res) => res.setHeader("Cache-Control", oneYear)
}));
app.use("/media/images", express.static(IMAGE_DIR, {
  fallthrough: false,
  setHeaders: (res) => res.setHeader("Cache-Control", oneYear)
}));
app.use("/media/thumbs", express.static(THUMB_DIR, {
  fallthrough: false,
  setHeaders: (res) => res.setHeader("Cache-Control", oneYear)
}));

/* ------------------------------- upload setup ----------------------------- */

const photoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PHOTO_DIR),
  filename: (_req, file, cb) => {
    const safeName = (file.originalname || "upload").replace(/\s+/g, "_");
    cb(null, Date.now() + "_" + safeName);
  }
});
const videoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, VIDEO_DIR),
  filename: (_req, file, cb) => {
    const safeName = (file.originalname || "video").replace(/\s+/g, "_");
    cb(null, Date.now() + "_" + safeName);
  }
});

const uploadPhoto = multer({ storage: photoStorage, limits: { fileSize: 25 * 1024 * 1024 } });
const uploadVideo = multer({ storage: videoStorage, limits: { fileSize: 1024 * 1024 * 1024 } }); // 1 GB

/* -------------------------- capture date extraction ------------------------ */

// Photos: try exifr first (fast/embedded), then identify, then null
async function getPhotoCaptureMs(absPath) {
  // exifr path
  if (HAVE_EXIFR && exifr) {
    try {
      const d = await exifr.parse(absPath, { tiff: true, exif: true, ifd0: true });
      // candidates in order
      const candidates = [
        d && d.DateTimeOriginal,
        d && d.CreateDate,
        d && d.ModifyDate,
        d && d.OffsetTimeOriginal, // sometimes tz info is here
      ];
      for (const c of candidates) {
        // exifr may already give Date objects
        const t = c instanceof Date ? c.getTime() : parseDateToMs(String(c || ""));
        if (t && t > 0) return t;
      }
    } catch (e) {
      console.warn("[EXIFR] parse failed:", (e && e.message) || e);
    }
  }
  // ImageMagick identify fallback
  if (HAVE_IDENTIFY) {
    try {
      const out = await execFileP("identify", ["-format", "%[EXIF:DateTimeOriginal]\n%[EXIF:CreateDate]\n%[date:create]\n%[date:modify]", absPath]);
      const lines = String(out || "").split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        const t = parseDateToMs(line);
        if (t && t > 0) return t;
      }
    } catch (e) {
      console.warn("[IDENTIFY] failed:", (e && e.message) || e);
    }
  }
  return null;
}

// Videos: ffprobe for creation_time
async function getVideoCaptureMs(absPath) {
  if (HAVE_FFPROBE) {
    try {
      const out = await execFileP("ffprobe", [
        "-v","error",
        "-select_streams","v:0",
        "-show_entries","format_tags=creation_time",
        "-of","default=nw=1:nk=1", absPath
      ]);
      const s = String(out || "").trim();
      const t = parseDateToMs(s);
      if (t && t > 0) return t;
    } catch (e) {
      // ignore; try file times
    }
  }
  return null;
}

/* ------------------------- thumbnail generators --------------------------- */

// Create a ~300px-wide thumbnail from PHOTO.
// Returns absolute path of the thumb (webp or jpg), or null.
async function ensureThumbForPhoto(photoName) {
  try {
    const src = path.join(PHOTO_DIR, photoName);
    const outWebp = path.join(THUMB_DIR, photoName + ".webp");
    const outJpg  = path.join(THUMB_DIR, photoName + ".jpg");

    try { const st = await fsp.stat(outWebp); if (st && st.size > 0) return outWebp; } catch (_e) {}
    try { const st2 = await fsp.stat(outJpg);  if (st2 && st2.size  > 0) return outJpg;  } catch (_e) {}

    // 1) sharp -> webp
    if (HAVE_SHARP && sharp) {
      try {
        await sharp(src).rotate().resize({ width: 300, withoutEnlargement: true }).webp({ quality: 70 }).toFile(outWebp);
        return outWebp;
      } catch (e) {
        console.warn("[THUMB][sharp] failed for", photoName, e && e.message);
      }
    }

    // 2) ImageMagick -> jpg
    if (HAVE_MAGICK) {
      try {
        await execFileP(MAGICK_BIN, [src, "-auto-orient", "-resize", "300x", "-quality", "70", outJpg]);
        return outJpg;
      } catch (e) {
        console.warn("[THUMB][magick] failed for", photoName, e && e.message);
      }
    }

    // 3) GraphicsMagick -> jpg
    if (HAVE_GM) {
      try {
        await execFileP("gm", ["convert", src, "-auto-orient", "-resize", "300x", "-quality", "70", outJpg]);
        return outJpg;
      } catch (e) {
        console.warn("[THUMB][gm] failed for", photoName, e && e.message);
      }
    }

    // 4) FFmpeg -> jpg (can resize images too)
    if (HAVE_FFMPEG) {
      try {
        await execFileP("ffmpeg", [
          "-y","-hide_banner","-loglevel","error",
          "-i", src, "-ss","0",
          "-frames:v","1",
          "-vf", "scale='min(300,iw)':'-1':flags=lanczos",
          outJpg
        ]);
        return outJpg;
      } catch (e) {
        console.warn("[THUMB][ffmpeg-img] failed for", photoName, e && e.message);
      }
    }

    // 5) Last resort: copy image (no resize)
    try { await fsp.copyFile(src, outJpg); return outJpg; }
    catch (e) { console.warn("[THUMB][copy] failed for", photoName, e && e.message); return null; }
  } catch (e) {
    console.warn("[THUMB] unexpected error", e && e.message);
    return null;
  }
}

// Create a ~300px-wide thumbnail from VIDEO (grab a frame).
// Returns absolute path of the thumb (jpg), or null.
async function ensureThumbForVideo(videoName) {
  try {
    const src = path.join(VIDEO_DIR, videoName);
    const outJpg = path.join(THUMB_DIR, videoName + ".jpg");

    try { const st = await fsp.stat(outJpg); if (st && st.size > 0) return outJpg; } catch(_e){}

    if (HAVE_FFMPEG) {
      // Accurate seek after -i; fallback to t=0 for very short/odd WEBMs
      try {
        await execFileP("ffmpeg", [
          "-y","-hide_banner","-loglevel","error",
          "-i", src, "-ss","0.5",
          "-frames:v","1",
          "-vf","scale='min(300,iw)':'-1':flags=lanczos",
          outJpg
        ]);
      } catch (e) {
        await execFileP("ffmpeg", [
          "-y","-hide_banner","-loglevel","error",
          "-i", src, "-ss","0",
          "-frames:v","1",
          "-vf","scale='min(300,iw)':'-1':flags=lanczos",
          outJpg
        ]);
      }
      return outJpg;
    }

    // Last resort: copy (not an image, but avoids 404; better to install ffmpeg)
    await fsp.copyFile(src, outJpg);
    return outJpg;
  } catch (e) {
    console.warn("[VTHUMB] failed for", videoName, e && e.message);
    return null;
  }
}

/* ------------------------------ legacy route ------------------------------ */

app.use("/image", function (req, _res, next) { console.log("[REQ]", req.method, req.originalUrl); next(); });

app.get("/image/:filename", function (req, res) {
  (async function () {
    try {
      const filename = req.params.filename;
      if (!/^[\w.\-]+$/.test(filename)) return res.status(400).send("Invalid filename");
      const abs = path.resolve(IMAGE_DIR, filename);
      const rootWithSep = IMAGE_DIR.endsWith(path.sep) ? IMAGE_DIR : IMAGE_DIR + path.sep;
      if (!abs.startsWith(rootWithSep)) return res.status(400).send("Invalid path");
      await fsp.access(abs, fs.constants.R_OK);
      res.sendFile(abs, { headers: { "Cache-Control": oneYear } }, function (err) {
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
  })();
});

/* -------------------------------- uploads -------------------------------- */

// Upload photo (returns absolute URLs + thumb url; sets mtime from EXIF/capturedAt; waits for thumb)
app.post("/upload/photo", uploadPhoto.single("photo"), async function (req, res) {
  try {
    const name = path.basename(req.file.path);
    const abs = req.file.path;

    // Prefer EXIF date from the photo itself
    let capMs = await getPhotoCaptureMs(abs);

    // If client provided capturedAt, use it only if EXIF missing
    const clientCap = parseInt(req.body && req.body.capturedAt, 10);
    if ((!capMs || capMs <= 0) && Number.isFinite(clientCap) && clientCap > 0) capMs = clientCap;

    // Fallbacks: file birthtime/mtime/now
    try {
      const st = await fsp.stat(abs);
      if (!capMs || capMs <= 0) capMs = (st.birthtimeMs && st.birthtimeMs > 0) ? st.birthtimeMs : robustMtimeMs(st);
    } catch (_e){ if(!capMs) capMs = Date.now(); }

    // Apply mtime = captured time
    try { await fsp.utimes(abs, capMs/1000, capMs/1000); } catch (_e){}

    const thumbPath = await ensureThumbForPhoto(name); // synchronous so URL valid
    const json = {
      ok: true,
      url: makeUrl("/media/photos", name),
      name: name,
      mtimeMs: capMs|0
    };
    if (thumbPath) json.thumbUrl = makeUrl("/media/thumbs", path.basename(thumbPath));
    return res.json(json);
  } catch (e) {
    console.error("[upload/photo] err", e);
    return res.status(500).json({ ok:false, error: "upload failed" });
  }
});

// Upload video (returns absolute URLs + thumb url; sets mtime from ffprobe/capturedAt; waits for thumb)
app.post("/upload/video", uploadVideo.single("video"), async function (req, res) {
  try {
    const name = path.basename(req.file.path);
    const abs = req.file.path;

    // Prefer video container creation_time if available
    let capMs = await getVideoCaptureMs(abs);

    // If client provided capturedAt, use it only if metadata missing
    const clientCap = parseInt(req.body && req.body.capturedAt, 10);
    if ((!capMs || capMs <= 0) && Number.isFinite(clientCap) && clientCap > 0) capMs = clientCap;

    // Fallbacks
    try {
      const st = await fsp.stat(abs);
      if (!capMs || capMs <= 0) capMs = (st.birthtimeMs && st.birthtimeMs > 0) ? st.birthtimeMs : robustMtimeMs(st);
    } catch (_e){ if(!capMs) capMs = Date.now(); }

    // Apply mtime = captured time
    try { await fsp.utimes(abs, capMs/1000, capMs/1000); } catch (_e){}

    const thumbPath = await ensureThumbForVideo(name); // synchronous so URL valid
    const json = {
      ok: true,
      url: makeUrl("/media/videos", name),
      name: name,
      mtimeMs: capMs|0
    };
    if (thumbPath) json.thumbUrl = makeUrl("/media/thumbs", path.basename(thumbPath));
    return res.json(json);
  } catch (e) {
    console.error("[upload/video] err", e);
    return res.status(500).json({ ok:false, error:"upload failed" });
  }
});

/* ---------------------------- list endpoints ------------------------------ */

function fileExists(p) {
  try { fs.accessSync(p, fs.constants.R_OK); return true; } catch (_e) { return false; }
}

// List dir to JSON; attach thumbUrl for photos/videos if present;
// if opts.force===true: synchronously ensure thumbs for each item before returning
function listDirJSON(dir, prefix, cb, opts) {
  const force = !!(opts && opts.force);
  const isPhotoDir = dir === PHOTO_DIR;
  const isVideoDir = dir === VIDEO_DIR;

  fs.readdir(dir, function (err, files) {
    if (err) return cb(err);

    files = files.filter((n) =>
      /^[\w.\-]+$/.test(n) &&
      !isTemp(n) &&
      (!isPhotoDir || isPhotoFile(n)) &&
      (!isVideoDir || isVideoFile(n))
    );

    const items = [];
    let pending = files.length;
    if (!pending) return cb(null, items);

    function finishIfDone() {
      if (!--pending) {
        items.sort((a,b)=> (b.mtimeMs||0) - (a.mtimeMs||0));
        cb(null, items);
      }
    }

    files.forEach(function (name) {
      const fp = path.join(dir, name);
      fs.stat(fp, async function (e, st) {
        if (!e && st.isFile()) {
          const item = {
            name: name,
            url: makeUrl(prefix, name),
            size: st.size,
            mtimeMs: robustMtimeMs(st)
          };

          if (isPhotoDir) {
            const webp = path.join(THUMB_DIR, name + ".webp");
            const jpg  = path.join(THUMB_DIR, name + ".jpg");
            if (fileExists(webp)) { item.thumbUrl = makeUrl("/media/thumbs", name + ".webp"); items.push(item); finishIfDone(); return; }
            if (fileExists(jpg))  { item.thumbUrl = makeUrl("/media/thumbs", name + ".jpg");  items.push(item); finishIfDone(); return; }
            if (force) {
              try { const out = await ensureThumbForPhoto(name); if (out) item.thumbUrl = makeUrl("/media/thumbs", path.basename(out)); } catch(_e){}
              items.push(item); finishIfDone(); return;
            } else {
              ensureThumbForPhoto(name).catch(()=>{});
              items.push(item); finishIfDone(); return;
            }
          } else if (isVideoDir) {
            const vjpg = path.join(THUMB_DIR, name + ".jpg");
            if (fileExists(vjpg)) { item.thumbUrl = makeUrl("/media/thumbs", name + ".jpg"); items.push(item); finishIfDone(); return; }
            if (force) {
              try { const out = await ensureThumbForVideo(name); if (out) item.thumbUrl = makeUrl("/media/thumbs", path.basename(out)); } catch(_e){}
              items.push(item); finishIfDone(); return;
            } else {
              ensureThumbForVideo(name).catch(()=>{});
              items.push(item); finishIfDone(); return;
            }
          } else {
            // generic images dir
            items.push(item); finishIfDone(); return;
          }
        } else {
          // skip non-file
          finishIfDone();
        }
      });
    });
  });
}

function listDirJSONP(dir, prefix, opts) {
  return new Promise(function (resolve, reject) {
    listDirJSON(dir, prefix, function (err, items) {
      if (err) reject(err); else resolve(items);
    }, opts);
  });
}

app.get("/list/photos", function (req, res) {
  const force = FORCE_MODE || req.query.force === '1';
  listDirJSON(PHOTO_DIR, "/media/photos", function (err, items) {
    if (err) return res.status(500).json({ ok:false, error:err.message });
    res.json({ ok:true, items: items });
  }, { force });
});

app.get("/list/videos", function (req, res) {
  const force = FORCE_MODE || req.query.force === '1';
  listDirJSON(VIDEO_DIR, "/media/videos", function (err, items) {
    if (err) return res.status(500).json({ ok:false, error:err.message });
    res.json({ ok:true, items: items });
  }, { force });
});

/* ------------------------------ sessions API ------------------------------ */

// Parse "1699456892000_SID-<sessionId>__original.ext" -> <sessionId>
function sessionIdFromName(name) {
  const underscore = name.indexOf('_');
  if (underscore < 0) return null;
  const rest = name.substring(underscore + 1); // after ts_
  const tag = 'SID-';
  const i = rest.indexOf(tag);
  const j = rest.indexOf('__');
  if (i < 0 || j <= i) return null;
  return rest.substring(i + tag.length, j);
}

app.get("/list/sessions", async function (req, res) {
  try {
    const force = FORCE_MODE || req.query.force === '1';
    const photos = await listDirJSONP(PHOTO_DIR, "/media/photos", { force });
    const videos = await listDirJSONP(VIDEO_DIR, "/media/videos", { force });

    const by = Object.create(null);
    function addToSession(item, isPhoto) {
      const sid = sessionIdFromName(item.name) || "unsessioned";
      let s = by[sid];
      if (!s) {
        s = by[sid] = {
          id: sid,
          when: item.mtimeMs || 0,
          photos: [],
          videos: []
        };
      }
      if ((item.mtimeMs||0) > s.when) s.when = item.mtimeMs||0;
      if (isPhoto) s.photos.push(item); else s.videos.push(item);
    }

    photos.forEach(p => addToSession(p, true));
    videos.forEach(v => addToSession(v, false));

    // Compose response; thumbs: prefer photo thumbs then video thumbs
    const sessions = [];
    for (const k in by) {
      const s = by[k];
      const thumbs = [];

      // up to 3 photo thumbs
      for (let i = 0; i < s.photos.length && thumbs.length < 3; i++) {
        const ph = s.photos[i];
        thumbs.push(ph.thumbUrl || ph.url); // photo url is an image
      }

      // top-up with video thumbs if present
      for (let j = 0; j < s.videos.length && thumbs.length < 3; j++) {
        const vd = s.videos[j];
        const tu = vd.thumbUrl;
        if (tu) thumbs.push(tu);
      }

      sessions.push({
        id: s.id,
        when: s.when|0,
        photos: s.photos,
        videos: s.videos,
        thumbs: thumbs
      });
    }

    sessions.sort((a,b) => b.when - a.when);
    res.json({ ok: true, sessions: sessions });
  } catch (e) {
    console.error("[list/sessions] err", e);
    res.status(500).json({ ok: false, error: (e && e.message) || "server error" });
  }
});

/* -------------------------- bulk (re)build thumbs ------------------------- */

const MAX_THUMB_WORKERS = parseInt(process.env.THUMB_WORKERS || '2', 10);

function buildMissingPhotoThumbsP() {
  return fsp.readdir(PHOTO_DIR).then(function (files) {
    const names = files.filter(n => /^[\w.\-]+$/.test(n) && !isTemp(n) && isPhotoFile(n));
    let idx = 0, active = 0, done = 0;

    return new Promise((resolve) => {
      function next() {
        if (idx >= names.length && active === 0) {
          console.log("[BOOT] photo thumb build finished; processed:", done, "files");
          resolve(); return;
        }
        while (active < MAX_THUMB_WORKERS && idx < names.length) {
          const name = names[idx++];
          active++;
          ensureThumbForPhoto(name).then(function () {
            done++;
            active--; next();
          }).catch(function () {
            active--; next();
          });
        }
      }
      console.log("[BOOT] building missing PHOTO thumbs with", MAX_THUMB_WORKERS, "workers; files:", names.length);
      next();
    });
  }).catch(function (e) {
    console.warn("[BOOT] could not scan photos for thumbnails:", (e && e.message) || e);
  });
}

function buildMissingVideoThumbsP() {
  return fsp.readdir(VIDEO_DIR).then(function (files) {
    const names = files.filter(n => /^[\w.\-]+$/.test(n) && !isTemp(n) && isVideoFile(n));
    let idx = 0, active = 0, done = 0;

    return new Promise((resolve) => {
      function next() {
        if (idx >= names.length && active === 0) {
          console.log("[BOOT] video thumb build finished; processed:", done, "files");
          resolve(); return;
        }
        while (active < MAX_THUMB_WORKERS && idx < names.length) {
          const name = names[idx++];
          active++;
          ensureThumbForVideo(name).then(function () {
            done++;
            active--; next();
          }).catch(function () {
            active--; next();
          });
        }
      }
      console.log("[BOOT] building missing VIDEO thumbs with", MAX_THUMB_WORKERS, "workers; files:", names.length);
      next();
    });
  }).catch(function (e) {
    console.warn("[BOOT] could not scan videos for thumbnails:", (e && e.message) || e);
  });
}

// Admin endpoint to rebuild both photos & videos (idempotent)
app.post("/admin/build-thumbs", async function (_req, res) {
  try {
    const filesP = (await fsp.readdir(PHOTO_DIR)).filter(n => /^[\w.\-]+$/.test(n) && !isTemp(n) && isPhotoFile(n));
    const filesV = (await fsp.readdir(VIDEO_DIR)).filter(n => /^[\w.\-]+$/.test(n) && !isTemp(n) && isVideoFile(n));

    const result = {
      ok:true,
      photos: { made:0, skipped:0, failed:0 },
      videos: { made:0, skipped:0, failed:0 }
    };

    // Photos
    await Promise.all(filesP.map(async function (name) {
      try {
        const fp = path.join(PHOTO_DIR, name);
        const st = await fsp.stat(fp);
        if (!st.isFile()) return;
        const webp = path.join(THUMB_DIR, name + ".webp");
        const jpg  = path.join(THUMB_DIR, name + ".jpg");
        if (fileExists(webp) || fileExists(jpg)) { result.photos.skipped++; return; }
        const out = await ensureThumbForPhoto(name);
        if (out) result.photos.made++; else result.photos.failed++;
      } catch (_e) { result.photos.failed++; }
    }));

    // Videos
    await Promise.all(filesV.map(async function (name) {
      try {
        const fp = path.join(VIDEO_DIR, name);
        const st = await fsp.stat(fp);
        if (!st.isFile()) return;
        const jpg = path.join(THUMB_DIR, name + ".jpg");
        if (fileExists(jpg)) { result.videos.skipped++; return; }
        const out = await ensureThumbForVideo(name);
        if (out) result.videos.made++; else result.videos.failed++;
      } catch (_e) { result.videos.failed++; }
    }));

    return res.json(result);
  } catch (e) {
    console.error("[admin/build-thumbs] err", e);
    return res.status(500).json({ ok:false, error: (e && e.message) || "server error" });
  }
});

/* ------------------------------- SPA fallback ----------------------------- */

app.get("*", function (_req, res) {
  res.sendFile(path.join(WEB_DIR, "index.html"));
});

/* --------------------------------- HTTPS --------------------------------- */

const httpsOptions = {
  key : fs.readFileSync("/etc/letsencrypt/live/inventory.orcagroup.io/privkey.pem"),
  cert: fs.readFileSync("/etc/letsencrypt/live/inventory.orcagroup.io/fullchain.pem")
};

async function startServer() {
  if (FORCE_MODE) {
    console.log("[BOOT] -force enabled: building ALL missing thumbnails before start…");
    await buildMissingPhotoThumbsP();
    await buildMissingVideoThumbsP();
  } else {
    // background (non-blocking)
    buildMissingPhotoThumbsP();
    buildMissingVideoThumbsP();
  }

  https.createServer(httpsOptions, app).listen(PORT, function () {
    console.log("🌐 API & Images on https://0.0.0.0:" + PORT);
    console.log("   PUBLIC_BASE:", PUBLIC_BASE);
    console.log("   Allowed CORS origin:", WEB_ORIGIN);
    console.log("   Media roots:",
      "\n   - photos:", PHOTO_DIR,
      "\n   - videos:", VIDEO_DIR,
      "\n   - images:", IMAGE_DIR,
      "\n   - thumbs:", THUMB_DIR);
    console.log("   Engines:",
      "\n   - sharp:", HAVE_SHARP,
      "\n   - magick:", HAVE_MAGICK ? MAGICK_BIN : false,
      "\n   - gm:", HAVE_GM,
      "\n   - ffmpeg:", HAVE_FFMPEG,
      "\n   - ffprobe:", HAVE_FFPROBE,
      "\n   - exifr:", HAVE_EXIFR,
      "\n   - identify:", HAVE_IDENTIFY);
    console.log("   FORCE_MODE:", FORCE_MODE);
  });
}

startServer().catch((e) => {
  console.error("[BOOT] fatal:", e && e.stack || e);
  process.exit(1);
});
