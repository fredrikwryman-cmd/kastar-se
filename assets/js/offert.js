/* Bohagsbolaget.se – offertformuläret.

   EN definition av formuläret. Samma funktion bygger det i två rutor:
     a) sektionen #kontakt på startsidan, där det ersätter reservformuläret
     b) offertrutan (<dialog>) som script.js bygger, med id-suffixet -d

   ETT gemensamt utkast per pågående förfrågan. Utkastet lever i minnet och
   speglas i sessionStorage under bb_offert_utkast (aldrig localStorage, aldrig
   URL:en). Båda rutorna läser och skriver samma objekt:
     { referens, falt, tjanster, bilder: [{slot, bildId, namn, status, url}],
       uppskattningVisas, uppskattningKalk }
   Fältvärden skrivs till utkastet bara när kunden ändrar ett fält. Att bygga
   eller fylla en ruta skriver aldrig något till utkastet, så en tom ruta kan
   inte skriva tomma värden över ifyllda.

   Inaktiva grupper (fieldset disabled + hidden) behåller sina värden i
   utkastet men valideras inte och skickas inte. Vad som är aktivt räknas
   fram på ett enda ställe: lage().

   Filen är inkapslad i en funktion. script.js har egna konstanter på
   toppnivå (ERROR_TEXT m.fl.) och två klassiska skript delar namnrymd.

   Publikt API: window.BBOffert (se längst ned). */
