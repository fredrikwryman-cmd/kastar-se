/* ---------- kundbilder: PUT, DELETE och GET under /bild/ ----------
   Kunden laddar upp bilder fran offertformularet direkt till R2-hinken
   BILDER. Objektnyckeln ar <referens>/<plats>, dar plats ar 1-10, sa en
   referens kan per konstruktion aldrig ha fler an tio bilder.

   BILD-ID: kundens webblasare skapar ett slumpat id (32 hextecken) per bild
   och skickar det i rubriken X-Bild-Id. Workern sparar bara SHA-256 av id:t
   (customMetadata.idh), aldrig id:t sjalvt. Den som vet id:t kan skriva om
   (idempotent aterforsok) eller radera sin bild. Ingen annan kan det.

   SIGNERADE LANKAR: GET kraver exp och sig i fragestrangen.
     sig = hex(HMAC-SHA-256(BILD_SIGN, sokvag + '\n' + exp + '\n' + idh))
   dar sokvag = '/bild/<referens>/<plats>' (exakt, utan fragestrang och utan
   ursprung), exp = unixtid i sekunder som decimal text utan inledande nollor,
   och idh = SHA-256 av bild-id:t som 64 gemena hextecken. Eftersom idh ingar
   blir en gammal lank ogiltig nar platsen fatt en ny bild med ett annat id.
   BILD_SIGN ar en hemlighet i Cloudflare. Lokalt satts en egen testhemlighet
   med --var BILD_SIGN:<test>, aldrig produktionens.

   URSPRUNG: PUT, DELETE och OPTIONS kraver tillatet ursprung, precis som
   chatten. GET och HEAD gor det inte - img-taggar och lankar fran mejl
   skickar ingen Origin - utan skyddas av signaturen. CORS-rubriken satts pa
   GET bara nar ursprunget ar tillatet.

   LOGGAR: bara metod, referens, plats, storlek, format och status. Aldrig
   bild-id, IP eller bildinnehall. */

const REF_MONSTER = /^BB-\d{4}-[A-Z2-9]{4}$/;
const PLATS_MONSTER = /^(?:[1-9]|10)$/;
const ID_MONSTER = /^[0-9a-fA-F]{32}$/;
const SIG_MONSTER = /^[0-9a-fA-F]{64}$/;
const EXP_MONSTER = /^[1-9]\d{0,11}$/;

const MAX_BYTES = 15 * 1024 * 1024;
const GILTIG_SEKUNDER = 60 * 24 * 60 * 60;

const TILLATNA_TYPER = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const HEIF_MARKEN = ['heic', 'heix', 'mif1', 'msf1', 'hevc'];

/* Hastighetsbegransning for uppladdningar: 40 lyckade per besokare och timme.
   Samma princip som chattens (HMAC med RATE_SALT, adressen lagras aldrig,
   fail-open), men egen nyckelprefix, egen HMAC-indata och egen minnes-Map,
   sa chattens raknare paverkas aldrig. Kontrollen sker fore lagring och
   uppraknningen forst efter lyckad lagring. */
const BILD_GRANS_PER_TIMME = 40;
const TIMME_MS = 60 * 60 * 1000;
const bildMinne = new Map();
const MINNE_MAX = 5000;

const kod = new TextEncoder();

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function franHex(s) {
  const ut = new Uint8Array(s.length / 2);
  for (let i = 0; i < ut.length; i++) ut[i] = parseInt(s.substr(i * 2, 2), 16);
  return ut;
}

async function sha256Hex(text) {
  return hex(await crypto.subtle.digest('SHA-256', kod.encode(text)));
}

async function hmacNyckel(hemlighet, anv) {
  return crypto.subtle.importKey(
    'raw', kod.encode(hemlighet), { name: 'HMAC', hash: 'SHA-256' }, false, anv);
}

function signaturText(sokvag, exp, idh) {
  return sokvag + '\n' + exp + '\n' + idh;
}

async function signera(hemlighet, sokvag, exp, idh) {
  const nyckel = await hmacNyckel(hemlighet, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', nyckel, kod.encode(signaturText(sokvag, exp, idh))));
}

/* crypto.subtle.verify jamfor i konstant tid. */
async function signaturGiltig(hemlighet, sokvag, exp, idh, sigHex) {
  const nyckel = await hmacNyckel(hemlighet, ['verify']);
  return crypto.subtle.verify('HMAC', nyckel, franHex(sigHex),
    kod.encode(signaturText(sokvag, exp, idh)));
}

/* Lika langa strangar jamfors utan tidig retur. */
function likaKonstantTid(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let skillnad = 0;
  for (let i = 0; i < a.length; i++) skillnad |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return skillnad === 0;
}

function bildCors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'PUT, DELETE, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Bild-Id',
    'Access-Control-Max-Age': '600',
  };
}

