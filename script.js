// Bohagsbolaget.se – mobilmeny, priskalkylator, kontaktformulär och scroll-animationer.

/* ---------- Mobilmeny (hamburgare) ---------- */
const toggle = document.getElementById('navToggle');
const nav = document.getElementById('nav');

if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

/* ---------- Header: glaseffekt och scroll-indikator ----------
   Båda delar en enda scroll-lyssnare, throttlad med requestAnimationFrame så
   att layouten läses av högst en gång per bildruta. Saknas headern gör koden
   ingenting – resten av filen ska fungera ändå. */
const siteHeader = document.querySelector('.site-header');

if (siteHeader) {
  let ticking = false;

  const updateHeader = () => {
    const y = window.scrollY;
    siteHeader.classList.toggle('scrolled', y > 50);

    // Hur långt ned på sidan vi kommit, 0–1. Styr bredden på indikatorn.
    const max = document.documentElement.scrollHeight - window.innerHeight;
    siteHeader.style.setProperty('--scroll-progress', max > 0 ? Math.min(y / max, 1) : 0);

    ticking = false;
  };

  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(updateHeader);
    }
  }, { passive: true });

  updateHeader();
}

/* ---------- Tjänstepaneler ----------
   Varje kort öppnar en <dialog> som visas modalt. Elementet ger Esc-stängning
   och fokusfälla av sig självt; här läggs klick utanför, scroll-lås och
   återlämning av fokus till kortet ovanpå. */
const serviceGrid = document.querySelector('.cards-services');
const panels = document.querySelectorAll('.panel');

function initPaneler() {
  if (!serviceGrid || !panels.length) return;
  let lastTrigger = null;

  serviceGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.card[data-panel]');
    if (!card) return;
    const panel = document.getElementById(card.dataset.panel);
    if (!panel || typeof panel.showModal !== 'function' || panel.open) return;

    lastTrigger = card.querySelector('.card-cta') || card;
    panel.showModal();
    document.documentElement.style.overflow = 'hidden';

    const close = panel.querySelector('.panel-close');
    if (close) close.focus();
  });

  // Släpper scroll-låset och lämnar tillbaka fokus. Körs bara när ingen panel
  // är öppen, så att en sen stängning inte låser upp bakom en nyöppnad panel.
  // Idempotent – kan anropas flera gånger för samma stängning.
  const releasePanel = () => {
    if (document.querySelector('.panel[open]')) return;
    document.documentElement.style.overflow = '';
    const trigger = lastTrigger;
    lastTrigger = null;
    if (trigger) trigger.focus();
  };

  const closePanel = (panel) => {
    panel.close();
    releasePanel();
  };

  // Bevakar open-attributet på dialogerna. Slår till både när en panel öppnas
  // och när den stängs – releasePanel avbryter själv så länge någon panel är
  // öppen, så bara den sista stängningen släpper låset.
  const oppetVakt = new MutationObserver(releasePanel);

  panels.forEach((panel) => {
    // Klick på bakgrunden träffar dialogrutan själv, inte innehållet
    panel.addEventListener('click', (e) => {
      if (e.target === panel) closePanel(panel);
    });

    const close = panel.querySelector('.panel-close');
    if (close) close.addEventListener('click', () => closePanel(panel));

    // "Begär offert" leder till formuläret – panelen ska inte ligga kvar över det
    const cta = panel.querySelector('.panel-btn');
    if (cta) cta.addEventListener('click', () => closePanel(panel));

    // Noternas länkar leder vidare på sidan – samma sak där, panelen ska inte
    // ligga kvar över det man klickat sig till
    panel.querySelectorAll('.price-note a[href^="#"]').forEach((link) => {
      link.addEventListener('click', () => closePanel(panel));
    });

    // Esc och webbläsarens egen stängning går inte via closePanel. Dialogens
    // close-händelse levereras inte pålitligt i alla lägen, så låset kopplas
    // till open-attributet i stället: det försvinner vid VARJE stängning,
    // oavsett väg. close-händelsen får ligga kvar som extra sele.
    panel.addEventListener('close', releasePanel);
    oppetVakt.observe(panel, { attributes: true, attributeFilter: ['open'] });
  });
}

/* ---------- Årtal i sidfoten ---------- */
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = '© ' + new Date().getFullYear();