(function () {
  'use strict';

  if (window.BBOffert) return;

  const W3_URL = 'https://api.web3forms.com/submit';
  const W3_NYCKEL = 'a5ea7bbf-870d-4db3-9a82-d8e5283fa26e';
  /* Ordagrant samma feltext som kontaktformuläret alltid har haft (script.js). */
  const FEL_TEXT = 'Något gick fel. Ring oss på 070-561 48 45 eller maila boka@bohagsbolaget.se så hjälper vi dig.';
  const UTKAST_NYCKEL = 'bb_offert_utkast';

  const LOKAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const BILD_BAS = LOKAL
    ? 'http://localhost:8787'
    : 'https://bohagsbolaget-assistent.bohagsbolaget-se.workers.dev';

  const MAX_BILDER = 10;
  const MAX_SIDA = 2560;
  const JPEG_KVALITET = 0.85;
  const MAX_ORIGINAL = 15 * 1024 * 1024;
  const MAX_SAMTIDIGA = 2;
  /* Överstyrbar för test: window.BBOffert_TIDSGRANS_MS = 2000 */
  const tidsgrans = () => {
    const t = Number(window.BBOffert_TIDSGRANS_MS);
    return t > 0 ? t : 60000;
  };

  const REF_TECKEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 32 tecken, utan 0, O, 1, I
  const REF_MONSTER = /^BB-\d{4}-[A-Z2-9]{4}$/;
  const ID_MONSTER = /^[0-9a-f]{32}$/;

  const EJ_BILD_TEXT = 'Den här filen är inte en bild. Välj JPG, PNG, WebP eller HEIC.';

  /* ---------- Val ---------- */
  const TJANSTER = [
    ['flytt', 'Flytt'],
    ['tomning', 'Tömning eller bortforsling'],
    ['dodsbo', 'Dödsbo'],
    ['magasinering', 'Magasinering'],
    ['nedmontering', 'Nedmontering'],
    ['vetinte', 'Vet inte eller annat']
  ];
  const VANING = [['mark', 'Markplan'], ['hiss', 'Våning med hiss'], ['utan', 'Våning utan hiss']];
  const STORLEK = [['1rok', '1 rok'], ['2rok', '2 rok'], ['3rok', '3 rok'], ['4rok', '4 rok'],
                   ['5rok', '5 rok eller större'], ['villa', 'Villa eller radhus']];
  const MANGD = [['enstaka', 'Enstaka föremål'], ['flera', 'Flera möbler eller saker'],
                 ['rum', 'Ett rum eller förråd'], ['del', 'En större del av en bostad'],
                 ['hel', 'En hel bostad'], ['vetinte', 'Vet inte']];
  const MAG_OMF = [['hela', 'Hela'], ['delar', 'Delar'], ['vetinte', 'Vet inte ännu']];
  const MAG_TID = [['1', 'Upp till 1 månad'], ['2-3', '2 till 3 månader'], ['4-6', '4 till 6 månader'],
                   ['langre', 'Längre'], ['vetinte', 'Vet inte']];
  const NAR = [['datum', 'Bestämt datum'], ['period', 'En viss vecka eller period'],
               ['flexibel', 'Flexibel'], ['vetinte', 'Vet inte ännu']];
  const HAMTNING = [['ja', 'Ja'], ['nej', 'Nej']];
  const KUNDTYP = [['privat', 'Privatperson'], ['foretag', 'Företag eller förening']];

  const namnFor = (lista, v) => { const r = lista.find((x) => x[0] === v); return r ? r[1] : ''; };
  const STANDARD = { kundtyp: 'privat' };

  /* ---------- Utkastet ---------- */
  function nyReferens() {
    const d = new Date();
    const mmdd = String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    const b = new Uint8Array(4);
    crypto.getRandomValues(b);
    // 256 är jämnt delbart med 32, så & 31 ger ingen snedfördelning.
    return 'BB-' + mmdd + '-' + Array.from(b, (x) => REF_TECKEN[x & 31]).join('');
  }

  function nyttBildId() {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  }

  function nyttUtkast() {
    return { referens: nyReferens(), falt: {}, tjanster: [], bilder: [],
             uppskattningVisas: false, uppskattningKalk: '' };
  }

  function lasUtkast() {
    let u = null;
    try {
      const s = sessionStorage.getItem(UTKAST_NYCKEL);
      if (s) u = JSON.parse(s);
    } catch (err) { u = null; }
    if (!u || typeof u !== 'object' || !REF_MONSTER.test(u.referens)) return nyttUtkast();

    const kanda = TJANSTER.map((t) => t[0]);
    const falt = (u.falt && typeof u.falt === 'object') ? u.falt : {};
    const rent = {};
    Object.keys(falt).forEach((k) => {
      const v = falt[k];
      if (typeof v === 'string' || typeof v === 'boolean') rent[k] = v;
    });
    const sett = new Set();
    const bilder = (Array.isArray(u.bilder) ? u.bilder : []).filter((b) =>
      b && Number.isInteger(b.slot) && b.slot >= 1 && b.slot <= MAX_BILDER &&
      ID_MONSTER.test(b.bildId) && !sett.has(b.slot) && sett.add(b.slot)
    ).map((b) => {
      const klar = b.status === 'klar' && typeof b.url === 'string' && /^https?:\/\//.test(b.url);
      // En bild som inte hann bli klar före omladdningen finns inte längre i
      // minnet. Den räknas aldrig som klar och måste väljas igen.
      return { slot: b.slot, bildId: b.bildId, namn: String(b.namn || '').slice(0, 120),
               status: klar ? 'klar' : 'valjIgen', url: klar ? b.url : '' };
    });
    return {
      referens: u.referens,
      falt: rent,
      tjanster: (Array.isArray(u.tjanster) ? u.tjanster : []).filter((t) => kanda.includes(t)),
      bilder,
      uppskattningVisas: !!u.uppskattningVisas,
      uppskattningKalk: typeof u.uppskattningKalk === 'string' ? u.uppskattningKalk : ''
    };
  }

  let utkast = lasUtkast();

  function spara() {
    try {
      sessionStorage.setItem(UTKAST_NYCKEL, JSON.stringify({
        referens: utkast.referens,
        falt: utkast.falt,
        tjanster: utkast.tjanster,
        bilder: utkast.bilder.map((b) => ({ slot: b.slot, bildId: b.bildId, namn: b.namn, status: b.status, url: b.url })),
        uppskattningVisas: utkast.uppskattningVisas,
        uppskattningKalk: utkast.uppskattningKalk
      }));
    } catch (err) { /* privat läge eller fullt: utkastet lever ändå i minnet */ }
  }
  // Referensen ska överleva omladdning, även innan kunden fyllt i något.
  spara();

  /* ---------- Läget: vad är aktivt just nu ----------
     Huvudplatsen ägs av den första som gäller: Flytt, sedan Tömning eller
     bortforsling / Dödsbo, sedan Nedmontering, sedan Magasinering med
     hämtning, sist Vet inte eller annat. */
  function lage(u) {
    u = u || utkast;
    const T = new Set(u.tjanster);
    const f = u.falt;
    const flytt = T.has('flytt');
    const bort = T.has('tomning') || T.has('dodsbo');
    const ned = T.has('nedmontering');
    const mag = T.has('magasinering');
    const vet = T.has('vetinte');
    const hamtJa = mag && !flytt && f.hamtning === 'ja';
    const agare = flytt ? 'flytt' : bort ? 'bort' : ned ? 'ned' : hamtJa ? 'hamt' : vet ? 'vet' : null;
    const samma = (k) => f[k] !== false;   // förvald

    const g = {};
    g.huvud = !!agare;
    g.vart = flytt;
    g['vart-falt'] = flytt && f.vart_obestamt !== true;
    g.storlek = flytt;
    g.bort = bort && agare !== 'bort';
    g['bort-plats'] = g.bort && !samma('bort_samma');
    g.mangd = bort;
    g.ned = ned && agare !== 'ned';
    g['ned-plats'] = g.ned && !samma('ned_samma');
    g.hamtning = mag && !flytt;
    g.hamt = hamtJa && agare !== 'hamt';
    g['hamt-plats'] = g.hamt && !samma('hamt_samma');
    g['mag-omf'] = mag && flytt;
    g['mag-tid'] = mag;
    g['nar-datum'] = f.nar === 'datum';
    g['nar-period'] = f.nar === 'period';
    g.foretag = f.kundtyp === 'foretag';
    g.uppskattning = !!u.uppskattningVisas;

    const platser = { huvud: g.huvud, vart: g['vart-falt'], bort: g['bort-plats'],
                      ned: g['ned-plats'], hamt: g['hamt-plats'] };
    Object.keys(platser).forEach((p) => {
      g['plan-' + p] = platser[p] && (f['vaning_' + p] === 'hiss' || f['vaning_' + p] === 'utan');
    });

    const huvudFraga = { flytt: 'Varifrån?', bort: 'Var ska uppdraget utföras?', ned: 'Var ska uppdraget utföras?',
                         hamt: 'Var ska vi hämta?', vet: 'Var gäller det?' }[agare] || '';

    let fritext = 'fri';
    if (vet) fritext = 'vet';
    else if (ned && T.size === 1) fritext = 'ned';

    let fritextHint = 'Tunga föremål, långt mellan parkering och entré eller saker som ska sparas.';
    if (fritext === 'vet') fritextHint = 'Berätta kort vad det gäller, så hör vi av oss med förslag.';
    else if (fritext === 'ned') fritextHint = 'Till exempel kök, golv, kakel eller en icke-bärande vägg.';
    else if (bort) fritextHint = 'Tunga föremål, långt mellan parkering och entré eller saker som ska sparas.';
    else if (flytt) fritextHint = 'Tunga föremål, långt mellan parkering och entré eller saker som behöver extra skydd.';
    else if (mag) fritextHint = 'Till exempel om du behöver komma åt något under tiden, eller när sakerna ska köras ut.';
    else if (ned) fritextHint = 'Till exempel vad som ska monteras ned och om materialet ska köras bort.';

    return { T, flytt, bort, ned, mag, vet, hamtJa, agare, g, platser, huvudFraga, fritext, fritextHint, samma };
  }

  /* ---------- Markup ---------- */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KRAV_LEGEND = '<span class="offert-krav" aria-hidden="true"> *</span><span class="sr-only"> (obligatoriskt)</span>';
  const KRAV_LABEL = '<span class="offert-krav" aria-hidden="true"> *</span>';
  const felP = (nyckel, sx) => '<p class="offert-fel" id="of-fel-' + nyckel + sx + '" hidden></p>';

  function chips(namn, val, typ, sx) {
    return '<div class="offert-chips">' + val.map((v) =>
      '<label class="chip chip-' + typ + '"><input type="' + typ + '" name="' + namn + '" value="' + v[0] +
      '" id="of-' + namn + '-' + v[0] + sx + '" data-falt="' + namn + '" />' +
      '<span class="chip-text">' + esc(v[1]) + '</span></label>').join('') + '</div>';
  }

  function ensamChip(namn, text, sx) {
    return '<div class="offert-chips"><label class="chip chip-checkbox"><input type="checkbox" name="' + namn +
      '" value="ja" id="of-' + namn + sx + '" data-falt="' + namn + '" /><span class="chip-text">' + esc(text) +
      '</span></label></div>';
  }

  function platsBlock(p, sx) {
    return '<div class="field"><label for="of-plats_' + p + sx + '">Postnummer eller ort</label>' +
      '<input type="text" id="of-plats_' + p + sx + '" name="plats_' + p + '" data-falt="plats_' + p +
      '" aria-required="true" maxlength="80" />' + felP('plats_' + p, sx) + '</div>' +
      '<fieldset class="offert-grupp offert-vaning"><legend>Våning och hiss</legend>' +
      chips('vaning_' + p, VANING, 'radio', sx) +
      '<div class="field offert-under" data-grupp="plan-' + p + '" hidden>' +
      '<label for="of-plan_' + p + sx + '">Våningsplan</label>' +
      '<input type="text" inputmode="numeric" id="of-plan_' + p + sx + '" name="plan_' + p +
      '" data-falt="plan_' + p + '" maxlength="3" /></div></fieldset>';
  }

  function formularMarkup(sx) {
    return [
      '<form class="offert-form" id="offertForm' + sx + '" action="' + W3_URL + '" method="POST" novalidate>',
      // Honungsfält (BF-08): dolt för alla, även skärmläsare. Ingen etikett.
      '<input type="checkbox" name="botcheck" class="offert-honung" aria-hidden="true" tabindex="-1" autocomplete="off" style="display:none" />',
      '<p class="offert-kravinfo">Fält markerade med * är obligatoriska.</p>',

      // A
      '<fieldset class="offert-grupp" id="of-grupp-tjanst' + sx + '">',
      '<legend>Vad behöver du hjälp med?' + KRAV_LEGEND + '</legend>',
      chips('tjanst', TJANSTER, 'checkbox', sx),
      felP('tjanst', sx),
      '</fieldset>',

      // B
      '<fieldset class="offert-grupp" data-grupp="huvud" hidden disabled>',
      '<legend><span data-text="huvud"></span>' + KRAV_LEGEND + '</legend>',
      platsBlock('huvud', sx),
      '</fieldset>',

      '<fieldset class="offert-grupp" data-grupp="vart" hidden disabled>',
      '<legend>Vart?' + KRAV_LEGEND + '</legend>',
      '<fieldset class="offert-ram" data-inaktiv="vart-falt">',
      platsBlock('vart', sx),
      '</fieldset>',
      ensamChip('vart_obestamt', 'Inte bestämt ännu', sx),
      '</fieldset>',

      '<fieldset class="offert-grupp" data-grupp="storlek" hidden disabled>',
      '<legend>Bostadens storlek</legend>',
      chips('storlek', STORLEK, 'radio', sx),
      '</fieldset>',

      '<fieldset class="offert-grupp" data-grupp="bort" hidden disabled>',
      '<legend class="sr-only">Bortforslingens plats</legend>',
      ensamChip('bort_samma', 'Bortforslingen gäller samma adress som hämtningen', sx),
      '<fieldset class="offert-grupp offert-under" data-grupp="bort-plats" hidden disabled>',
      '<legend>Var ska bortforslingen utföras?' + KRAV_LEGEND + '</legend>',
      platsBlock('bort', sx),
      '</fieldset>',
      '</fieldset>',

      '<fieldset class="offert-grupp" data-grupp="mangd" hidden disabled>',
      '<legend>Hur mycket ska bort?</legend>',
      '<p class="field-hint offert-hint" data-visa="dodsbo" hidden>Säg gärna till om något ska sparas, flyttas eller förvaras.</p>',
      chips('mangd', MANGD, 'radio', sx),
      '</fieldset>',

      '<fieldset class="offert-grupp" data-grupp="ned" hidden disabled>',
      '<legend class="sr-only">Nedmonteringens plats</legend>',
      ensamChip('ned_samma', 'Nedmonteringen gäller samma adress', sx),
      '<fieldset class="offert-grupp offert-under" data-grupp="ned-plats" hidden disabled>',
      '<legend>Var ska nedmonteringen utföras?' + KRAV_LEGEND + '</legend>',
      platsBlock('ned', sx),
      '</fieldset>',
      '</fieldset>',

      '<fieldset class="offert-grupp" data-grupp="hamtning" hidden disabled>',
      '<legend>Behövs hämtning?</legend>',
      chips('hamtning', HAMTNING, 'radio', sx),
      '<fieldset class="offert-grupp offert-under" data-grupp="hamt" hidden disabled>',
      '<legend class="sr-only">Hämtningens plats</legend>',
      ensamChip('hamt_samma', 'Hämtningen sker på samma adress', sx),
      '<fieldset class="offert-grupp offert-under" data-grupp="hamt-plats" hidden disabled>',
      '<legend>Var ska vi hämta?' + KRAV_LEGEND + '</legend>',
      platsBlock('hamt', sx),
      '</fieldset>',
      '</fieldset>',
      '</fieldset>',

      '<fieldset class="offert-grupp" data-grupp="mag-omf" hidden disabled>',
      '<legend>Ska hela eller delar av bohaget magasineras?</legend>',
      chips('mag_omf', MAG_OMF, 'radio', sx),
      '</fieldset>',

      '<fieldset class="offert-grupp" data-grupp="mag-tid" hidden disabled>',
      '<legend>Hur länge?</legend>',
      chips('mag_tid', MAG_TID, 'radio', sx),
      '</fieldset>',

      // C
      '<div class="offert-grupp offert-bilder">',
      '<div class="field">',
      '<label for="of-bilder' + sx + '">Bilder (frivilligt)</label>',
      '<p class="field-hint" id="of-bilder-hint' + sx + '">Bifoga gärna 3 till 6 bilder: en översiktsbild, större föremål och eventuell trappa eller trång passage.</p>',
      '<input type="file" id="of-bilder' + sx + '" accept="image/*" multiple aria-describedby="of-bilder-hint' + sx + ' of-bilder-info' + sx + '" />',
      '<p class="offert-bildinfo" id="of-bilder-info' + sx + '" aria-live="polite"></p>',
      '</div>',
      '<ul class="offert-bildlista" hidden></ul>',
      '<p class="sr-only" data-roll="bildlive" aria-live="polite"></p>',
      '<p class="field-hint">Vill du hellre skicka bilder via SMS? Skicka förfrågan först, så får du ett referensnummer.</p>',
      '</div>',

      // D
      '<fieldset class="offert-grupp">',
      '<legend>När?</legend>',
      chips('nar', NAR, 'radio', sx),
      '<div class="field offert-under" data-grupp="nar-datum" hidden>',
      '<label for="of-nar_datum' + sx + '">Datum</label>',
      '<input type="date" id="of-nar_datum' + sx + '" name="nar_datum" data-falt="nar_datum" />',
      '</div>',
      '<div class="field offert-under" data-grupp="nar-period" hidden>',
      '<label for="of-nar_period' + sx + '">Vecka eller period</label>',
      '<input type="text" id="of-nar_period' + sx + '" name="nar_period" data-falt="nar_period" maxlength="60" />',
      '</div>',
      '</fieldset>',

      // E
      '<div class="field">',
      '<label for="of-meddelande' + sx + '"><span data-text="fritext"></span><span class="offert-krav" data-krav="fritext" aria-hidden="true" hidden> *</span></label>',
      '<p class="field-hint" id="of-meddelande-hint' + sx + '" data-text="fritext-hint"></p>',
      '<textarea id="of-meddelande' + sx + '" name="meddelande" data-falt="meddelande" rows="4" maxlength="4000" aria-describedby="of-meddelande-hint' + sx + '"></textarea>',
      felP('meddelande', sx),
      '</div>',

      '<div class="field" data-grupp="uppskattning" hidden>',
      '<label for="of-uppskattning' + sx + '">Kalkylatorns uppskattning</label>',
      '<p class="field-hint" id="of-uppskattning-hint' + sx + '">Uppskattning, inte bindande</p>',
      '<input type="text" id="of-uppskattning' + sx + '" name="uppskattning" data-falt="uppskattning" maxlength="200" aria-describedby="of-uppskattning-hint' + sx + '" />',
      '</div>',

      // F
      '<fieldset class="offert-grupp">',
      '<legend>Kundtyp</legend>',
      chips('kundtyp', KUNDTYP, 'radio', sx),
      '<div class="field offert-under" data-grupp="foretag" hidden>',
      '<label for="of-foretag' + sx + '">Företagsnamn</label>',
      '<input type="text" id="of-foretag' + sx + '" name="foretag" data-falt="foretag" autocomplete="organization" maxlength="120" />',
      '</div>',
      '</fieldset>',

      // G
      '<fieldset class="offert-grupp">',
      '<legend>Kontaktuppgifter</legend>',
      '<p class="field-hint" id="of-kontakt-hint' + sx + '">Fyll i telefon, e-post eller båda.</p>',
      '<div class="field"><label for="of-namn' + sx + '">Namn' + KRAV_LABEL + '</label>',
      '<input type="text" id="of-namn' + sx + '" name="namn" data-falt="namn" autocomplete="name" aria-required="true" maxlength="120" />',
      felP('namn', sx), '</div>',
      '<div class="field"><label for="of-telefon' + sx + '">Telefon</label>',
      '<input type="tel" id="of-telefon' + sx + '" name="telefon" data-falt="telefon" autocomplete="tel" maxlength="40" aria-describedby="of-kontakt-hint' + sx + '" />',
      felP('telefon', sx), '</div>',
      '<div class="field"><label for="of-epost' + sx + '">E-post</label>',
      '<input type="email" id="of-epost' + sx + '" name="epost" data-falt="epost" autocomplete="email" maxlength="200" aria-describedby="of-kontakt-hint' + sx + '" />',
      felP('epost', sx), felP('kontakt', sx), '</div>',
      '</fieldset>',

      // H
      '<div class="offert-felsammanfattning" role="alert"></div>',
      '<button type="submit" class="btn btn-primary btn-block offert-skicka" id="of-skicka' + sx + '">Skicka förfrågan</button>',
      '<p class="offert-knappinfo" aria-live="polite"></p>',
      '<p class="offert-gratis">Kostnadsfri offertförfrågan. Du bokar inget genom att skicka.</p>',
      '<p class="form-status" role="status" aria-live="polite" hidden></p>',
      '<p class="form-alt">Vi använder uppgifterna bara för att svara på din förfrågan. Läs mer i <a href="/integritetspolicy.html">integritetspolicyn</a>.</p>',
      '<p class="form-alt">Eller <a href="mailto:boka@bohagsbolaget.se">maila oss direkt<span class="sr-only"> (öppnar ditt e-postprogram)</span></a> · ring <a href="tel:+46705614845">Fredrik 070-561 48 45</a> eller <a href="tel:+46703433440">Thom 070-343 34 40</a></p>',
      '</form>',
      '<div class="offert-tack" tabindex="-1" hidden></div>'
    ].join('\n');
  }

  /* ---------- Instanser ---------- */
  const instanser = [];
  let skickar = false;   // gemensam spärr: ett inskick åt gången, oavsett ruta

  function bygg(opts) {
    opts = opts || {};
    const sx = opts.suffix || '';
    const rot = document.createElement('div');
    rot.className = 'contact-form offert-kort';
    rot.innerHTML = formularMarkup(sx);

    const form = rot.querySelector('form');
    const inst = {
      sx, rot, form,
      kalla: opts.kalla || (sx ? 'dialog' : 'sektion'),
      tack: rot.querySelector('.offert-tack'),
      knapp: rot.querySelector('.offert-skicka'),
      knappinfo: rot.querySelector('.offert-knappinfo'),
      sammanfattning: rot.querySelector('.offert-felsammanfattning'),
      status: rot.querySelector('.form-status'),
      filFalt: rot.querySelector('input[type="file"]'),
      bildinfo: rot.querySelector('.offert-bildinfo'),
      bildlista: rot.querySelector('.offert-bildlista'),
      bildlive: rot.querySelector('[data-roll="bildlive"]'),
      bildNoder: new Map(),
      felNycklar: new Set(),
      visarTack: false,
      bildinfoText: ''
    };

    // Grundläget för aria-describedby, så att felhänvisningar kan läggas till
    // och tas bort utan att hjälptexterna försvinner.
    form.querySelectorAll('input, textarea, fieldset').forEach((el) => {
      el.dataset.bas = el.getAttribute('aria-describedby') || '';
    });

    form.addEventListener('input', (e) => andrat(inst, e));
    form.addEventListener('change', (e) => andrat(inst, e));
    form.addEventListener('submit', (e) => skicka(inst, e));
    inst.filFalt.addEventListener('change', () => {
      const filer = Array.from(inst.filFalt.files || []);
      inst.filFalt.value = '';
      if (filer.length) laggTillFiler(inst, filer);
    });
    inst.bildlista.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-gor]');
      if (!b) return;
      const li = b.closest('li');
      const id = li && li.dataset.bildId;
      if (!id) return;
      if (b.dataset.gor === 'bort') {
        // Fokus till nästa bilds Ta bort, annars till filfältet.
        const nasta = li.nextElementSibling || li.previousElementSibling;
        taBort(id);
        const mal = nasta && nasta.querySelector('button[data-gor="bort"]');
        (mal || inst.filFalt).focus();
      } else if (b.dataset.gor === 'igen') {
        forsokIgen(id);
        const bort = li.querySelector('button[data-gor="bort"]');
        if (bort) bort.focus();
      }
    });

    instanser.push(inst);
    hydrera(inst);
    return inst;
  }

  /* Fyller rutan FRÅN utkastet. Skriver aldrig till utkastet. */
  function hydrera(inst) {
    inst.form.querySelectorAll('[data-falt]').forEach((el) => {
      const k = el.dataset.falt;
      const v = utkast.falt[k];
      if (k === 'tjanst') el.checked = utkast.tjanster.includes(el.value);
      else if (el.type === 'checkbox') el.checked = /_samma$/.test(k) ? v !== false : v === true;
      else if (el.type === 'radio') el.checked = (v !== undefined ? v : STANDARD[k]) === el.value;
      else el.value = typeof v === 'string' ? v : '';
    });
    uppdateraLage(inst);
    ritaBilder(inst);
    uppdateraKnapp(inst);
  }

  function satAktiv(el, aktiv) {
    el.hidden = !aktiv;
    if (el.tagName === 'FIELDSET') el.disabled = !aktiv;
    else el.querySelectorAll('input, textarea').forEach((x) => { x.disabled = !aktiv; });
    if (!aktiv) rensaFelInom(inst_for(el), el);
  }

  function inst_for(el) {
    return instanser.find((i) => i.rot.contains(el));
  }

  function uppdateraLage(inst) {
    const L = lage();
    inst.form.querySelectorAll('[data-grupp]').forEach((el) => {
      satAktiv(el, !!L.g[el.dataset.grupp]);
    });
    inst.form.querySelectorAll('[data-inaktiv]').forEach((el) => {
      const aktiv = !!L.g[el.dataset.inaktiv];
      el.disabled = !aktiv;
      el.classList.toggle('ar-inaktiv', !aktiv);
      if (!aktiv) rensaFelInom(inst, el);
    });
    inst.form.querySelectorAll('[data-visa="dodsbo"]').forEach((el) => { el.hidden = !L.T.has('dodsbo'); });

    const huvud = inst.form.querySelector('[data-text="huvud"]');
    if (huvud) huvud.textContent = L.huvudFraga;

    const fritext = { vet: 'Beskriv med egna ord vad du behöver hjälp med',
                      ned: 'Vad ska monteras ned?', fri: 'Något mer vi behöver veta?' }[L.fritext];
    inst.form.querySelector('[data-text="fritext"]').textContent = fritext;
    inst.form.querySelector('[data-text="fritext-hint"]').textContent = L.fritextHint;
    const kravad = L.fritext !== 'fri';
    inst.form.querySelector('[data-krav="fritext"]').hidden = !kravad;
    const ta = inst.form.querySelector('textarea[data-falt="meddelande"]');
    if (kravad) ta.setAttribute('aria-required', 'true'); else ta.removeAttribute('aria-required');
    if (!kravad) satFel(inst, 'meddelande', '');
  }

  /* ---------- Ändringar från kunden ---------- */
  function andrat(inst, e) {
    const el = e.target;
    const k = el && el.dataset && el.dataset.falt;
    if (!k) return;
    // Text sparas på input, val på change. Undvik dubbelarbete.
    if (e.type === 'input' && (el.type === 'checkbox' || el.type === 'radio')) return;

    if (k === 'tjanst') {
      const alla = Array.from(inst.form.querySelectorAll('input[data-falt="tjanst"]'));
      if (el.checked) {
        // "Vet inte eller annat" är exklusivt åt båda håll.
        alla.forEach((x) => {
          if (x === el) return;
          if (el.value === 'vetinte' || x.value === 'vetinte') x.checked = false;
        });
      }
      utkast.tjanster = alla.filter((x) => x.checked).map((x) => x.value);
    } else if (el.type === 'checkbox') {
      utkast.falt[k] = el.checked;
    } else if (el.type === 'radio') {
      if (el.checked) utkast.falt[k] = el.value;
    } else if (el.value === '') {
      delete utkast.falt[k];
    } else {
      utkast.falt[k] = el.value;
    }
    spara();
    uppdateraLage(inst);
    if (inst.felNycklar.size) uppdateraFel(inst);
  }

  /* ---------- Validering ---------- */
  const telefonOk = (v) => /^\+?\d{7,15}$/.test(v.replace(/[\s\-().]/g, ''));
  const epostOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

  function validera() {
    const L = lage();
    const f = utkast.falt;
    const tom = (k) => !(typeof f[k] === 'string' && f[k].trim());
    const fel = [];

    if (!utkast.tjanster.length) fel.push(['tjanst', 'Välj minst ett alternativ.']);
    if (L.platser.huvud && tom('plats_huvud')) fel.push(['plats_huvud', 'Fyll i postnummer eller ort.']);
    if (L.platser.vart && tom('plats_vart')) fel.push(['plats_vart', 'Fyll i postnummer eller ort, eller välj Inte bestämt ännu.']);
    if (L.platser.bort && tom('plats_bort')) fel.push(['plats_bort', 'Fyll i postnummer eller ort.']);
    if (L.platser.ned && tom('plats_ned')) fel.push(['plats_ned', 'Fyll i postnummer eller ort.']);
    if (L.platser.hamt && tom('plats_hamt')) fel.push(['plats_hamt', 'Fyll i postnummer eller ort.']);
    if (L.fritext === 'ned' && tom('meddelande')) fel.push(['meddelande', 'Beskriv vad som ska monteras ned.']);
    if (L.fritext === 'vet' && tom('meddelande')) fel.push(['meddelande', 'Beskriv kort vad du behöver hjälp med.']);
    if (tom('namn')) fel.push(['namn', 'Fyll i ditt namn.']);

    const tel = tom('telefon') ? '' : f.telefon.trim();
    const ep = tom('epost') ? '' : f.epost.trim();
    if (!tel && !ep) fel.push(['kontakt', 'Fyll i telefon eller e-post, så att vi kan nå dig.']);
    // Ett ifyllt fält valideras alltid, även om det andra är ifyllt.
    if (tel && !telefonOk(tel)) fel.push(['telefon', 'Telefonnumret ser inte ut att stämma. Skriv det med siffror, till exempel 070-123 45 67.']);
    if (ep && !epostOk(ep)) fel.push(['epost', 'E-postadressen ser inte ut att stämma. Skriv den som namn@exempel.se.']);
    return fel;
  }

  function malFor(inst, nyckel) {
    const q = (s) => Array.from(inst.form.querySelectorAll(s));
    if (nyckel === 'tjanst') return q('input[data-falt="tjanst"]').concat(q('#of-grupp-tjanst' + inst.sx));
    if (nyckel === 'kontakt') return q('input[data-falt="telefon"], input[data-falt="epost"]');
    return q('[data-falt="' + nyckel + '"]');
  }

  function satFel(inst, nyckel, text) {
    const p = inst.form.querySelector('#of-fel-' + nyckel + inst.sx);
    if (!p) return;
    const id = p.id;
    malFor(inst, nyckel).forEach((el) => {
      const delar = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter((x) => x && x !== id);
      if (text) delar.push(id);
      if (delar.length) el.setAttribute('aria-describedby', delar.join(' '));
      else el.removeAttribute('aria-describedby');
      if (el.tagName !== 'FIELDSET') {
        const ovriga = el.getAttribute('aria-describedby') || '';
        const harFel = /of-fel-/.test(ovriga);
        if (harFel) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
      }
    });
    p.textContent = text;
    p.hidden = !text;
    if (text) inst.felNycklar.add(nyckel); else inst.felNycklar.delete(nyckel);
  }

  function rensaFelInom(inst, behallare) {
    if (!inst) return;
    behallare.querySelectorAll('.offert-fel').forEach((p) => {
      const nyckel = p.id.slice('of-fel-'.length, p.id.length - inst.sx.length);
      if (!p.hidden) satFel(inst, nyckel, '');
    });
  }

  function rensaAllaFel(inst) {
    Array.from(inst.felNycklar).forEach((k) => satFel(inst, k, ''));
    inst.sammanfattning.textContent = '';
  }

  function visaFel(inst, fel) {
    rensaAllaFel(inst);
    fel.forEach(([k, t]) => satFel(inst, k, t));
    inst.sammanfattning.textContent = fel.length === 1
      ? 'Ett fält behöver rättas. Felet visas vid fältet.'
      : fel.length + ' fält behöver rättas. Felen visas vid fälten.';
    const forsta = malFor(inst, fel[0][0]).find((el) => el.tagName !== 'FIELDSET' && !el.disabled);
    if (forsta) forsta.focus();
  }

  /* Efter ett misslyckat försök: fel som rättats försvinner direkt, men nya
     fel visas först vid nästa försök. */
  function uppdateraFel(inst) {
    const nu = new Map(validera());
    Array.from(inst.felNycklar).forEach((k) => {
      if (nu.has(k)) satFel(inst, k, nu.get(k)); else satFel(inst, k, '');
    });
    if (!inst.felNycklar.size) inst.sammanfattning.textContent = '';
  }

  /* ---------- Bilder ---------- */
  const rt = new Map();     // bildId -> körtidsdata som inte sparas: blob, typ, AbortController
  const ko = [];
  let aktiva = 0;

  const hitta = (id) => utkast.bilder.find((b) => b.bildId === id);
  const andelse = (namn) => (String(namn).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
  const TYP_FRAN_ANDELSE = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
                             heic: 'image/heic', heif: 'image/heif', gif: 'image/gif', avif: 'image/avif' };

  function arBild(fil) {
    const t = (fil.type || '').toLowerCase();
    if (t === 'image/svg+xml') return false;
    if (t.startsWith('image/')) return true;
    return !!TYP_FRAN_ANDELSE[andelse(fil.name)];
  }

  function aktivInstans() {
    const d = instanser.find((i) => i.rot.closest('dialog[open]'));
    return d || instanser.find((i) => !i.rot.closest('dialog')) || instanser[0];
  }

  function laggTillFiler(inst, filer) {
    const lediga = [];
    for (let s = 1; s <= MAX_BILDER; s++) if (!utkast.bilder.some((b) => b.slot === s)) lediga.push(s);
    const ejBild = [];
    let utanPlats = 0;

    filer.forEach((fil) => {
      if (!arBild(fil)) { ejBild.push(fil.name); return; }
      if (!lediga.length) { utanPlats++; return; }
      const slot = lediga.shift();
      const bildId = nyttBildId();
      utkast.bilder.push({ slot, bildId, namn: String(fil.name || 'bild').slice(0, 120), status: 'laddar', url: '' });
      rt.set(bildId, { blob: null, typ: '', ctrl: null, timer: 0, tumme: '', fel: '', forsok: 0, startad: false });
      forbered(bildId, fil);
    });
    spara();

    const delar = [];
    ejBild.forEach((n) => delar.push(n + ': ' + EJ_BILD_TEXT));
    if (utanPlats) {
      delar.push(utanPlats === 1
        ? 'En bild kom inte med, eftersom högst tio bilder får plats.'
        : utanPlats + ' bilder kom inte med, eftersom högst tio bilder får plats.');
    }
    inst.bildinfoText = delar.join(' ');
    ritaAllaBilder();
  }

  async function forbered(bildId, fil) {
    let blob = null;
    let typ = '';
    let tumme = '';
    try {
      if (typeof createImageBitmap !== 'function') throw new Error('stöds inte');
      const bmp = await createImageBitmap(fil);
      const s = Math.min(1, MAX_SIDA / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * s));
      const h = Math.max(1, Math.round(bmp.height * s));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(bmp, 0, 0, w, h);
      if (bmp.close) bmp.close();
      blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', JPEG_KVALITET));
      if (!blob) throw new Error('kunde inte koda');
      typ = 'image/jpeg';
      tumme = URL.createObjectURL(blob);
    } catch (err) {
      // Går inte att avkoda här (till exempel HEIC utanför Safari): originalet.
      blob = null;
    }

    const r = rt.get(bildId);
    const b = hitta(bildId);
    if (!r || !b) { if (tumme) URL.revokeObjectURL(tumme); return; }

    if (!blob) {
      if (fil.size > MAX_ORIGINAL) {
        b.status = 'fel';
        r.fel = 'Bilden kan inte läsas här och är större än 15 MB. Välj en mindre bild eller skicka den via SMS.';
        spara(); ritaAllaBilder(); annonsera(b);
        return;
      }
      const t = (fil.type || '').toLowerCase();
      blob = fil;
      typ = /^image\/(jpeg|png|webp|heic|heif)$/.test(t) ? t : (TYP_FRAN_ANDELSE[andelse(fil.name)] || t || 'application/octet-stream');
    }
    r.blob = blob; r.typ = typ; r.tumme = tumme;
    ritaAllaBilder();
    ko.push(bildId);
    pumpa();
  }

  function pumpa() {
    while (aktiva < MAX_SAMTIDIGA && ko.length) {
      const id = ko.shift();
      if (hitta(id) && rt.get(id) && rt.get(id).blob) ladda(id);
    }
  }

  function felTextFor(res, tidUte) {
    if (tidUte) return 'Det tog för lång tid.';
    if (!res) return 'Ingen kontakt med servern.';
    if (res.status === 413) return 'Bilden är för stor.';
    if (res.status === 415) return EJ_BILD_TEXT;
    if (res.status === 429) return 'För många bilder på kort tid. Vänta en stund och försök igen.';
    return '';
  }

  async function ladda(id) {
    const b = hitta(id);
    const r = rt.get(id);
    const ref = utkast.referens;
    aktiva++;
    r.startad = true;
    const forsok = ++r.forsok;
    const ctrl = new AbortController();
    r.ctrl = ctrl;
    let tidUte = false;
    r.timer = setTimeout(() => { tidUte = true; ctrl.abort(); }, tidsgrans());

    let res = null;
    let svar = null;
    try {
      res = await fetch(BILD_BAS + '/bild/' + encodeURIComponent(ref) + '/' + b.slot, {
        method: 'PUT',
        headers: { 'Content-Type': r.typ, 'X-Bild-Id': id },
        body: r.blob,
        signal: ctrl.signal
      });
      if (res.ok) svar = await res.json().catch(() => null);
    } catch (err) {
      res = null;
    } finally {
      clearTimeout(r.timer);
      aktiva--;
    }

    // Ett sent svar för en bild som tagits bort, eller för ett äldre försök,
    // ignoreras. Kontrollen görs mot bildId, inte platsen: platsen kan redan
    // ha fått en ny bild.
    const nu = hitta(id);
    const rnu = rt.get(id);
    if (!nu || !rnu || rnu !== r || r.forsok !== forsok) { pumpa(); return; }
    r.ctrl = null;

    if (res && res.ok && svar && typeof svar.url === 'string' && /^https?:\/\//.test(svar.url)) {
      nu.status = 'klar';
      nu.url = svar.url;
      r.fel = '';
    } else {
      nu.status = 'fel';
      r.fel = felTextFor(res, tidUte);
    }
    spara();
    ritaAllaBilder();
    annonsera(nu);
    pumpa();
  }

  function forsokIgen(id) {
    const b = hitta(id);
    const r = rt.get(id);
    if (!b || !r || !r.blob || b.status !== 'fel') return;
    b.status = 'laddar';   // samma plats och samma bild-id: idempotent
    r.fel = '';
    spara();
    ritaAllaBilder();
    ko.push(id);
    pumpa();
  }

  function taBort(id) {
    const i = utkast.bilder.findIndex((b) => b.bildId === id);
    if (i < 0) return;
    const b = utkast.bilder[i];
    const ref = utkast.referens;
    utkast.bilder.splice(i, 1);

    const r = rt.get(id);
    rt.delete(id);
    // En bild som återställts efter omladdning (ingen körtidsdata) kan ligga
    // på servern. En bild som aldrig hunnit skickas gör det inte.
    let radera = true;
    if (r) {
      const k = ko.indexOf(id);
      if (k >= 0) ko.splice(k, 1);
      clearTimeout(r.timer);
      if (r.ctrl) r.ctrl.abort();
      if (r.tumme) URL.revokeObjectURL(r.tumme);
      if (!r.startad) radera = false;
    }
    spara();
    instanser.forEach((x) => { x.bildinfoText = ''; });
    ritaAllaBilder();
    if (radera) raderaPaServer(ref, b.slot, id, 0);
    pumpa();
  }

  /* Kunden blockeras aldrig av raderingen. Ett misslyckat anrop provas en
     gång till i bakgrunden. 404 betyder att platsen har ett annat id. */
  function raderaPaServer(ref, slot, id, forsok) {
    const igen = () => { if (forsok === 0) setTimeout(() => raderaPaServer(ref, slot, id, 1), 3000); };
    try {
      fetch(BILD_BAS + '/bild/' + encodeURIComponent(ref) + '/' + slot, {
        method: 'DELETE',
        headers: { 'X-Bild-Id': id },
        keepalive: true
      }).then((res) => {
        if (!res.ok && res.status !== 404) igen();
      }).catch(igen);
    } catch (err) { igen(); }
  }

  const STATUS_TEXT = { laddar: 'Laddar upp…', klar: 'Klar', fel: 'Kunde inte laddas upp', valjIgen: 'Behöver väljas igen' };

  function annonsera(b) {
    const inst = aktivInstans();
    if (!inst) return;
    const nr = sorterade().findIndex((x) => x.bildId === b.bildId) + 1;
    if (nr < 1) return;
    inst.bildlive.textContent = 'Bild ' + nr + ': ' + STATUS_TEXT[b.status] + '.';
  }

  const sorterade = () => utkast.bilder.slice().sort((a, b) => a.slot - b.slot);

  function bildNod() {
    const li = document.createElement('li');
    li.className = 'offert-bild';
    li.innerHTML =
      '<span class="offert-tumme"><img alt="" width="64" height="64" decoding="async" hidden /></span>' +
      '<span class="offert-bildtext"><span class="offert-bildnamn"></span>' +
      '<span class="offert-bildstatus"></span><span class="offert-bildfel"></span></span>' +
      '<span class="offert-bildknappar">' +
      '<button type="button" class="offert-bildknapp" data-gor="igen">Försök igen</button>' +
      '<button type="button" class="offert-bildknapp" data-gor="bort">Ta bort</button></span>';
    return li;
  }

  function ritaBilder(inst) {
    const lista = sorterade();
    const finns = new Set(lista.map((b) => b.bildId));
    inst.bildNoder.forEach((li, id) => {
      if (!finns.has(id)) { li.remove(); inst.bildNoder.delete(id); }
    });
    lista.forEach((b, idx) => {
      let li = inst.bildNoder.get(b.bildId);
      if (!li) { li = bildNod(); li.dataset.bildId = b.bildId; inst.bildNoder.set(b.bildId, li); }
      if (inst.bildlista.children[idx] !== li) inst.bildlista.insertBefore(li, inst.bildlista.children[idx] || null);

      const r = rt.get(b.bildId);
      const nr = idx + 1;
      li.dataset.status = b.status;
      const img = li.querySelector('img');
      const src = (r && r.tumme) || (b.status === 'klar' ? b.url : '');
      if (src) { if (img.getAttribute('src') !== src) img.src = src; img.hidden = false; }
      else { img.removeAttribute('src'); img.hidden = true; }
      li.querySelector('.offert-bildnamn').textContent = 'Bild ' + nr + ': ' + b.namn;
      li.querySelector('.offert-bildstatus').textContent = STATUS_TEXT[b.status];
      const fel = li.querySelector('.offert-bildfel');
      fel.textContent = (b.status === 'fel' && r && r.fel) ? r.fel : '';
      fel.hidden = !fel.textContent;
      const igen = li.querySelector('[data-gor="igen"]');
      igen.hidden = !(b.status === 'fel' && r && r.blob);
      igen.setAttribute('aria-label', 'Försök igen, bild ' + nr);
      li.querySelector('[data-gor="bort"]').setAttribute('aria-label', 'Ta bort bild ' + nr);
    });
    inst.bildlista.hidden = !lista.length;

    const fullt = utkast.bilder.length >= MAX_BILDER;
    inst.filFalt.disabled = fullt;
    let info = inst.bildinfoText || '';
    if (fullt) info = (info ? info + ' ' : '') + 'Du har valt tio bilder, vilket är det högsta antalet. Ta bort en bild om du vill välja en annan.';
    if (inst.bildinfo.textContent !== info) inst.bildinfo.textContent = info;
    uppdateraKnapp(inst);
  }

  function ritaAllaBilder() { instanser.forEach(ritaBilder); }

  function bildlage() {
    const n = utkast.bilder.length;
    const klara = utkast.bilder.filter((b) => b.status === 'klar').length;
    const laddar = utkast.bilder.filter((b) => b.status === 'laddar').length;
    const problem = utkast.bilder.filter((b) => b.status === 'fel' || b.status === 'valjIgen').length;
    return { n, klara, laddar, problem };
  }

  function uppdateraKnapp(inst) {
    const B = bildlage();
    if (skickar) {
      inst.knapp.disabled = true;
      inst.knapp.textContent = 'Skickar…';
    } else if (B.laddar) {
      inst.knapp.disabled = true;
      inst.knapp.textContent = 'Väntar på bilder (' + B.klara + ' av ' + B.n + ')';
    } else {
      inst.knapp.disabled = false;
      inst.knapp.textContent = 'Skicka förfrågan';
    }
    const text = (!B.laddar && B.problem) ? 'En bild är inte klar. Försök igen eller ta bort den.' : '';
    if (inst.knappinfo.textContent !== text) inst.knappinfo.textContent = text;
  }

  /* ---------- Inskick ---------- */
  function vaningText(p) {
    const f = utkast.falt;
    const v = f['vaning_' + p];
    const plan = typeof f['plan_' + p] === 'string' ? f['plan_' + p].trim() : '';
    if (v === 'mark') return 'Markplan';
    if (v === 'hiss') return plan ? 'Våning ' + plan + ' med hiss' : 'Våning med hiss';
    if (v === 'utan') return plan ? 'Våning ' + plan + ' utan hiss' : 'Våning utan hiss';
    return '';
  }

  function byggData(hp) {
    const L = lage();
    const f = utkast.falt;
    const txt = (k) => (typeof f[k] === 'string' ? f[k].trim() : '');
    const tjanstNamn = TJANSTER.filter((t) => L.T.has(t[0])).map((t) => t[1]);
    const namn = txt('namn');
    const epost = txt('epost');

    const data = {
      access_key: W3_NYCKEL,
      subject: 'Offertförfrågan ' + utkast.referens + ': ' + tjanstNamn.join(' + '),
      from_name: namn || 'Bohagsbolaget.se, webbformulär',
      replyto: epost || 'boka@bohagsbolaget.se',
      botcheck: !!(hp && hp.checked)
    };
    const lagg = (k, v) => { if (v) data[k] = v; };

    const sammaSom = { flytt: 'Samma som varifrån', bort: 'Samma som uppdragets plats',
                       ned: 'Samma som uppdragets plats', hamt: 'Samma som hämtningen',
                       vet: 'Samma som uppdragets plats' }[L.agare] || '';
    const plats = (p, nyckel, vNyckel, aktivGrupp, sammaKey) => {
      // aktivGrupp: blocket syns; sammaKey: förvald samma-adress-ruta
      if (!aktivGrupp) return;
      if (sammaKey && L.samma(sammaKey)) { lagg(nyckel, sammaSom); return; }
      lagg(nyckel, txt('plats_' + p));
      lagg(vNyckel, vaningText(p));
    };

    lagg('Referens', utkast.referens);
    lagg('Tjänster', tjanstNamn.join(', '));
    lagg('Kundtyp', f.kundtyp === 'foretag' ? 'Företag eller förening' : 'Privatperson');
    if (L.g.foretag) lagg('Företagsnamn', txt('foretag'));

    if (L.agare === 'flytt') plats('huvud', 'Varifrån', 'Våning och hiss, varifrån', true);
    if (L.g.vart) {
      if (f.vart_obestamt === true) lagg('Vart', 'Inte bestämt ännu');
      else { lagg('Vart', txt('plats_vart')); lagg('Våning och hiss, vart', vaningText('vart')); }
    }
    if (L.g.storlek) lagg('Bostadens storlek', namnFor(STORLEK, f.storlek));
    if (L.agare === 'bort' || L.agare === 'ned' || L.agare === 'vet') {
      plats('huvud', 'Uppdragets plats', 'Våning och hiss, uppdraget', true);
    }
    plats('bort', 'Bortforsling, plats', 'Våning och hiss, bortforsling', L.g.bort, 'bort_samma');
    if (L.g.mangd) lagg('Hur mycket ska bort', namnFor(MANGD, f.mangd));
    plats('ned', 'Nedmontering, plats', 'Våning och hiss, nedmontering', L.g.ned, 'ned_samma');
    if (L.g['mag-omf']) lagg('Magasinering, hela eller delar', namnFor(MAG_OMF, f.mag_omf));
    if (L.g.hamtning) lagg('Behövs hämtning', namnFor(HAMTNING, f.hamtning));
    if (L.agare === 'hamt') plats('huvud', 'Hämtning, plats', 'Våning och hiss, hämtning', true);
    plats('hamt', 'Hämtning, plats', 'Våning och hiss, hämtning', L.g.hamt, 'hamt_samma');
    if (L.g['mag-tid']) lagg('Magasinering, tid', namnFor(MAG_TID, f.mag_tid));

    if (f.nar === 'datum') lagg('När', txt('nar_datum') ? 'Bestämt datum: ' + txt('nar_datum') : 'Bestämt datum');
    else if (f.nar === 'period') lagg('När', txt('nar_period') ? 'Vecka eller period: ' + txt('nar_period') : 'Vecka eller period');
    else if (f.nar === 'flexibel') lagg('När', 'Flexibel');
    else if (f.nar === 'vetinte') lagg('När', 'Vet inte ännu');

    const klara = sorterade().filter((b) => b.status === 'klar');
    if (klara.length) {
      lagg('Bilder', (klara.length === 1 ? '1 bild' : klara.length + ' bilder') + '\n' + klara.map((b) => b.url).join('\n'));
    }
    lagg('Meddelande', txt('meddelande'));
    if (L.g.uppskattning) lagg('Kalkylatorns uppskattning', txt('uppskattning'));
    lagg('Namn', namn);
    lagg('Telefon', txt('telefon'));
    lagg('E-post', epost);
    return { data, antalBilder: klara.length };
  }

  function visaStatus(inst, text, ok) {
    // Visa först, sätt texten sen: annars annonseras den inte (se script.js).
    inst.status.classList.toggle('is-ok', ok);
    inst.status.classList.toggle('is-error', !ok);
    inst.status.hidden = false;
    inst.status.textContent = text;
  }

  async function skicka(inst, e) {
    e.preventDefault();
    if (skickar) return;                     // ett andra klick gör ingenting
    const B = bildlage();
    if (B.laddar) return;

    inst.status.hidden = true;
    const fel = validera();
    if (fel.length) { visaFel(inst, fel); return; }
    rensaAllaFel(inst);

    if (B.problem) {
      uppdateraKnapp(inst);
      const li = Array.from(inst.bildlista.children).find((x) => x.dataset.status === 'fel' || x.dataset.status === 'valjIgen');
      const knapp = li && (li.querySelector('[data-gor="igen"]:not([hidden])') || li.querySelector('[data-gor="bort"]'));
      if (knapp) knapp.focus();
      return;
    }

    skickar = true;
    instanser.forEach(uppdateraKnapp);
    const ref = utkast.referens;
    const { data, antalBilder } = byggData(inst.form.querySelector('.offert-honung'));

    let lyckades = false;
    try {
      const res = await fetch(W3_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data)
      });
      const svar = await res.json().catch(() => ({}));
      lyckades = !!(res.ok && svar && svar.success === true);
      // Bara statuskoden loggas, aldrig innehållet.
      if (!lyckades) console.warn('Offertformuläret: inskicket misslyckades, status ' + res.status);
    } catch (err) {
      console.warn('Offertformuläret: inskicket misslyckades (nätverk)');
    }
    skickar = false;

    if (lyckades) lyckat(inst, ref, antalBilder);
    else {
      instanser.forEach(uppdateraKnapp);
      visaStatus(inst, FEL_TEXT, false);   // utkastet och bilderna behålls
    }
  }

  function lyckat(inst, ref, antalBilder) {
    rt.forEach((r) => { if (r.tumme) URL.revokeObjectURL(r.tumme); });
    rt.clear();
    ko.length = 0;
    utkast = nyttUtkast();   // nästa förfrågan får en ny referens
    spara();

    instanser.forEach((x) => {
      x.bildinfoText = '';
      x.status.hidden = true;
      rensaAllaFel(x);
      if (x !== inst) visaFormular(x, false);
      hydrera(x);
    });

    inst.tack.innerHTML =
      '<p class="offert-tack-rubrik">Tack! Din förfrågan har skickats.</p>' +
      '<p>Referens: <strong>' + esc(ref) + '</strong></p>' +
      '<p>Vi går igenom underlaget och kontaktar dig med ett prisförslag eller kompletterande frågor. Det här är inte en bokningsbekräftelse.</p>' +
      '<p>Bilder som kom med: ' + antalBilder + '.</p>' +
      '<p>Vill du skicka fler bilder via SMS till <a href="sms:+46705614845">070-561 48 45</a>, ange ' + esc(ref) + '.</p>' +
      '<p class="offert-tack-ny"><button type="button" class="btn btn-ghost" data-gor="ny">Gör en ny förfrågan</button></p>';
    inst.tack.querySelector('[data-gor="ny"]').addEventListener('click', () => {
      visaFormular(inst, true);
    });
    inst.form.hidden = true;
    inst.tack.hidden = false;
    inst.visarTack = true;
    inst.tack.focus();
  }

  function visaFormular(inst, fokus) {
    if (!inst.visarTack) return;
    inst.visarTack = false;
    inst.tack.hidden = true;
    inst.tack.innerHTML = '';
    inst.form.hidden = false;
    hydrera(inst);
    if (fokus) fokusForsta(inst);
  }

  function fokusForsta(inst) {
    const el = inst.visarTack ? inst.tack : inst.form.querySelector('input[data-falt="tjanst"]');
    if (el) el.focus();
    return el;
  }

  /* ---------- Kalkylatorerna ----------
     forifyll({ tjanst, uppskattning }) kryssar i tjänsten och lägger
     uppskattningen i fältet "Kalkylatorns uppskattning". Allt går via
     utkastet i sessionStorage, aldrig via URL:en.
     - Uppskattningen skrivs bara om fältet är tomt eller fortfarande står på
       det en kalkylator senast skrev. Har kunden ändrat det rörs det inte.
     - Tjänsten läggs till utan att något annat avmarkeras. Har kunden valt
       "Vet inte eller annat" lämnas valen orörda: en ikryssning skulle enligt
       exklusivitetsregeln avmarkera kundens eget val. */
  function forifyll(o) {
    o = o || {};
    const kand = TJANSTER.some((t) => t[0] === o.tjanst);
    if (kand && !utkast.tjanster.includes(o.tjanst) && !utkast.tjanster.includes('vetinte')) {
      const ny = new Set(utkast.tjanster.concat(o.tjanst));
      utkast.tjanster = TJANSTER.map((t) => t[0]).filter((t) => ny.has(t));
    }
    if (typeof o.uppskattning === 'string' && o.uppskattning) {
      const nu = typeof utkast.falt.uppskattning === 'string' ? utkast.falt.uppskattning : '';
      if (!nu.trim() || nu === utkast.uppskattningKalk) {
        utkast.falt.uppskattning = o.uppskattning;
        utkast.uppskattningKalk = o.uppskattning;
      }
      utkast.uppskattningVisas = true;
    }
    spara();
    instanser.forEach((x) => {
      if (x.visarTack) visaFormular(x, false);
      hydrera(x);
    });
  }

  /* ---------- Sektionen på startsidan ----------
     Reservformuläret (#contactForm, data-offert-reserv) ersätts direkt. Den
     här filen laddas synkront före script.js i slutet av <body>, så bytet
     sker innan sidan ritas första gången och ingenting blinkar. */
  function monteraSektion() {
    const reserv = document.querySelector('form[data-offert-reserv]');
    if (!reserv) return null;
    const inst = bygg({ suffix: '', kalla: 'sektion' });
    reserv.replaceWith(inst.rot);
    return inst;
  }

  let sektion = null;
  const start = () => { if (!sektion) sektion = monteraSektion(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  /* När dialogen stängs: en bekräftelse i rutan ersätts av ett tomt formulär
     till nästa gång, och övriga rutor (sektionen) uppdateras från utkastet. */
  function stangd(inst) {
    if (inst && inst.visarTack) visaFormular(inst, false);
    instanser.forEach((x) => { if (x !== inst && !x.visarTack) hydrera(x); });
  }

  function oppnad(inst) {
    if (inst.visarTack) visaFormular(inst, false);
    inst.status.hidden = true;
    hydrera(inst);
  }

  window.BBOffert = {
    bygg,            // bygg({ suffix: '-d' }) -> instans; instans.rot sätts in av anroparen
    hydrera,         // fyll en ruta från utkastet
    oppnad,          // anropas när dialogen öppnas
    stangd,          // anropas när dialogen stängs
    forifyll,        // kalkylatorernas brygga
    fokusForsta,     // första fältet (eller bekräftelsen) i en ruta
    utkast: () => JSON.parse(JSON.stringify(utkast)),
    BILD_BAS
  };
})();
