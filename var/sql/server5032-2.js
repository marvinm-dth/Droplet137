#!/usr/bin/env node

/**
 * shortname-script.js
 * -------------------
 * Standalone Node.js script to fetch items without a short_name,
 * generate concise short names via OpenAI, and update the Supabase table.
 * Verbose logging included for each step.
 * Supabase URL is hardcoded.
 */

import 'dotenv/config';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

(async () => {
  console.log('🔄 Starting short-name generation script...');

  // ── Hardcoded Supabase URL ────────────────────────────────────────
  const SUPABASE_URL = 'http://137.184.148.164:8000';

  // ── Load environment variables ─────────────────────────────────────
  const {
    SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_API_KEY,
    MAX_SHORT_NAME_LENGTH = '25'
  } = process.env;

  if (!SUPABASE_ANON_KEY || !OPENAI_API_KEY) {
    console.error('❌ Missing one or more required environment variables:');
    console.error('   SUPABASE_ANON_KEY, OPENAI_API_KEY');
    process.exit(1);
  }

  const supabaseKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  const supabase = createClient(SUPABASE_URL, supabaseKey);

  // ── Fetch items needing a short_name ──────────────────────────────
  console.log('📥 Retrieving items without a short_name...');
  const { data: items, error: fetchError } = await supabase
    .from('home_depot_items')
    .select('material_id, item_desc')
    .or('short_name.is.null,short_name.eq.()');

  if (fetchError) {
    console.error('❌ Error fetching items:', fetchError.message);
    process.exit(1);
  }

  if (!items || items.length === 0) {
    console.log('✅ No items found without a short_name. Exiting.');
    process.exit(0);
  }

  console.log(`🔍 Found ${items.length} items to process.`);

  let processed = 0;
  const maxLen = parseInt(MAX_SHORT_NAME_LENGTH, 10);

  for (const item of items) {
    processed++;
    console.log(`
[${processed}/${items.length}] Processing material_id=${item.material_id}`);

    if (!item.item_desc) {
      console.log('⚠️  Skipping: No item_desc provided.');
      continue;
    }

    console.log(`📝 item_desc: "${item.item_desc}"`);

    const systemPrompt =
      
      ` Give me a shortened title for the following item. It should be 40 characters or less. Please give enough detail if possible that I can know what it is enough to order it or pick it out of a lineup of other products. Return ONLY the short name.`;

    const userPrompt = `Item description: "${item.item_desc}"`;

    try {
      console.log('🤖 Sending request to OpenAI...');
      const aiResp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.3,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        })
      });

      if (!aiResp.ok) {
        const txt = await aiResp.text();
        throw new Error(`OpenAI Error ${aiResp.status}: ${txt}`);
      }

      let shortName = (await aiResp.json()).choices[0].message.content.trim();
      if (shortName.startsWith('```')) {
        shortName = shortName.replace(/```/g, '').trim();
      }

      console.log(`✅ Generated short_name: "${shortName}"`);

      console.log('💾 Updating Supabase record...');
      const { error: updateError } = await supabase
        .from('home_depot_items')
        .update({ short_name: shortName })
        .eq('material_id', item.material_id);

      if (updateError) {
        console.error('❌ Update failed:', updateError.message);
      } else {
        console.log('✅ Record updated successfully.');
      }
    } catch (err) {
      console.error('❌ Error during processing:', err.message);
    }
  }

  console.log(`
🏁 Script completed. Processed ${processed} items.`);
  process.exit(0);
})();