/* ---------- Priskalkylator ----------
   Enda sanningskällan för stegen: knapparna under reglaget byggs härifrån och
   reglagets max sätts efter antalet steg. Lägg till eller ta bort ett steg här
   så följer resten med.
     vol   – volymen, primär avläsning (chippen och knappens etikett)
     part  – motsvarande del av bilen, sekundär förklaringsrad
     fill  – hur högt lasten når i skåpet, 0–1 av skåpets höjd
     desc  – längre beskrivning under priset */
const TIERS = [
  { vol: '2 m³',  part: 'Några få saker',            price: 1295, fill: 0.12,  desc: 'För några få saker, mindre möbler eller lådor.' },
  { vol: '4 m³',  part: 'Cirka en kvarts bil',       price: 2195, fill: 0.25,  desc: 'Passar mindre bohag, förråd eller garage.' },
  { vol: '8 m³',  part: 'Cirka en halv bil',         price: 3495, fill: 0.50,  desc: 'Halva bilen – perfekt för större tömningar.' },
  { vol: '10 m³', part: 'Cirka fem åttondelars bil', price: 4395, fill: 0.625, desc: 'För dig som har mycket som ska bort.' },
  { vol: '12 m³', part: 'Cirka tre kvarts bil',      price: 5195, fill: 0.75,  desc: 'Nästan full bil – för större boenden eller lokaler.' },
  { vol: '16 m³', part: 'En fullastad bil',          price: 6995, fill: 1.00,  desc: 'Fullastad bil – för hela hem, dödsbon eller lokaler.' }
];

const range   = document.getElementById('calcRange');
const loadEl  = document.getElementById('truckLoad');
const labelEl = document.getElementById('calcLabel');
const volEl   = document.getElementById('calcVol');
const priceEl = document.getElementById('calcPrice');
const descEl  = document.getElementById('calcDesc');
const stepsEl = document.getElementById('calcSteps');

function formatPrice(n) {
  return n.toLocaleString('sv-SE').replace(/ /g, ' ') + ' kr';
}

// Bygger stegknapparna ur TIERS så att etiketterna aldrig kan hamna i otakt
// med reglaget. Antalet kolumner skickas till CSS via --steg.
function buildSteps() {
  stepsEl.innerHTML = '';
  stepsEl.style.setProperty('--steg', TIERS.length);

  TIERS.forEach((t, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.i = i;
    b.textContent = t.vol;
    b.setAttribute('aria-pressed', 'false');
    stepsEl.appendChild(b);
  });
}

function renderTier(i) {
  const t = TIERS[i];
  if (!t) return;

  loadEl.style.setProperty('--fill', (t.fill * 100) + '%');
  labelEl.textContent = t.vol;   // primärt: volymen
  volEl.textContent   = t.part;  // sekundärt: motsvarande del av bilen
  descEl.textContent  = t.desc;
  priceEl.textContent = formatPrice(t.price);

  // färgad del av reglaget
  range.style.setProperty('--pct', (i / (TIERS.length - 1)) * 100 + '%');

  stepsEl.querySelectorAll('button').forEach((b) => {
    const on = Number(b.dataset.i) === i;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function initKalkylator() {
  if (!range || !loadEl) return;
  range.max = TIERS.length - 1;
  buildSteps();

  range.addEventListener('input', () => renderTier(Number(range.value)));

  stepsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    range.value = btn.dataset.i;
    renderTier(Number(btn.dataset.i));
  });

  renderTier(Number(range.value));
}

/* ---------- Kontaktformulär (Web3Forms) ----------
   Skickas i bakgrunden så besökaren får svar direkt på sidan i stället för att
   hamna på Web3Forms egen tacksida. Kundens namn blir avsändarnamn och kundens
   e-post blir svarsadress, så att "Svara" i mejlen går rakt till kunden. */
const contactForm = document.getElementById('contactForm');
const formStatus  = document.getElementById('formStatus');
const submitBtn   = document.getElementById('contactSubmit');

const OK_TEXT    = 'Tack! Vi har fått din förfrågan och återkommer så snart vi kan.';
const ERROR_TEXT = 'Något gick fel. Ring oss på 070-343 34 40 eller maila boka@bohagsbolaget.se så hjälper vi dig.';

if (contactForm && formStatus && submitBtn) {
  const showStatus = (text, ok) => {
    formStatus.textContent = text;
    formStatus.classList.toggle('is-ok', ok);
    formStatus.classList.toggle('is-error', !ok);
    formStatus.hidden = false;
  };

  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = Object.fromEntries(new FormData(contactForm).entries());

    // "redirect" används bara när JavaScript är av – skickas den med här
    // svarar Web3Forms med en omdirigering i stället för JSON.
    delete data.redirect;

    // Svar på mejlet ska gå till kunden, inte till oss själva.
    data.from_name = (data.name || '').trim() || 'Bohagsbolaget.se – webbformulär';
    data.replyto   = (data.email || '').trim() || 'boka@bohagsbolaget.se';

    const originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Skickar…';
    formStatus.hidden = true;

    try {
      const res = await fetch(contactForm.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json().catch(() => ({}));

      if (res.ok && result.success) {
        contactForm.reset();
        showStatus(OK_TEXT, true);
      } else {
        // Serverns egen text visas inte för besökaren – den säger inget
        // användbart för en kund. Den loggas i stället för felsökning.
        console.error('Web3Forms:', res.status, result.message || '');
        showStatus(ERROR_TEXT, false);
      }
    } catch (err) {
      console.error('Web3Forms:', err);
      showStatus(ERROR_TEXT, false);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });
}

/* ---------- Scroll-animationer ---------- */
const revealEls = document.querySelectorAll('.reveal');

if ('IntersectionObserver' in window && revealEls.length) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

  revealEls.forEach((el) => io.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add('in'));
}

