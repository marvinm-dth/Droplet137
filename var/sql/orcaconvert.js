#!/usr/bin/env node
import dotenv            from "dotenv";
import { createClient }  from "@supabase/supabase-js";
import OpenAI            from "openai";
import chalk             from "chalk";
import util              from "node:util";
import { URL }           from "node:url";
import process           from "node:process";

/* ----- HOISTED helper – define FIRST ----- */
function must(val, msg) {
  if (!val) throw new Error(msg);
}

/* ---------- LOAD ENV ---------- */
dotenv.config();

/* ---------- CONFIG ---------- */
const RAW_URL      = process.env.SUPABASE_URL ?? "http://137.184.148.164:8000";
const SUPABASE_URL = normaliseUrl(RAW_URL);
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const MODEL        = "gpt-4o-mini";

const BATCH_SIZE   = Number(process.env.BATCH_SIZE ?? 50);
const SLEEP_MS     = Number(process.env.SLEEP_MS  ?? 1000);
/* ----------------------------------------- */

must(SUPABASE_KEY,       "SUPABASE_ANON_KEY missing");
must(process.env.OPENAI_API_KEY, "OPENAI_API_KEY missing");

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openai   = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PROMPT = `You are a precise translator.
Translate the following text into (1) English, (2) Simplified Chinese, and (3) Spanish.
Return JSON exactly in the form:
{"en":"…","cn":"…","es":"…"}

Text to translate:
\`\`\`
%s
\`\`\``;

/* ===== main ===== */
(async () => {
  console.log(chalk.green("🔗  Using Supabase @"), SUPABASE_URL);
  await healthCheck(SUPABASE_URL);
  console.log(chalk.green("🤖  Model:"), MODEL, "\n");

  while (true) {
    const rows = await fetchBatch();
    if (!rows.length) {
      console.log(chalk.blue("✅  Nothing left to translate – done."));
      break;
    }

    console.log(chalk.yellow(`🗂️  Translating ${rows.length} row(s)…`));

    for (const r of rows) {
      try {
        const t = await translate(r.message);
        await updateRow(r.id, t);
        console.log(chalk.gray(`  • id ${r.id} updated.`));
      } catch (err) {
        console.error(chalk.red(`  ! id ${r.id} failed →`), err.message);
      }
    }
    await wait(SLEEP_MS);
  }
})().catch((err) => {
  console.error(chalk.red("💥  Fatal:"), err);
  process.exit(1);
});

/* ===== helpers (defined AFTER main stuff is fine) ===== */

function normaliseUrl(str) {
  const u = new URL(str);
  if (u.port === "8000" && u.protocol !== "http:")
    u.protocol = "http:";                     // avoid https→http mismatch
  return u.toString().replace(/\/+$/, "");
}

async function healthCheck(base) {
  const url = `${base}/rest/v1/`;
  try {
    const res = await fetch(url, { method: "HEAD", timeout: 5000 });
    if (!res.ok && res.status !== 401 && res.status !== 404)
      throw new Error(`Unexpected status ${res.status}`);
    console.log(chalk.green("✅  Supabase reachable.\n"));
  } catch (e) {
    throw new Error(
      `Cannot reach Supabase at ${url}\n→ ${e.message}\n` +
      "Check protocol, firewall, container status."
    );
  }
}

async function fetchBatch() {
  const { data, error } = await supabase
    .from("orca_conversations")
    .select("id, message")
    .or("EN.is.null,CN.is.null,ES.is.null")
    .not("message", "is", null)
    .limit(BATCH_SIZE);
  if (error) throw error;
  return data;
}

async function translate(text) {
  const prompt = util.format(PROMPT, text);
  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
  });
  return JSON.parse(res.choices[0].message.content.trim());
}

async function updateRow(id, { en, cn, es }) {
  const { error } = await supabase
    .from("orca_conversations")
    .update({ EN: en, CN: cn, ES: es })
    .eq("id", id);
  if (error) throw error;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
