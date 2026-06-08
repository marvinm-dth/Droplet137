#!/usr/bin/env node
/*  translate-desc-to-zh.js
    -------------------------------------------------------------
    Translates item_desc ➜ item_desc_mandarin **only for blanks**.
    Works in CommonJS, Node ≥ 12, with or without global fetch.   */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

/* ----------------------------------------------------------------
   Portable fetch helper:
   • Node 18 + → global.fetch exists, use it.
   • Older Node → dynamically import node-fetch (ESM) on first call.
------------------------------------------------------------------*/
const fetch = global.fetch
  ? global.fetch
  : async (...args) => {
      const mod = await import('node-fetch');
      return mod.default(...args);
    };

(async () => {
  console.log('🌐 Starting item_desc → Mandarin translator…');

  // ── Supabase connection ─────────────────────────────────────
  const SUPABASE_URL = 'http://137.184.148.164:8000';
  const {
    SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_API_KEY
  } = process.env;

  if (!SUPABASE_ANON_KEY || !OPENAI_API_KEY) {
    console.error('❌ Missing SUPABASE_ANON_KEY or OPENAI_API_KEY');
    process.exit(1);
  }
  const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY
  );

  // ── Step 1: fetch rows still missing a translation ──────────
  console.log('📥 Fetching untranslated items…');
  const { data: items, error: fetchErr } = await supabase
    .from('home_depot_items')
    .select('material_id, item_desc')
    // item_desc_mandarin is NULL  OR  ''  OR  '""'
    .or('item_desc_mandarin.is.null,item_desc_mandarin.eq.,item_desc_mandarin.eq."""')
    // and item_desc itself is non-empty
    .not('item_desc', 'is', null)
    .not('item_desc', 'eq', '');

  if (fetchErr) {
    console.error('❌ Supabase fetch error:', fetchErr.message);
    process.exit(1);
  }
  if (!items || items.length === 0) {
    console.log('✅ Everything already translated. Exiting.');
    process.exit(0);
  }
  console.log(`🔍 Found ${items.length} item(s) to translate.`);

  // ── Step 2: translate & update ─────────────────────────────
  let done = 0;
  for (const { material_id, item_desc } of items) {
    done++;
    console.log(`\n[${done}/${items.length}] material_id=${material_id}`);

    try {
      const aiResp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content:
                'You are a professional translator. Translate the given ' +
                'English product description into simplified Chinese. ' +
                'Return ONLY the Chinese.'
            },
            { role: 'user', content: `Product description: "${item_desc}"` }
          ]
        })
      });

      if (!aiResp.ok) {
        const txt = await aiResp.text();
        throw new Error(`OpenAI error ${aiResp.status}: ${txt}`);
      }

      let zh = (await aiResp.json()).choices[0].message.content.trim();
      zh = zh.replace(/```/g, '').trim(); // strip ``` fences if any
      console.log(`✅ Translation: ${zh}`);

      const { error: updErr } = await supabase
        .from('home_depot_items')
        .update({ item_desc_mandarin: zh })
        .eq('material_id', material_id);

      if (updErr) console.error('❌ Update failed:', updErr.message);
      else        console.log('✅ Row updated.');
    } catch (err) {
      console.error('❌ Processing error:', err.message);
    }
  }

  console.log(`\n🏁 Done. Translated ${done}/${items.length} item(s).`);
  process.exit(0);
})();