/* ---------- Parallax på hero ----------
   Bakgrundslagret förflyttas nedåt och skalas upp svagt medan hero-innehållet
   tonar ut. Allt är bundet direkt till scrollpositionen – ingen easing och
   ingen eftersläpning, så rörelsen följer fingret exakt.

   Det är .hero-media som transformeras, aldrig bilden: object-fit räknas mot
   elementets egen storlek, så en scale() på <img> hade tänjt motivet i stället
   för att zooma det. Gradientlagren ligger kvar på sektionen och står stilla.

   Ingen tom yta kan uppstå. Vid progress p har sektionen rullat p gånger sin
   egen höjd uppåt, medan lagret bara flyttats 0,25 × höjden nedåt – remsan som
   blottas i sektionens överkant hamnar alltid ovanför viewportens kant, och
   nederkanten klipps av overflow: hidden på .hero. */
const heroSektion = document.querySelector('.hero');
const heroLager = document.querySelector('.hero-media');
const heroInnehall = document.querySelector('.hero-inner');

if (heroSektion && heroLager && heroInnehall) {
  const FORFLYTTNING = 0.25;   // andel av lagrets höjd vid full progress
  const SKALA = 0.10;          // 1 → 1,10
  const UTTONAD_VID = 0.6;     // innehållet helt uttonat vid 60 % av sträckan

  // Ett CSS-mediavillkor når inte inline-stilar satta härifrån, så vi frågar
  // om reducerad rörelse i JavaScript och lyssnar på ändringar.
  const rorelse = window.matchMedia('(prefers-reduced-motion: reduce)');

  let vantar = false;      // spärr: högst en bildruta i kö åt gången
  let lyssnar = false;
  let klickAv = false;

  const nollstall = () => {
    heroLager.style.transform = '';
    heroInnehall.style.opacity = '';
    heroInnehall.style.pointerEvents = '';
    klickAv = false;
  };

  const uppdatera = () => {
    vantar = false;

    const ruta = heroSektion.getBoundingClientRect();
    // Utanför vy: rör ingenting alls. En inaktuell transform kan inte synas
    // när sektionen inte är på skärmen, och vi slipper räkna i onödan.
    if (ruta.bottom <= 0 || ruta.top >= window.innerHeight) return;

    const hojd = ruta.height || 1;
    // 0 när sektionens överkant når viewportens topp,
    // 1 när nederkanten gör det.
    let p = -ruta.top / hojd;
    if (p < 0) p = 0;
    else if (p > 1) p = 1;

    // Endast transform och opacity skrivs – aldrig något som utlöser omflöde.
    const flytt = FORFLYTTNING * hojd * p;
    const skala = 1 + SKALA * p;
    heroLager.style.transform =
      'translate3d(0,' + flytt.toFixed(2) + 'px,0) scale(' + skala.toFixed(4) + ')';

    let opacitet = 1 - p / UTTONAD_VID;
    if (opacitet < 0) opacitet = 0;
    heroInnehall.style.opacity = opacitet.toFixed(3);

    // Uttonat innehåll ska inte gå att klicka på – knapparna ligger annars
    // kvar som osynliga träffytor över sektionen.
    const skaVaraAv = opacitet === 0;
    if (skaVaraAv !== klickAv) {
      heroInnehall.style.pointerEvents = skaVaraAv ? 'none' : 'auto';
      klickAv = skaVaraAv;
    }
  };

  const begar = () => {
    if (vantar) return;
    vantar = true;
    window.requestAnimationFrame(uppdatera);
  };

  const stallOm = () => {
    if (rorelse.matches) {
      if (lyssnar) {
        window.removeEventListener('scroll', begar);
        window.removeEventListener('resize', begar);
        lyssnar = false;
      }
      nollstall();
      return;
    }
    if (!lyssnar) {
      window.addEventListener('scroll', begar, { passive: true });
      window.addEventListener('resize', begar, { passive: true });
      lyssnar = true;
    }
    begar();
  };

  if (rorelse.addEventListener) {
    rorelse.addEventListener('change', stallOm);
  } else if (rorelse.addListener) {
    // Safari före 14
    rorelse.addListener(stallOm);
  }

  stallOm();
}