const SKYDD = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex',
  'X-Content-Type-Options': 'nosniff',
  'Vary': 'Origin',
};

function svar(data, status, origin, tillaten) {
  const headers = { 'content-type': 'application/json', ...SKYDD };
  if (tillaten) Object.assign(headers, bildCors(origin));
  return new Response(data === null ? null : JSON.stringify(data), { status, headers });
}

function logga(metod, ref, plats, storlek, format, status) {
  console.log('BILD ' + metod +
    ' ref=' + (REF_MONSTER.test(ref || '') ? ref : '-') +
    ' slot=' + (PLATS_MONSTER.test(plats || '') ? plats : '-') +
    ' storlek=' + (Number(storlek) || 0) +
    ' format=' + (format || '-') +
    ' status=' + status);
}

function ascii(b, fran, till) {
  return String.fromCharCode(...b.subarray(fran, till));
}

/* Avgor det verkliga formatet ur filhuvudet. Returnerar 'jpeg', 'png',
   'webp', 'heif' eller null. */
function verkligtFormat(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'webp';
  if (b.length >= 12 && ascii(b, 4, 8) === 'ftyp') {
    if (HEIF_MARKEN.includes(ascii(b, 8, 12))) return 'heif';
    /* Kompatibla marken: fran byte 16 till slutet av ftyp-boxen. */
    const boxStorlek = ((b[0] << 24) >>> 0) + (b[1] << 16) + (b[2] << 8) + b[3];
    const slut = Math.min(boxStorlek, b.length, 4096);
    for (let i = 16; i + 4 <= slut; i += 4) {
      if (HEIF_MARKEN.includes(ascii(b, i, i + 4))) return 'heif';
    }
  }
  return null;
}

function stammer(deklarerad, verklig) {
  if (verklig === 'heif') return deklarerad === 'image/heic' || deklarerad === 'image/heif';
  return verklig !== null && deklarerad === 'image/' + verklig;
}

async function bildNyckelRL(ip, timme, salt) {
  const nyckel = await hmacNyckel(salt, ['sign']);
  return 'rlb:' + hex(await crypto.subtle.sign('HMAC', nyckel, kod.encode('bild|' + ip + '|' + timme)));
}

/* Returnerar nyckeln om besokaren far ladda upp, false om gransen ar nadd,
   null om raknaren inte kan anvandas (fail-open). Kastar aldrig. */
async function bildGrans(request, env) {
  try {
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const salt = env && env.RATE_SALT;
    if (!ip || !salt) return null;
    const nyckel = await bildNyckelRL(ip, Math.floor(Date.now() / TIMME_MS), salt);
    if ((bildMinne.get(nyckel) || 0) >= BILD_GRANS_PER_TIMME) return false;
    try {
      if (env.RATE_KV) {
        const iKv = parseInt(await env.RATE_KV.get(nyckel), 10) || 0;
        if (iKv >= BILD_GRANS_PER_TIMME) return false;
      }
    } catch (fel) {
      console.error('RATE bild kv-fel, slapper igenom');
    }
    return nyckel;
  } catch (fel) {
    console.error('RATE bild raknaren kastade, slapper igenom');
    return null;
  }
}

async function raknaUpp(nyckel, env) {
  if (!nyckel) return;
  try {
    const iMinnet = (bildMinne.get(nyckel) || 0) + 1;
    if (bildMinne.size >= MINNE_MAX) bildMinne.clear();
    bildMinne.set(nyckel, iMinnet);
    if (env.RATE_KV) {
      const iKv = parseInt(await env.RATE_KV.get(nyckel), 10) || 0;
      /* Bara ett tal lagras - antalet lyckade uppladdningar den har timmen. */
      await env.RATE_KV.put(nyckel, String(Math.max(iKv + 1, iMinnet)), { expirationTtl: 3600 });
    }
  } catch (fel) {
    console.error('RATE bild uppräkning misslyckades');
  }
}

/* Lagrar med villkorlig put. Tom plats: etagDoesNotMatch '*' (null om nagon
   hann fore). Upptagen med samma idh: etagMatches pa den lasta etaggen
   (null om objektet bytts under tiden). Vid null lases platsen om och
   avgors pa nytt. Returnerar 'ok' eller 'upptagen'. */
