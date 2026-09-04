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

/* Formuleringar som pastar att nagot skickats. Tacker modellens vanligaste
   satt att saga det utan att ha anropat verktyget. */
const PASTAR_SKICKAT = /(skickar|skickat|skickad|skickats|vidarebefordra|hör av sig|hor av sig)/i;

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

async function anropaAnthropic(messages, apiKey, toolChoice) {
  const kropp = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    tools: [TOOL],
    messages,
  };
  if (toolChoice) kropp.tool_choice = toolChoice;

  const svar = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(kropp),
  });

  if (!svar.ok) {
    /* Status och body loggas server-side via console.error, men gar aldrig
       vidare till klienten. */
    const text = await svar.text();
    throw new Error('Anthropic svarade ' + svar.status + ': ' + String(text).slice(0, 300));
  }

  return svar.json();
}

/* Workern skickar inte langre sjalv. Cloudflare Workers gar ut fran delade
   IP-adresser och Web3Forms begransar per IP, sa varje sandning harifran gav
   429. Forfragan returneras i stallet till widgeten, som postar den fran
   besokarens egen webblasare - samma vag som sajtens vanliga formular.
   Loggningen ligger kvar som skyddsnat: gar klientens sandning fel finns
   uppgifterna anda kvar i wrangler tail. */
function loggaForfragan(input) {
  try {
    console.error('OFFERTFORFRAGAN fran chatten:', JSON.stringify(input));
  } catch (fel) {
    console.error('OFFERTFORFRAGAN kunde inte serialiseras');
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

    let forfragan = null;

    try {
      const apiKey = env.ANTHROPIC_API_KEY;
      /* Bara langden, aldrig nyckeln eller nagon del av den. Syns enbart i
         serverloggen via wrangler tail - aldrig i svaret till klienten.
         En orimlig langd avslojar en trasig inklistring direkt. */
      console.log('ANTHROPIC_API_KEY längd:', apiKey ? String(apiKey).length : 0);
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

        forfragan = verktyg.input || {};
        loggaForfragan(forfragan);

        messages = messages.concat([
          { role: 'assistant', content: data.content },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: verktyg.id,
                content: 'Förfrågan mottagen och vidarebefordrad',
              },
            ],
          },
        ]);

        data = await anropaAnthropic(messages, apiKey);
      }

      /* Sparr mot modellen som pastar att den skickat utan att ha anropat
         verktyget. Da gors om anropet en gang med tvingat verktygsval, sa att
         leadet atminstone far struktur. Leadet i sig ar redan sakrat av
         widgetens egen detektering - detta ar ett komplement, inte skyddet. */
      if (!forfragan && PASTAR_SKICKAT.test(textUr(data))) {
        console.error('Modellen pastod att den skickat utan verktygsanrop. Hela konversationen:',
          JSON.stringify(messages));
        try {
          const tvingat = await anropaAnthropic(messages, apiKey,
            { type: 'tool', name: TOOL.name });
          const block = (tvingat.content || []).find(
            (b) => b && b.type === 'tool_use' && b.name === TOOL.name
          );
          if (block) {
            forfragan = block.input || {};
            loggaForfragan(forfragan);
          }
        } catch (fel) {
          console.error('Tvingat verktygsanrop misslyckades:', fel && fel.message ? fel.message : fel);
        }
      }

      /* Modellen svarar ibland med enbart ett verktygsblock och ingen text.
         Kunden ska aldrig mota en tom bubbla, sist i flodet allra minst. */
      let text = textUr(data);
      if (!text) {
        text = forfragan
          ? 'Tack! Jag skickar uppgifterna vidare till Fredrik nu. Han hör av sig med ett fast pris.'
          : 'Kan du formulera om frågan? Jag hängde inte riktigt med.';
      }

      /* forfragan foljer med bara nar verktyget anropats. Widgeten postar den
         vidare och ager beskedet om huruvida den kom fram. */
      const svar = { reply: text };
      if (forfragan) svar.forfragan = forfragan;

      return json(svar, 200, origin);

    } catch (fel) {
      console.error('Fel i assistenten:', fel && fel.message ? fel.message : fel);
      return json({ reply: FELSVAR }, 500, origin);
    }
  },
};