/* ---------- Uppskjuten initiering ----------
   Tjänstepanelerna och priskalkylatorn syns inte på första skärmen, men deras
   uppsättning är det tyngsta script.js gör: tio dialogrutor med fokushantering,
   scroll-lås och ARIA-koppling, plus sex knappar som byggs ur TIERS. Kört direkt
   låg det i vägen för hero-renderingen. Nu väntar det tills huvudtråden är ledig.

   requestIdleCallback med timeout: 1000 garanterar att det körs inom en sekund
   även om tråden aldrig blir riktigt ledig. setTimeout är reserv för Safari,
   som saknar requestIdleCallback.

   Mobilmenyn, headern och hero-parallaxen initieras INTE härifrån – de hör till
   första skärmen och ska svara direkt. */
const narDetArLugnt = (fn) => {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(fn, { timeout: 1000 });
  } else {
    setTimeout(fn, 150);
  }
};

narDetArLugnt(() => {
  initPaneler();
  initKalkylator();
});

/* ---------- Chattwidget – svarsassistenten ----------
   Historiken lever i minnet och speglas i sessionStorage, så att den
   överlever att kunden byter sida men försvinner när fliken stängs.
   Öppningshälsningen är bara visuell och skickas aldrig till servern. */
const chattKnapp = document.getElementById('chattKnapp');

