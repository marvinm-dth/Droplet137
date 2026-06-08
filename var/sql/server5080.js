// require('dotenv').config();

// const express = require('express');
// const http    = require('http');
// const WebSocket = require('ws');
// const cors    = require('cors');
// const { createClient } = require('@supabase/supabase-js');

// /* ---------------------------------------------------------------------
//    Supabase config
//    ------------------------------------------------------------------ */
//    const SUPABASE_URL = "http://137.184.148.164:8000";
//    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;    // anon or service‑role key
// if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
//   throw new Error('Missing Supabase credentials – check your .env file');
// }
// const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// /* ---------------------------------------------------------------------
//    Express + WS bootstrap
//    ------------------------------------------------------------------ */
// const app    = express();
// const server = http.createServer(app);
// const wss    = new WebSocket.Server({ server });

// app.use(cors());
// app.use(express.json({ limit: '10mb' })); // accept large base64 images

// /* ---------------------------------------------------------------------
//    Raspberry‑Pi bridge
//    ------------------------------------------------------------------ */
// const raspberryClients = new Set();

// wss.on('connection', ws => {
//   console.log('[WS] Pi connected');
//   raspberryClients.add(ws);
//   ws.on('close', () => { raspberryClients.delete(ws); console.log('[WS] Pi disconnected'); });
// });

// /* ---------------------------------------------------------------------
//    /api/print – forward print jobs to any connected Pis
//    ------------------------------------------------------------------ */
// app.post('/api/print', (req, res) => {
//   //  If the request body is undefined (bad client / wrong content‑type) we fall back to {}
//   const { template, headerImageUrl, headerImageData, imageUrl, imageData } = req.body ?? {};

//   if (!template && !headerImageUrl && !headerImageData && !imageUrl && !imageData) {
//     return res.status(400).json({ error: 'Nothing to print – did you forget JSON body or Content‑Type: application/json?' });
//   }

//   const msg = {
//     type: 'print',
//     template,
//     headerImageUrl,
//     headerImageData,
//     imageUrl,
//     imageData,
//   };
//   const payload = JSON.stringify(msg);
//   let delivered = false;

//   raspberryClients.forEach(ws => {
//     if (ws.readyState === WebSocket.OPEN) {
//       ws.send(payload);
//       delivered = true;
//     }
//   });

//   delivered ? res.json({ status: 'Sent to Pi' })
//             : res.status(503).json({ error: 'No Pi connected' });
// });

// /* ---------------------------------------------------------------------
//    ticket_templates CRUD
//    ------------------------------------------------------------------ */
// // CREATE ----------------------------------------------------------------
// app.post('/api/templates', async (req, res) => {
//   const { templateName, templateBaseform, templateJson } = req.body ?? {};
//   if (!templateName || !templateBaseform || !templateJson) {
//     return res.status(400).json({ error: 'templateName, templateBaseform & templateJson are required' });
//   }
//   try {
//     const { data, error } = await supabase
//       .from('ticket_templates')
//       .insert({
//         template_name:     templateName,
//         template_baseform: templateBaseform,
//         template_json:     templateJson,
//       })
//       .select()
//       .single();
//     if (error) throw error;
//     res.status(201).json(data);
//   } catch (err) {
//     console.error('[CREATE]', err);
//     res.status(500).json({ error: 'Failed to create template' });
//   }
// });

// // READ (list) -----------------------------------------------------------
// app.get('/api/templates', async (_req, res) => {
//   try {
//     const { data, error } = await supabase
//       .from('ticket_templates')
//       .select('*')
//       .order('created_at', { ascending: false });
//     if (error) throw error;
//     res.json(data);
//   } catch (err) {
//     console.error('[LIST]', err);
//     res.status(500).json({ error: 'Failed to fetch templates' });
//   }
// });

