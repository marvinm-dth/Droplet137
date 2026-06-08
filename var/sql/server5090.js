// /*************************************************************************
//  * bridgeImageServer.js     (port 5080)
//  * --------------------------------------------------------------
//  *  npm i express ws cors dotenv
//  *************************************************************************/
// require("dotenv").config();

// const express   = require("express");
// const http      = require("http");
// const WebSocket = require("ws");
// const cors      = require("cors");

// /* ---------------------------------------------------------------------
//    Express + WebSocket bootstrap
//    ------------------------------------------------------------------ */
// const app    = express();
// const server = http.createServer(app);
// const wss    = new WebSocket.Server({ server });

// app.use(cors());
// app.use(express.json({ limit: "20mb" }));   // accept large base64 payloads

// /* ---------------------------------------------------------------------
//    Track Raspberry-Pi clients
//    ------------------------------------------------------------------ */
// const pis = new Set();

// wss.on("connection", ws => {
//   console.log("[WS] ✅ Pi connected");
//   pis.add(ws);

//   ws.on("close", () => {
//     pis.delete(ws);
//     console.log("[WS] ❌ Pi disconnected");
//   });
// });

// /* ---------------------------------------------------------------------
//    Helper: broadcast a message to every connected Pi
//    ------------------------------------------------------------------ */
// function broadcastToPis(obj) {
//   const payload = JSON.stringify(obj);
//   let delivered = 0;

//   pis.forEach(ws => {
//     if (ws.readyState === WebSocket.OPEN) {
//       ws.send(payload);
//       delivered++;
//     }
//   });

//   console.log("[BROADCAST]", delivered, "client(s) →", payload.slice(0, 100));
//   return delivered;
// }

// /* ---------------------------------------------------------------------
//    /api/print-image  – HTML posts an image, we relay it to the printer
//    ------------------------------------------------------------------ */
// app.post("/api/print-image", (req, res) => {
//   console.log("\n[PRINT] ▶︎  new image-only job");

//   const { imageUrl, imageData, cut = true } = req.body ?? {};

//   if (!imageUrl && !imageData) {
//     console.log("[PRINT] ⚠️  body missing imageUrl/imageData");
//     return res.status(400).json({ error: "imageUrl or imageData required" });
//   }

//   const delivered = broadcastToPis({
//     type:      "print",
//     imageUrl,        // at most ONE of these will be defined
//     imageData,
//     cut: Boolean(cut)
//   });

//   return delivered
//     ? res.json({ status: "sent", delivered })
//     : res.status(503).json({ error: "No Pi connected" });
// });

// /* ---------------------------------------------------------------------
//    Boot
//    ------------------------------------------------------------------ */
// const PORT = 5090;
// server.listen(PORT,
//   () => console.log(`\n=== Image-only bridge server listening on :${PORT} ===`)
// );


/*************************************************************************
 * bridgeImageServer.js     (port 5090)
 * --------------------------------------------------------------
 *  npm i express ws cors dotenv
 *************************************************************************/
require("dotenv").config();

const express   = require("express");
const http      = require("http");
const WebSocket = require("ws");
const cors      = require("cors");

/* ---------------------------------------------------------------------
   Express + WebSocket bootstrap
   ------------------------------------------------------------------ */
const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json({ limit: "20mb" }));   // accept large base64 payloads

/* ---------------------------------------------------------------------
   Track Raspberry-Pi clients
   ------------------------------------------------------------------ */
const pis = new Set();

wss.on("connection", ws => {
  console.log("[WS] ✅ Pi connected");
  pis.add(ws);

  ws.on("close", () => {
    pis.delete(ws);
    console.log("[WS] ❌ Pi disconnected");
  });
});

/* ---------------------------------------------------------------------
   Helper: broadcast a message to every connected Pi
   ------------------------------------------------------------------ */
function broadcastToPis(obj) {
  const payload   = JSON.stringify(obj);
  let delivered = 0;

  pis.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
      delivered++;
    }
  });

  console.log("[BROADCAST]", delivered, "client(s) ←", payload.slice(0, 120));
  return delivered;
}

/* ---------------------------------------------------------------------
   /api/print-image  – HTML posts an image, we relay it to the printer(s)
   ------------------------------------------------------------------ */
app.post("/api/print-image", (req, res) => {
  console.log("\n[PRINT] ▶︎  new image-only job");

  const {
    imageUrl,
    imageData,
    queue = "D520_raw",   // default if caller omits it
    cut   = true
  } = req.body ?? {};

  if (!imageUrl && !imageData) {
    console.log("[PRINT] ⚠️  body missing imageUrl/imageData");
    return res.status(400).json({ error: "imageUrl or imageData required" });
  }

  const delivered = broadcastToPis({
    type: "print",
    imageUrl,        // at most ONE of these will be defined
    imageData,
    queue,           // ← passed straight through
    cut: Boolean(cut)
  });

  return delivered
    ? res.json({ status: "sent", delivered })
    : res.status(503).json({ error: "No Pi connected" });
});

/* ---------------------------------------------------------------------
   Boot
   ------------------------------------------------------------------ */
const PORT = 5090;
server.listen(PORT,
  () => console.log(`\n=== Image-only bridge server listening on :${PORT} ===`)
);
