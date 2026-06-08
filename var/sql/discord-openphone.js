// discord-openphone.js

const express    = require("express");
const fs         = require("fs");
const https      = require("https");
const bodyParser = require("body-parser");
const { Client, Intents } = require("discord.js");

// ─── Hardcoded config ───────────────────────────────────────
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || "";
const DISCORD_CHANNEL_ID = "1254814025980706838";

const TLS_KEY_PATH  = "/etc/letsencrypt/live/inventory.orcagroup.io/privkey.pem";
const TLS_CERT_PATH = "/etc/letsencrypt/live/inventory.orcagroup.io/fullchain.pem";

const PORT = 7031;  // your requested port

// ─── Discord client (v13) ───────────────────────────────────
const discordClient = new Client({ intents: [ Intents.FLAGS.GUILDS ] });

discordClient.login(DISCORD_BOT_TOKEN);
discordClient.once("ready", () => {
  console.log(`✅ Discord bot logged in as ${discordClient.user.tag}`);
});

// ─── Express setup ──────────────────────────────────────────
const app = express();
app.use(bodyParser.json());

// Health‐check
app.get("/", (_req, res) => {
  res.send("✅ Discord‐OpenPhone bot alive");
});

// Receive from your front-end and forward to Discord
app.post("/send-to-discord", async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: "Missing content" });

  // fetch channel
  let channel;
  try {
    channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
  } catch {
    return res.status(404).json({ error: "Channel not found" });
  }

  channel.send(content)
    .then(() => res.status(200).json({ ok: true }))
    .catch(err => res.status(500).json({ error: err.message }));
});

// ─── HTTPS server ────────────────────────────────────────────
const httpsOptions = {
  key : fs.readFileSync(TLS_KEY_PATH),
  cert: fs.readFileSync(TLS_CERT_PATH),
};

https.createServer(httpsOptions, app).listen(PORT, () => {
  console.log(`🔒 HTTPS bot listening on port ${PORT}`);
});
