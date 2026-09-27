import { SYSTEM_PROMPT } from './system-prompt.js';

/* Ursprung som far anropa workern. Allt annat far 403 och inget svar.
   localhost star INTE har: listan ar produktionens. For lokal testning satts
   ett extra ursprung som variabel bara nar workern kors med wrangler dev:
     npx wrangler dev --var DEV_ORIGIN:http://localhost:8000
   Variabeln finns varken i wrangler.toml eller i Cloudflare, sa den skarpa
   workern kan aldrig fa den. */
const ALLOWED_ORIGINS = [
  'https://bohagsbolaget.se',
  'https://www.bohagsbolaget.se',
];

function tillatetUrsprung(origin, env) {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return Boolean(env && env.DEV_ORIGIN && origin === env.DEV_ORIGIN);
}

/* ---------- hastighetsbegransning ----------
   Ursprungsspärren ovan stoppar bara webblasare: vilket program som helst kan
   satta rubriken Origin fritt, och varje anrop kan bli upp till fyra
   modellanrop pa agarens rakning. Darfor en grans per besokare och timme.
   INTEGRITET: IP-adressen lagras aldrig. Nyckeln ar en HMAC-SHA-256 av
   adressen och den aktuella timmen, med hemligheten RATE_SALT som nyckel.
   Hemligheten finns bara i Cloudflare, inte i KV, sa ur lagret gar det inte
   att rakna fram en adress. Timmen ingar i hashen, sa samma besokare far en
   ny, olankad nyckel varje timme. Varje nyckel forfaller efter 3 600 s.
   FAIL-OPEN: gar KV inte att na, eller kastar den, far besokaren sitt svar.
   En trasig raknare far aldrig hindra en kund fran att fa hjalp. */
const GRANS_PER_TIMME = 20;
const TIMME_MS = 60 * 60 * 1000;
const GRANS_TEXT =
  'Du har ställt många frågor på kort tid. Vänta en stund, eller ring 070-561 48 45 så svarar vi direkt.';

/* Andra lagret: en raknare i minnet i samma isolat. KV ar eventuellt
   konsistent och tillater en skrivning per nyckel och sekund, sa en snabb
   serie anrop kan hinna forbi innan KV visar ratt tal. Minnet ser dem direkt.
   Det ar en extra spärr, inte huvudlosningen: ett nytt isolat borjar pa noll. */
const minne = new Map();
const MINNE_MAX = 5000;

async function besokarNyckel(ip, timme, salt) {
  const kod = new TextEncoder();
  const nyckel = await crypto.subtle.importKey(
    'raw', kod.encode(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', nyckel, kod.encode(ip + '|' + timme));
  return 'rl:' + [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* Returnerar true om anropet ska stoppas. Kastar aldrig. */
async function overGransen(request, env) {
  try {
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const salt = env && env.RATE_SALT;
    if (!ip || !salt) return false;
    const timme = Math.floor(Date.now() / TIMME_MS);
    const nyckel = await besokarNyckel(ip, timme, salt);

    const iMinnet = minne.get(nyckel) || 0;
    if (iMinnet >= GRANS_PER_TIMME) return true;
    if (minne.size >= MINNE_MAX) minne.clear();
    minne.set(nyckel, iMinnet + 1);

    let iKv = 0;
    try {
      if (env.RATE_KV) {
        iKv = parseInt(await env.RATE_KV.get(nyckel), 10) || 0;
        if (iKv >= GRANS_PER_TIMME) return true;
        /* Bara ett tal lagras - antalet anrop den har timmen. */
        await env.RATE_KV.put(nyckel, String(Math.max(iKv, iMinnet) + 1),
          { expirationTtl: 3600 });
      }
    } catch (fel) {
      console.error('RATE kv-fel, slapper igenom');
    }
    return false;
  } catch (fel) {
    console.error('RATE raknaren kastade, slapper igenom');
    return false;
  }
}

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
    /* Systemprompten ar 17 807 tecken och identisk i varje anrop. Som blockform
       med cache_control cachas den i stallet for att skickas om: brytpunkten
       tacker allt fore sig, alltsa bade tools och system. Cachen lever fem
       minuter och forlangs vid varje traff, sa en pagaende konversation betalar
       full input-kostnad en gang. Verktygsloopen kan ge tre anrop per
       besokarfraga - da traffar tva av tre cachen.
       claude-haiku-4-5 kraver minst 2048 tokens for att cachen ska aktiveras;
       prompten ligger pa runt 5 000 och klarar granskan med marginal. */
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
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
    /* Bara status och feltyp. Felkroppens fritext kan i princip citera
       indata, sa den loggas inte. */
    let typ = '';
    try { typ = String(((await svar.json()).error || {}).type || '').slice(0, 60); } catch (e) {}
    throw new Error('Anthropic svarade ' + svar.status + (typ ? ' ' + typ : ''));
  }

  const data = await svar.json();

  /* Cacheutfallet syns ingen annanstans: till klienten gar bara faltet reply,
     sa API-svarets usage-uppgifter forsvinner. Raden nedan loggar ENBART
     siffror - fyra raknare som passerar Number() - och kan darfor aldrig
     innehalla besokarens meddelande, assistentens svar eller nagot annat
     textfalt. Saknas ett falt blir det 0, och hela raden ligger i try/catch
     sa att ett fel i loggningen aldrig kan hindra besokaren fran att fa svar. */
  try {
    const bruk = (data && data.usage) || {};
    console.log(
      'CACHE' +
        ' input_tokens=' + Number(bruk.input_tokens || 0) +
        ' output_tokens=' + Number(bruk.output_tokens || 0) +
        ' cache_creation_input_tokens=' + Number(bruk.cache_creation_input_tokens || 0) +
        ' cache_read_input_tokens=' + Number(bruk.cache_read_input_tokens || 0)
    );
  } catch (fel) {
    console.log('CACHE usage kunde inte lasas');
  }

  return data;
}

/* Workern skickar inte langre sjalv. Cloudflare Workers gar ut fran delade
   IP-adresser och Web3Forms begransar per IP, sa varje sandning harifran gav
   429. Forfragan returneras i stallet till widgeten, som postar den fran
   besokarens egen webblasare - samma vag som sajtens vanliga formular.
   Loggen far bara veta ATT en forfragan kom: ett slumpat arende-id, antal
   ifyllda falt och deras namn. Aldrig ett varde. Faltnamnen tas ur
   verktygets schema, inte ur modellens indata, sa inte ens en pahittad
   nyckel kan bara text in i loggen. */
const FALTNAMN = Object.keys(TOOL.input_schema.properties);

function arendeId() {
  return crypto.randomUUID();
}

function loggaForfragan(input) {
  try {
    const ifyllda = FALTNAMN.filter((f) =>
      input && typeof input[f] === 'string' && input[f].trim() !== '');
    console.log('OFFERTFORFRAGAN arende=' + arendeId() +
      ' falt=' + ifyllda.length + ' ifyllda=' + ifyllda.join(','));
  } catch (fel) {
    console.log('OFFERTFORFRAGAN kunde inte sammanfattas');
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
    const tillaten = tillatetUrsprung(origin, env);

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

    /* Samma JSON-form som ett vanligt svar - faltet reply - sa att widgeten
       kan visa texten utan att formen andras. */
    if (await overGransen(request, env)) {
      return json({ reply: GRANS_TEXT }, 429, origin);
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
        console.error('Modellen pastod att den skickat utan verktygsanrop. arende=' +
          arendeId() + ' meddelanden=' + messages.length);
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
          ? 'Tack, då har jag uppgifterna. Fredrik lämnar ett fast pris när han sett dem.'
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
