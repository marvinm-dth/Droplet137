/* translator-service  –  NO AUTH  ------------------------------------ */
import 'dotenv/config';
import express            from 'express';
import cors               from 'cors';
import fetch              from 'node-fetch';
import { createClient }   from '@supabase/supabase-js';

/* ── env ------------------------------------------------------------- */
const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,      // use service-role if RLS blocks ai_translations
  OPENAI_API_KEY,
  PORT = 5031
} = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !OPENAI_API_KEY) {
  console.error('❌  Missing env vars.  Check .env');  process.exit(1);
}

/* ── setup ----------------------------------------------------------- */
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const app      = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

/* ── POST  /translate ----------------------------------------------- */
app.post('/translate', async (req, res) => {
  try {
    const { target, conversation_id = null, messages = [] } = req.body;

    if (!target)                      return res.status(400).json({ error: 'target missing' });
    if (!Array.isArray(messages) ||
        messages.length === 0)        return res.status(400).json({ error: 'messages must be an array' });

    /* 1 ▸ cache hit?  ------------------------------------------------ */
    const { data: cached } = await supabase
      .from('ai_translations')
      .select('original_text, translated_text')
      .in('original_text', messages.map(m => m.text))
      .eq('target_lang', target);

    const cache = new Map((cached || []).map(r => [r.original_text, r.translated_text]));

    /* 2 ▸ still to translate? --------------------------------------- */
    const todo = messages.filter(m => !cache.has(m.text));

    if (todo.length) {
      const convo     = todo.map(m => m.text).join('\n');
      const sysPrompt = `
You are a translation engine.  Translate the conversation below into ${target}.
Return ONLY valid JSON:
{
  "translations":[ { "index":0, "translated":"..." } ]
}`.trim();

      const aiResp = await fetch('https://api.openai.com/v1/chat/completions', {
        method  : 'POST',
        headers : {
          'Content-Type': 'application/json',
          Authorization : `Bearer ${OPENAI_API_KEY}`
        },
        body    : JSON.stringify({
          model       : 'gpt-4o-mini',
          temperature : 0.3,
          messages    : [
            { role: 'system', content: sysPrompt },
            { role: 'user',   content: convo     }
          ]
        })
      });

      if (!aiResp.ok) {
        const txt = await aiResp.text();
        throw new Error(`OpenAI ${aiResp.status}: ${txt}`);
      }

      let txt = (await aiResp.json()).choices[0].message.content.trim();
      if (txt.startsWith('```'))
        txt = txt.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

      const parsed  = JSON.parse(txt);
      const newRows = parsed.translations.map(t => ({
        conversation_id,
        original_text   : todo[t.index].text,
        target_lang     : target,
        translated_text : t.translated
      }));

      /* 3 ▸ store for next time ------------------------------------ */
      if (newRows.length) {
        await supabase.from('ai_translations').insert(newRows);
        newRows.forEach(r => cache.set(r.original_text, r.translated_text));
      }
    }

    /* 4 ▸ respond --------------------------------------------------- */
    const out = messages.map(m => ({
      id        : m.id,
      original  : m.text,
      translated: cache.get(m.text) || null
    }));

    res.json({ translations: out });

  } catch (err) {
    console.error('[ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

/* root banner */
app.get('/', (_, res) => res.send('Translator service (no auth) – POST /translate'));

app.listen(PORT, () =>
  console.log(`🗣️  Translator up on :${PORT} – no auth`));