// // READ (single) ---------------------------------------------------------
// app.get('/api/templates/:id', async (req, res) => {
//   const id = Number(req.params.id);
//   if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
//   try {
//     const { data, error } = await supabase
//       .from('ticket_templates')
//       .select('*')
//       .eq('id', id)
//       .single();
//     if (error) throw error;
//     res.json(data);
//   } catch (err) {
//     console.error('[GET]', err);
//     res.status(404).json({ error: 'Template not found' });
//   }
// });

// // UPDATE ----------------------------------------------------------------
// app.put('/api/templates/:id', async (req, res) => {
//   const id = Number(req.params.id);
//   if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

//   const { templateName, templateBaseform, templateJson } = req.body ?? {};
//   const updates = {};
//   if (templateName)     updates.template_name     = templateName;
//   if (templateBaseform) updates.template_baseform = templateBaseform;
//   if (templateJson)     updates.template_json     = templateJson;
//   if (!Object.keys(updates).length) {
//     return res.status(400).json({ error: 'Nothing to update' });
//   }

//   try {
//     const { data, error } = await supabase
//       .from('ticket_templates')
//       .update(updates)
//       .eq('id', id)
//       .select()
//       .single();
//     if (error) throw error;
//     res.json(data);
//   } catch (err) {
//     console.error('[UPDATE]', err);
//     res.status(500).json({ error: 'Failed to update template' });
//   }
// });

// // DELETE ----------------------------------------------------------------
// app.delete('/api/templates/:id', async (req, res) => {
//   const id = Number(req.params.id);
//   if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
//   try {
//     const { error } = await supabase
//       .from('ticket_templates')
//       .delete()
//       .eq('id', id);
//     if (error) throw error;
//     res.status(204).send();
//   } catch (err) {
//     console.error('[DELETE]', err);
//     res.status(500).json({ error: 'Failed to delete template' });
//   }
// });

// /* ---------------------------------------------------------------------
//    Boot
//    ------------------------------------------------------------------ */
// const PORT = process.env.PORT || 5080;
// server.listen(PORT, () => {
//   console.log(`Bridge server listening on port ${PORT}`);
// });


/*************************************************************************
 * bridgeServer.js  – VERBOSE EDITION  (port 5080)
 * ----------------------------------------------------------------------
 *  npm i express ws cors @supabase/supabase-js dotenv
 *************************************************************************/
require('dotenv').config();

const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const cors      = require('cors');
const { createClient } = require('@supabase/supabase-js');

/* ---------------------------------------------------------------------
   Supabase
   ------------------------------------------------------------------ */
const SUPABASE_URL      = "http://137.184.148.164:8000";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_ANON_KEY) throw new Error('Missing SUPABASE_ANON_KEY');
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------------------------------------------------------------------
   Express + WS bootstrap
   ------------------------------------------------------------------ */
const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json({ limit: '10mb' }));

/* ---------------------------------------------------------------------
   Raspberry-Pi set
   ------------------------------------------------------------------ */
const pis = new Set();
wss.on('connection', ws => {
  console.log('[WS] ✅ Pi connected  (total:', pis.size + 1, ')');
  pis.add(ws);
  ws.on('close', () => {
    pis.delete(ws);
    console.log('[WS] ❌ Pi disconnected (total:', pis.size, ')');
  });
});

/* ---------------------------------------------------------------------
   Helper: broadcast + log
   ------------------------------------------------------------------ */
function sendToPis(obj) {
  const msg = JSON.stringify({ type: 'print', ...obj });
  let delivered = 0;
  pis.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
      delivered++;
    }
  });
  console.log('[BROADCAST] Sent to', delivered, 'Pi client(s).');
  return delivered > 0;
}
/* ---------------------------------------------------------------------
   Helper: massage any frontend/template JSON → Pi-friendly payload
   ------------------------------------------------------------------ */
 /* ---------------------------------------------------------------------
   Helper: massage any frontend/template JSON → Pi-friendly payload
   ------------------------------------------------------------------ */