async function lagra(env, nyckel, data, typ, idh) {
  const meta = { httpMetadata: { contentType: typ }, customMetadata: { idh } };
  for (let forsok = 0; forsok < 4; forsok++) {
    const befintlig = await env.BILDER.head(nyckel);
    let res;
    if (!befintlig) {
      res = await env.BILDER.put(nyckel, data, { ...meta, onlyIf: { etagDoesNotMatch: '*' } });
    } else if (likaKonstantTid((befintlig.customMetadata || {}).idh, idh)) {
      res = await env.BILDER.put(nyckel, data, { ...meta, onlyIf: { etagMatches: befintlig.etag } });
    } else {
      return 'upptagen';
    }
    if (res) return 'ok';
  }
  return 'upptagen';
}

async function put(request, env, ctx) {
  const { origin, tillaten, ref, plats, nyckel, sokvag } = ctx;
  const id = request.headers.get('X-Bild-Id') || '';
  if (!ID_MONSTER.test(id)) {
    logga('PUT', ref, plats, 0, '', 400);
    return svar({ fel: 'Ogiltigt bild-id' }, 400, origin, tillaten);
  }
  if (!env.BILD_SIGN || !env.BILDER) {
    console.error('BILD konfig saknas');
    return svar({ fel: 'Något gick fel' }, 500, origin, tillaten);
  }
  const typ = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (!TILLATNA_TYPER.includes(typ)) {
    logga('PUT', ref, plats, 0, '', 415);
    return svar({ fel: 'Bildformatet stöds inte' }, 415, origin, tillaten);
  }
  const angiven = request.headers.get('Content-Length');
  if (angiven !== null && Number(angiven) > MAX_BYTES) {
    logga('PUT', ref, plats, Number(angiven), typ.slice(6), 413);
    return svar({ fel: 'Bilden är för stor' }, 413, origin, tillaten);
  }

  const rl = await bildGrans(request, env);
  if (rl === false) {
    logga('PUT', ref, plats, 0, typ.slice(6), 429);
    return svar({ fel: 'För många uppladdningar. Vänta en stund.' }, 429, origin, tillaten);
  }

  const data = await request.arrayBuffer();
  if (data.byteLength === 0) {
    logga('PUT', ref, plats, 0, typ.slice(6), 400);
    return svar({ fel: 'Tom bild' }, 400, origin, tillaten);
  }
  if (data.byteLength > MAX_BYTES) {
    logga('PUT', ref, plats, data.byteLength, typ.slice(6), 413);
    return svar({ fel: 'Bilden är för stor' }, 413, origin, tillaten);
  }
  const verklig = verkligtFormat(new Uint8Array(data, 0, Math.min(data.byteLength, 4096)));
  if (!stammer(typ, verklig)) {
    logga('PUT', ref, plats, data.byteLength, verklig || 'okant', 415);
    return svar({ fel: 'Filen är inte en bild i angivet format' }, 415, origin, tillaten);
  }
  /* heic/heif: den deklarerade typen sparas, ovriga far det verkliga formatet. */
  const sparadTyp = verklig === 'heif' ? typ : 'image/' + verklig;

  const idh = await sha256Hex(id.toLowerCase());
  const utfall = await lagra(env, nyckel, data, sparadTyp, idh);
  if (utfall !== 'ok') {
    logga('PUT', ref, plats, data.byteLength, sparadTyp.slice(6), 409);
    return svar({ fel: 'Platsen är upptagen' }, 409, origin, tillaten);
  }
  await raknaUpp(rl, env);

  const exp = Math.floor(Date.now() / 1000) + GILTIG_SEKUNDER;
  const sig = await signera(env.BILD_SIGN, sokvag, String(exp), idh);
  const url = new URL(request.url).origin + sokvag + '?exp=' + exp + '&sig=' + sig;
  logga('PUT', ref, plats, data.byteLength, sparadTyp.slice(6), 200);
  return svar({ url }, 200, origin, tillaten);
}

async function radera(request, env, ctx) {
  const { origin, tillaten, ref, plats, nyckel } = ctx;
  const id = request.headers.get('X-Bild-Id') || '';
  if (!ID_MONSTER.test(id)) {
    logga('DELETE', ref, plats, 0, '', 400);
    return svar({ fel: 'Ogiltigt bild-id' }, 400, origin, tillaten);
  }
  if (!env.BILD_SIGN || !env.BILDER) {
    console.error('BILD konfig saknas');
    return svar({ fel: 'Något gick fel' }, 500, origin, tillaten);
  }
  const idh = await sha256Hex(id.toLowerCase());
  const befintlig = await env.BILDER.head(nyckel);
  if (!befintlig) {
    logga('DELETE', ref, plats, 0, '', 204);
    return svar(null, 204, origin, tillaten);
  }
  /* Fel id: 404, sa att svaret inte avslojar att platsen ar upptagen. */
  if (!likaKonstantTid((befintlig.customMetadata || {}).idh, idh)) {
    logga('DELETE', ref, plats, 0, '', 404);
    return svar({ fel: 'Hittades inte' }, 404, origin, tillaten);
  }
  await env.BILDER.delete(nyckel);
  logga('DELETE', ref, plats, befintlig.size, '', 204);
  return svar(null, 204, origin, tillaten);
}