if (chattKnapp) {
  const ENDPOINT = 'https://bohagsbolaget-assistent.bohagsbolaget-se.workers.dev';
  const NYCKEL = 'bb_chatt_historik';
  const KO_NYCKEL = 'bb_chatt_ko';        // localStorage: överlever att fliken stängs
  const MAX_HISTORIK = 20;   // samma tak som workern, annars svarar den 400
  const MAX_TECKEN = 2000;   // samma sak per meddelande
  const MAX_FORSOK = 10;
  const HALSNING = 'Hej! Jag svarar på frågor om tömning, flytt, bortforsling, demontering och magasinering. Vad kan jag hjälpa dig med?';
  const FELTEXT = 'Något gick fel. Mejla boka@bohagsbolaget.se eller ring 070-561 48 45 så hjälper vi dig.';
  /* Samma nyckel och samma faltnamn som kontaktformularet i index.html.
     Sandningen sker fran besokarens egen webblasare: workern gar ut fran
     Cloudflares delade IP-adresser och blir alltid rate limitad av
     Web3Forms. Besokarens egen IP har ingen sadan sparr. */
  const W3_URL = 'https://api.web3forms.com/submit';
  const W3_NYCKEL = 'a5ea7bbf-870d-4db3-9a82-d8e5283fa26e';
  const SANT = 'Förfrågan skickad till Fredrik.';
  const AVSLUTAT = 'Samtalet är avslutat. Skriv gärna om du har fler frågor.';
  const NOTERAT = 'Jag noterar det här och ser till att Fredrik får det.';
  /* Tva timmar. Aterkommer kunden senare an sa ar det ett nytt arende,
     och assistenten ska inte blanda ihop det med ett avslutat. */
  const LIVSLANGD = 2 * 60 * 60 * 1000;
  const INAKTIV = 5 * 60 * 1000;

  const panel = document.getElementById('chattPanel');
  const flode = document.getElementById('chattFlode');
  const falt = document.getElementById('chattFalt');
  const skicka = document.getElementById('chattSkicka');
  const stang = document.getElementById('chattStang');
  const omstart = document.getElementById('chattOmstart');

  let historik = [];
  let vantar = false;
  /* Allt som ror leadet. Speglas i sessionStorage tillsammans med historiken
     sa att A och B inte kan skickas om efter en omladdning. */
  let lage = nyttLage();
  let inaktivTimer = null;

  function nyttId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function nyttLage() {
    return { id: nyttId(), aSkickat: false, bSkickat: false, telefon: '', epost: '', namn: '' };
  }

  /* ---------- deterministisk detektering ----------
     Kunden avgor om samtalet ar ett lead, inte modellen. Lamnar hon ett
     telefonnummer eller en mejladress ar det ett lead, oavsett vad
     assistenten sedan sager eller later bli att gora. */
  function hittaTelefon(text) {
    const kandidater = String(text).match(/(?:\+?\d[\d\s\-()]{5,}\d)/g) || [];
    for (const rad of kandidater) {
      const siffror = rad.replace(/[^\d]/g, '');
      if (siffror.length >= 7) return rad.replace(/\s+/g, ' ').trim();
    }
    return '';
  }

  function hittaEpost(text) {
    const traff = String(text).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    return traff ? traff[0] : '';
  }

  /* ---------- lagring ---------- */
  function las() {
    try {
      const ratt = sessionStorage.getItem(NYCKEL);
      if (!ratt) return null;
      const paket = JSON.parse(ratt);
      if (!paket || !Array.isArray(paket.historik) || typeof paket.tid !== 'number') return null;
      if (Date.now() - paket.tid > LIVSLANGD) return null;
      return paket;
    } catch (e) { return null; }
  }

  function spara() {
    try {
      sessionStorage.setItem(NYCKEL, JSON.stringify({ tid: Date.now(), historik: historik, lage: lage }));
    } catch (e) {}
  }

  /* Bada eller ingen. Rensas bara lagringen ligger minnesarrayen kvar och
     foljer med i nasta anrop - den klassiska buggen har. */
  function tomHistorik() {
    historik = [];
    lage = nyttLage();
    try { sessionStorage.removeItem(NYCKEL); } catch (e) {}
  }

  /* ---------- ko som overlever fel ----------
     localStorage, inte sessionStorage: en post som inte kom ivag ska ligga
     kvar aven om kunden stanger fliken och kommer tillbaka i morgon. */
  function lasKo() {
    try {
      const ratt = localStorage.getItem(KO_NYCKEL);
      const lista = ratt ? JSON.parse(ratt) : [];
      return Array.isArray(lista) ? lista : [];
    } catch (e) { return []; }
  }

  function sparaKo(ko) {
    try { localStorage.setItem(KO_NYCKEL, JSON.stringify(ko)); } catch (e) {}
  }

  function koa(kropp) {
    const ko = lasKo();
    ko.push({ kropp: kropp, forsok: 0 });
    sparaKo(ko);
  }

  /* Postar en kropp. Returnerar true bara vid bekraftat 2xx. */
  async function posta(kropp) {
    const svar = await fetch(W3_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(kropp)
    });
    if (!svar.ok) throw new Error('Web3Forms svarade ' + svar.status);
    return true;
  }

  /* Tommer kon. En post som misslyckas raknas upp och ligger kvar tills den
     provats MAX_FORSOK ganger. Kon skrivs om fran den fardiga listan, sa en
     post kan aldrig forsvinna for att en annan lyckades. */
  async function tomKo() {
    let ko = lasKo();
    if (!ko.length) return;
    const kvar = [];
    for (const post of ko) {
      if (post.forsok >= MAX_FORSOK) { kvar.push(post); continue; }
      try {
        await posta(post.kropp);
      } catch (e) {
        post.forsok = (post.forsok || 0) + 1;
        kvar.push(post);
      }
    }
    sparaKo(kvar);
  }

  /* ---------- utskicken ---------- */
  function samtalsText() {
    const rader = [];
    for (const m of historik) {
      rader.push((m.role === 'user' ? 'Kund: ' : 'Assistent: ') + m.content);
    }
    return rader.join('\n\n');
  }

  function byggKropp(amne, forfragan) {
    let message = '';
    if (forfragan) {
      message += 'SAMMANFATTNING FRÅN ASSISTENTEN\n';
      message += 'Namn: ' + (forfragan.namn || '') + '\n';
      message += 'Telefon: ' + (forfragan.telefon || '') + '\n';
      message += 'E-post: ' + (forfragan.epost || '') + '\n';
      message += 'Tjänst: ' + (forfragan.tjanst || '') + '\n';
      message += 'Ort: ' + (forfragan.ort || '') + '\n';
      message += 'Kundtyp: ' + (forfragan.kundtyp || '') + '\n';
      message += 'Beskrivning: ' + (forfragan.beskrivning || '') + '\n\n';
    }
    /* Hela samtalet foljer alltid med, aven nar verktyget fungerat. Fredrik
       ska kunna lasa vad kunden faktiskt skrev, inte bara modellens referat. */
    message += 'HELA SAMTALET\n' + samtalsText();

    const namn = String((forfragan && forfragan.namn) || lage.namn || '');
    return {
      access_key: W3_NYCKEL,
      subject: amne + ' [' + lage.id + ']',
      from_name: namn || 'Chatten på bohagsbolaget.se',
      replyto: lage.epost || 'boka@bohagsbolaget.se',
      name: namn,
      email: lage.epost || '',
      phone: lage.telefon || '',
      message: message
    };
  }

  /* Utskick A: sa fort en kontaktuppgift dyker upp. Sakrar leadet aven om
     kunden stanger fliken i nasta sekund. Hogst en gang per samtal. */
  async function skickaA() {
    if (lage.aSkickat) return false;
    lage.aSkickat = true;
    spara();
    const kropp = byggKropp('Chatt: pågående förfrågan', null);
    await tomKo();
    try {
      await posta(kropp);
      return true;
    } catch (e) {
      console.error('Utskick A kunde inte skickas, lagt i kö:', e && e.message ? e.message : e);
      koa(kropp);
      return false;
    }
  }

  /* Utskick B: samtalet komplett. Hogst en gang per samtal. */
  async function skickaB(forfragan) {
    if (lage.bSkickat) return false;
    if (!historik.length) return false;
    lage.bSkickat = true;
    spara();
    const kropp = byggKropp('Chatt: komplett samtal', forfragan || null);
    await tomKo();
    try {
      await posta(kropp);
      return true;
    } catch (e) {
      console.error('Utskick B kunde inte skickas, lagt i kö:', e && e.message ? e.message : e);
      koa(kropp);
      return false;
    }
  }

  /* Sidan lamnas: sendBeacon overlever navigeringen, fetch gor det inte. */
  function skickaBViaBeacon() {
    if (lage.bSkickat || !historik.length || !(lage.telefon || lage.epost)) return;
    lage.bSkickat = true;
    spara();
    const kropp = byggKropp('Chatt: komplett samtal', null);
    try {
      const blob = new Blob([JSON.stringify(kropp)], { type: 'application/json' });
      if (!navigator.sendBeacon(W3_URL, blob)) koa(kropp);
    } catch (e) {
      koa(kropp);
    }
  }

  function nollstallInaktiv() {
    if (inaktivTimer) clearTimeout(inaktivTimer);
    inaktivTimer = setTimeout(() => {
      if (lage.telefon || lage.epost) skickaB(null);
    }, INAKTIV);
  }

  /* ---------- sanningskrav ----------
     Widgeten far aldrig aterge ett pastaende om att nagot skickats som den
     inte sjalv verifierat. Modellen sager det ibland utan tackning. */
  const SKICKAT_MONSTER = /(skickar|skickat|skickad|har skickats|vidarebefordrat|vidarebefordrar|hör av sig|hor av sig|är på väg|noterat och skickat)/i;

  function sanningsfiltrera(text, bekraftat) {
    if (bekraftat) return text;
    const stycken = String(text).split(/\n{2,}/);
    const rensade = stycken.map((stycke) => {
      const meningar = stycke.split(/(?<=[.!?])\s+/);
      const kvar = meningar.filter((m) => !SKICKAT_MONSTER.test(m));
      if (kvar.length === meningar.length) return stycke;
      const bevarat = kvar.join(' ').trim();
      return bevarat ? bevarat + ' ' + NOTERAT : NOTERAT;
    });
    const ut = rensade.join('\n\n').trim();
    return ut || NOTERAT;
  }

  /* ---------- rendering ---------- */
  function bubbla(roll, text) {
    const el = document.createElement('div');
    el.className = 'chatt-bubbla chatt-bubbla--' + (roll === 'user' ? 'kund' : 'assistent');
    el.textContent = text;
    flode.appendChild(el);
    return el;
  }

  function systemrad(text) {
    const el = document.createElement('div');
    el.className = 'chatt-system';
    el.textContent = text;
    flode.appendChild(el);
    return el;
  }

  function tillBotten() {
    flode.scrollTop = flode.scrollHeight;
  }

  function rita() {
    flode.textContent = '';
    bubbla('assistant', HALSNING);
    for (const m of historik) bubbla(m.role, m.content);
    tillBotten();
  }

  function visaSkriver() {
    const el = document.createElement('div');
    el.className = 'chatt-skriver';
    el.id = 'chattSkriver';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<span></span><span></span><span></span>';
    flode.appendChild(el);
    tillBotten();
    return el;
  }

  function oppna() {
    panel.hidden = false;
    chattKnapp.hidden = true;

    /* Lagringen avgor vad som visas. Ar den tom har samtalet antingen
       avslutats, rensats, eller hunnit bli aldre an livslangden - i alla tre
       fallen borjar vi om med bara halsningen, utan forklaring. */
    const paket = las();
    if (!paket || !paket.historik.length) {
      tomHistorik();
      flode.textContent = '';
    } else {
      historik = paket.historik;
      if (paket.lage) lage = paket.lage;
    }

    if (!flode.childElementCount) rita();
    tillBotten();
    falt.focus();
  }

  async function borjaOm() {
    if (lage.telefon || lage.epost) await skickaB(null);
    tomHistorik();
    flode.textContent = '';
    rita();
    falt.focus();
  }

  function stangNed() {
    panel.hidden = true;
    chattKnapp.hidden = false;
    chattKnapp.focus();
  }

  async function skickaFraga() {
    const text = falt.value.trim();
    if (!text || vantar) return;

    historik.push({ role: 'user', content: text.slice(0, MAX_TECKEN) });

    /* Deterministisk detektering, fore allt annat. Beslutet fattas har,
       aldrig av modellen. */
    if (!lage.telefon) lage.telefon = hittaTelefon(text);
    if (!lage.epost) lage.epost = hittaEpost(text);
    spara();

    bubbla('user', text);
    falt.value = '';
    tillBotten();
    nollstallInaktiv();

    /* Utskick A gar ivag direkt, utan att invanta modellen. */
    let bekraftat = false;
    if ((lage.telefon || lage.epost) && !lage.aSkickat) {
      bekraftat = await skickaA();
      if (bekraftat) { systemrad(SANT); tillBotten(); }
    }

    vantar = true;
    skicka.disabled = true;
    const skriver = visaSkriver();

    try {
      const svar = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historik.slice(-MAX_HISTORIK) })
      });
      if (!svar.ok) throw new Error('Status ' + svar.status);
      const data = await svar.json();
      const rasvar = data && data.reply ? String(data.reply) : FELTEXT;

      skriver.remove();
      historik.push({ role: 'assistant', content: rasvar });
      spara();

      const forfragan = (data && data.forfragan && typeof data.forfragan === 'object') ? data.forfragan : null;
      if (forfragan && forfragan.namn) { lage.namn = String(forfragan.namn); spara(); }

      /* Verktyget anropat = samtalet avslutas. Utskick B far den strukturerade
         sammanfattningen med sig, plus hela samtalet. */
      let levererat = lage.aSkickat && bekraftat;
      if (forfragan) {
        levererat = (await skickaB(forfragan)) || levererat;
      }

      bubbla('assistant', sanningsfiltrera(rasvar, levererat));

      if (forfragan) {
        if (levererat) systemrad(SANT);
        systemrad(AVSLUTAT);
        tomHistorik();
      }

    } catch (e) {
      skriver.remove();
      bubbla('assistant', FELTEXT);
    } finally {
      vantar = false;
      skicka.disabled = false;
      tillBotten();
      falt.focus();
    }
  }

  chattKnapp.addEventListener('click', oppna);
  stang.addEventListener('click', stangNed);
  omstart.addEventListener('click', borjaOm);
  skicka.addEventListener('click', skickaFraga);

  falt.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); skickaFraga(); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) stangNed();
  });

  window.addEventListener('pagehide', skickaBViaBeacon);

  const start = las();
  if (start) {
    historik = start.historik;
    if (start.lage) lage = start.lage;
  }
  if (historik.length) rita();
  tomKo();
}