function toPiPayload(raw) {
  // 👉 1. If everything is wrapped in { template: {...} } pull it up
  if (raw.template && typeof raw.template === 'object') {
    raw = { ...raw, ...raw.template };   // spread header / fields up
    delete raw.template;
  }

  const out = {};

  /* ── header image ──────────────────────────────────────────────── */
  if (raw.header?.imageUrl)   out.headerImageData = raw.header.imageUrl;
  if (raw.header?.imageData)  out.headerImageData = raw.header.imageData;
  // already flat?
  if (raw.headerImageData)    out.headerImageData = raw.headerImageData;
  if (raw.headerImageUrl)     out.headerImageUrl  = raw.headerImageUrl;

  /* ── body image (optional) ─────────────────────────────────────── */
  if (raw.imageUrl)  out.imageUrl  = raw.imageUrl;
  if (raw.imageData) out.imageData = raw.imageData;

  /* ── fields → strip to text only ───────────────────────────────── */
  const fields = raw.fields;
  if (fields) {
    out.template = {};
    for (const [k, v] of Object.entries(fields)) {
      if (typeof v === 'object' && 'text' in v) out.template[k] = { text: v.text };
      else if (typeof v === 'string')           out.template[k] = { text: v };
    }
  }

  /* ── cut flag ──────────────────────────────────────────────────── */
  out.cut = 'cut' in raw ? !!raw.cut : true;

  return out;
}

/* ---------------------------------------------------------------------
   Utility: canonical key set
   ------------------------------------------------------------------ */
//const canon = o => Object.keys(o).sort().join('|');
/* ---------------------------------------------------------------------
   Utility: canonical key-set signature
   ------------------------------------------------------------------ */
   const canon = obj =>
    obj && typeof obj === 'object'
      ? Object.keys(obj).sort().join('|')
      : '';               // empty signature for null / undefined / non-object
  
/* ---------------------------------------------------------------------
   /api/intake  (raw card JSON → template → print)
   ------------------------------------------------------------------ */
app.post('/api/intake', async (req, res) => {
  console.log('\n[INTAKE] ▶︎  New request ---------------------------------');
  const card = req.body?.card;
  if (!card) {
    console.log('[INTAKE] ⚠️  card object missing');
    return res.status(400).json({ error: 'card missing' });
  }
  console.log('[INTAKE] card received:', card);

  /* 1. retrieve templates */
  const { data: tpls, error } = await sb
        .from('ticket_templates')
        .select('id, template_baseform, template_json')
        .order('id', { ascending: false });
  if (error) {
    console.error('[INTAKE] ❌ DB error:', error.message);
    return res.status(500).json({ error: 'db error' });
  }
  console.log('[INTAKE] templates fetched:', tpls.length);

  /* 2. match by key set */
  const keySig = canon(card);
  let found = null;
  for (const row of tpls) {
    const base = typeof row.template_baseform === 'string'
               ? JSON.parse(row.template_baseform)
               : row.template_baseform;
    if (canon(base) === keySig) { found = row; break; }
  }
  if (!found) {
    console.log('[INTAKE] 🔍 No template matched key set:', keySig);
    return res.status(404).json({ error: 'No template matched' });
  }
  console.log('[INTAKE] ✅ Matched template id:', found.id);

  /* 3. build printable template */
  const tpl = typeof found.template_json === 'string'
            ? JSON.parse(found.template_json)
            : found.template_json;
  tpl.fields = tpl.fields || {};
  for (const [k,v] of Object.entries(card)) {
    if (tpl.fields[k] && typeof tpl.fields[k] === 'object')
      tpl.fields[k].text = v;
    else
      tpl.fields[k] = v;
  }
  console.log('[INTAKE] template filled:', JSON.stringify(tpl, null, 2));

  /* 4. send */
  // const ok = sendToPis({ template: tpl });
  const ok = sendToPis( toPiPayload({ template: tpl }) );

  if (!ok) {
    console.log('[INTAKE] 🚫 No Pi online.');
    return res.status(503).json({ error: 'No Pi connected' });
  }
  console.log('[INTAKE] 🖨️  Print job dispatched.');
  res.json({ status: `Printed with template #${found.id}` });
});