async function hamta(request, env, ctx, url) {
  const { origin, tillaten, ref, plats, nyckel, sokvag } = ctx;
  const metod = request.method;
  const ejFunnen = () => {
    logga(metod, ref, plats, 0, '', 404);
    return svar({ fel: 'Hittades inte' }, 404, origin, tillaten);
  };
  if (!env.BILD_SIGN || !env.BILDER) {
    console.error('BILD konfig saknas');
    return svar({ fel: 'Något gick fel' }, 500, origin, tillaten);
  }
  const exp = url.searchParams.get('exp') || '';
  const sig = (url.searchParams.get('sig') || '').toLowerCase();
  if (!EXP_MONSTER.test(exp) || !SIG_MONSTER.test(sig)) return ejFunnen();
  if (Number(exp) <= Math.floor(Date.now() / 1000)) return ejFunnen();

  const obj = metod === 'HEAD' ? await env.BILDER.head(nyckel) : await env.BILDER.get(nyckel);
  if (!obj) return ejFunnen();
  const idh = (obj.customMetadata || {}).idh || '';
  const giltig = /^[0-9a-f]{64}$/.test(idh) &&
    await signaturGiltig(env.BILD_SIGN, sokvag, exp, idh, sig);
  if (!giltig) {
    if (obj.body) { try { await obj.body.cancel(); } catch (e) {} }
    return ejFunnen();
  }

  const typ = (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream';
  const headers = {
    ...SKYDD,
    'Content-Type': typ,
    'Content-Length': String(obj.size),
    'Content-Disposition': 'inline',
    'Referrer-Policy': 'no-referrer',
  };
  if (tillaten) headers['Access-Control-Allow-Origin'] = origin;
  logga(metod, ref, plats, obj.size, typ.replace('image/', ''), 200);
  return new Response(metod === 'HEAD' ? null : obj.body, { status: 200, headers });
}

export async function hanteraBild(request, env, tillatetUrsprung) {
  const origin = request.headers.get('Origin') || '';
  const tillaten = tillatetUrsprung(origin, env);
  const metod = request.method;
  try {
    const url = new URL(request.url);
    const lasande = metod === 'GET' || metod === 'HEAD';

    /* Allt utom lasning kraver tillatet ursprung, precis som chatten. */
    if (!lasande && !tillaten) {
      logga(metod === 'PUT' || metod === 'DELETE' || metod === 'OPTIONS' ? metod : 'ANNAN',
        '', '', 0, '', 403);
      return new Response(JSON.stringify({ fel: 'Otillåtet ursprung' }), {
        status: 403,
        headers: { 'content-type': 'application/json', 'Vary': 'Origin' },
      });
    }

    const delar = url.pathname.match(/^\/bild\/([^/]+)\/([^/]+)$/);
    if (!delar) return svar({ fel: 'Hittades inte' }, 404, origin, tillaten);

    if (metod === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...bildCors(origin), 'Vary': 'Origin' } });
    }
    if (!['GET', 'HEAD', 'PUT', 'DELETE'].includes(metod)) {
      return svar({ fel: 'Metoden stöds inte' }, 405, origin, tillaten);
    }

    const ref = delar[1];
    const plats = delar[2];
    if (!REF_MONSTER.test(ref) || !PLATS_MONSTER.test(plats)) {
      logga(metod, ref, plats, 0, '', 400);
      return svar({ fel: 'Ogiltig referens eller plats' }, 400, origin, tillaten);
    }
    const ctx = {
      origin, tillaten, ref, plats,
      nyckel: ref + '/' + plats,
      sokvag: '/bild/' + ref + '/' + plats,
    };

    if (metod === 'PUT') return await put(request, env, ctx);
    if (metod === 'DELETE') return await radera(request, env, ctx);
    return await hamta(request, env, ctx, url);
  } catch (fel) {
    console.error('BILD fel i hanteringen');
    return svar({ fel: 'Något gick fel' }, 500, origin, tillaten);
  }
}
