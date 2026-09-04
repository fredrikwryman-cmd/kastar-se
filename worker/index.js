import { SYSTEM_PROMPT } from './system-prompt.js';

/* Ursprung som far anropa workern. Allt annat far 403 och inget svar. */
const ALLOWED_ORIGINS = [
  'https://bohagsbolaget.se',
  'https://www.bohagsbolaget.se',
  'http://localhost:8000',
];

/* Snabbaste och billigaste modellen, verifierad mot platform.claude.com. */
const MODEL = 'claude-haiku-4-5';

const MAX_HISTORY = 20;
const MAX_CHARS = 2000;
const MAX_TOKENS = 1024;

/* Web3Forms tar emot offertforfragningar. Nyckeln ar publik i formularet pa
   sajten och ar inte en hemlighet - den identifierar bara mottagaren. */
const WEB3FORMS_KEY = 'a5ea7bbf-870d-4db3-9a82-d8e5283fa26e';

const TOOL = {
  name: 'skicka_forfragan',
  description:
    'Skickar en färdig offertförfrågan till Bohagsbolaget. Anropas när du har kundens namn, en kontaktuppgift och tillräcklig beskrivning av uppdraget.',
  input_schema: {
    type: 'object',
    properties: {
      namn: { type: 'string', description: 'Kundens namn.' },
      telefon: { type: 'string', description: 'Kundens telefonnummer.' },
      epost: { type: 'string', description: 'Kundens e-postadress.' },
      tjanst: {
        type: 'string',
        description: 'Tömning, flytt, bortforsling, demontering eller magasinering.',
      },
      ort: { type: 'string', description: 'Ort eller adress för uppdraget.' },
      beskrivning: {
        type: 'string',
        description:
          'En sammanfattning av hela uppdraget inklusive storlek, våningsplan, hiss, framkomlighet och önskad tid.',
      },
      kundtyp: {
        type: 'string',
        enum: ['privat', 'foretag'],
        description: 'Om kunden är privatperson eller företag.',
      },
    },
    required: ['namn', 'tjanst', 'beskrivning'],
  },
};

const FELSVAR =
  'Något gick fel på vår sida. Mejla boka@bohagsbolaget.se eller ring 070-561 48 45 så hjälper vi dig.';

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
  });
}

/* Kastar vid ogiltig indata. Meddelandet gar till klienten som 400. */
function validera(body) {
  const messages = body && body.messages;
  if (!Array.isArray(messages)) {
    throw new Error('messages måste vara en array');
  }
  if (messages.length === 0) {
    throw new Error('messages är tom');
  }
  if (messages.length > MAX_HISTORY) {
    throw new Error('För lång historik');
  }
  for (const m of messages) {
    if (!m || typeof m !== 'object') {
      throw new Error('Ogiltigt meddelande');
    }
    if (m.role !== 'user' && m.role !== 'assistant') {
      throw new Error('Ogiltig roll');
    }
    if (typeof m.content !== 'string') {
      throw new Error('content måste vara text');
    }
    if (m.content.length > MAX_CHARS) {
      throw new Error('För långt meddelande');
    }
  }
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

async function anropaAnthropic(messages, apiKey) {
  const svar = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: [TOOL],
      messages,
    }),
  });

  if (!svar.ok) {
    /* Statuskoden loggas, men gar aldrig vidare till klienten. */
    const text = await svar.text();
    throw new Error('Anthropic svarade ' + svar.status + ': ' + text.slice(0, 300));
  }

  return svar.json();
}

async function skickaForfragan(input) {
  const svar = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      access_key: WEB3FORMS_KEY,
      subject: 'Offertförfrågan från chatten på bohagsbolaget.se',
      ...input,
    }),
  });

  if (!svar.ok) {
    throw new Error('Web3Forms svarade ' + svar.status);
  }
}

/* Plockar ut all text ur svarets content-block. */
function textUr(data) {
  const block = (data && data.content) || [];
  return block
    .filter((b) => b && b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const tillaten = ALLOWED_ORIGINS.includes(origin);

    /* Ursprunget avgors fore allt annat. Utan tillatet ursprung lamnar
       workern varken data eller CORS-headers ifran sig. */
    if (!tillaten) {
      return new Response(JSON.stringify({ fel: 'Otillåtet ursprung' }), {
        status: 403,
        headers: { 'content-type': 'application/json', 'Vary': 'Origin' },
      });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
      return json({ fel: 'Endast POST' }, 405, origin);
    }

    let messages;
    try {
      const body = await request.json();
      messages = validera(body);
    } catch (fel) {
      return json({ fel: fel.message || 'Ogiltig förfrågan' }, 400, origin);
    }

    try {
      const apiKey = env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY saknas i miljön');
      }

      let data = await anropaAnthropic(messages, apiKey);

      /* Verktygsloop. Tva varv racker: ett for att skicka forfragan och ett
         for att formulera bekraftelsen. Fler varv vore bara ett satt att
         branna tokens om modellen fastnar. */
      for (let varv = 0; varv < 2 && data.stop_reason === 'tool_use'; varv++) {
        const verktyg = (data.content || []).find(
          (b) => b && b.type === 'tool_use' && b.name === TOOL.name
        );
        if (!verktyg) {
          break;
        }

        await skickaForfragan(verktyg.input || {});

        messages = messages.concat([
          { role: 'assistant', content: data.content },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: verktyg.id,
                content: 'Förfrågan skickad',
              },
            ],
          },
        ]);

        data = await anropaAnthropic(messages, apiKey);
      }

      return json({ reply: textUr(data) }, 200, origin);

    } catch (fel) {
      console.error('Fel i assistenten:', fel && fel.message ? fel.message : fel);
      return json({ reply: FELSVAR }, 500, origin);
    }
  },
};