/* ---------------------------------------------------------------------
   /api/print (unchanged but chatty)
   ------------------------------------------------------------------ */
app.post('/api/print', (req, res) => {
  console.log('\n[PRINT] ▶︎  Direct template job received');
  //const { template, headerImageUrl, headerImageData, imageUrl, imageData } = req.body ?? {};
  if (!template && !headerImageUrl && !headerImageData && !imageUrl && !imageData) {
    console.log('[PRINT] ⚠️  body empty');
    return res.status(400).json({ error: 'Nothing to print' });
  }
  //const ok = sendToPis({ template, headerImageUrl, headerImageData, imageUrl, imageData });
  const ok = sendToPis( toPiPayload(req.body ?? {}) );
  ok ? res.json({ status: 'Sent to Pi' })
     : res.status(503).json({ error: 'No Pi connected' });
});

/* ---------------------------------------------------------------------
   CRUD routes (identical, but each logs result counts)
   ------------------------------------------------------------------ */
// CREATE ----------------------------------------------------------------
app.post('/api/templates', async (req, res) => {
  const { templateName, templateBaseform, templateJson } = req.body ?? {};
  if (!templateName || !templateBaseform || !templateJson)
    return res.status(400).json({ error: 'templateName, templateBaseform & templateJson are required' });
  try {
    const { data, error } = await sb
      .from('ticket_templates')
      .insert({ template_name: templateName, template_baseform: templateBaseform, template_json: templateJson })
      .select()
      .single();
    if (error) throw error;
    console.log('[CRUD] 🆕 template created id:', data.id);
    res.status(201).json(data);
  } catch (err) {
    console.error('[CRUD] ❌ create error', err.message);
    res.status(500).json({ error: 'create failed' });
  }
});

// READ(list) ------------------------------------------------------------
app.get('/api/templates', async (_req, res) => {
  const { data, error } = await sb.from('ticket_templates').select('*').order('created_at', { ascending: false });
  if (error) { console.error('[CRUD] list error', error.message); return res.status(500).json({ error: 'list failed' }); }
  console.log('[CRUD] list size:', data.length);
  res.json(data);
});

// READ(single) ----------------------------------------------------------
app.get('/api/templates/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { data, error } = await sb.from('ticket_templates').select('*').eq('id', id).single();
  if (error) { console.error('[CRUD] get error', error.message); return res.status(404).json({ error: 'not found' }); }
  console.log('[CRUD] get id:', id);
  res.json(data);
});

// UPDATE ----------------------------------------------------------------
app.put('/api/templates/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { templateName, templateBaseform, templateJson } = req.body ?? {};
  const updates = {};
  if (templateName)     updates.template_name     = templateName;
  if (templateBaseform) updates.template_baseform = templateBaseform;
  if (templateJson)     updates.template_json     = templateJson;
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'nothing to update' });

  const { data, error } = await sb.from('ticket_templates').update(updates).eq('id', id).select().single();
  if (error) { console.error('[CRUD] update error', error.message); return res.status(500).json({ error: 'update failed' }); }
  console.log('[CRUD] ✅ updated id:', id);
  res.json(data);
});

// DELETE ----------------------------------------------------------------
app.delete('/api/templates/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { error } = await sb.from('ticket_templates').delete().eq('id', id);
  if (error) { console.error('[CRUD] delete error', error.message); return res.status(500).json({ error: 'delete failed' }); }
  console.log('[CRUD] 🗑️ deleted id:', id);
  res.status(204).send();
});

/* ---------------------------------------------------------------------
   Boot
   ------------------------------------------------------------------ */
const PORT = process.env.PORT || 5080;
server.listen(PORT, () => console.log(`\n=== Bridge server up on :${PORT} ===`));
