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
  const MAX_HISTORIK = 20;   // samma tak som workern, annars svarar den 400
  const MAX_TECKEN = 2000;   // samma sak per meddelande
  const HALSNING = 'Hej! Jag svarar på frågor om tömning, flytt, bortforsling, demontering och magasinering. Vad kan jag hjälpa dig med?';
  const FELTEXT = 'Något gick fel. Mejla boka@bohagsbolaget.se eller ring 070-561 48 45 så hjälper vi dig.';

  const panel = document.getElementById('chattPanel');
  const flode = document.getElementById('chattFlode');
  const falt = document.getElementById('chattFalt');
  const skicka = document.getElementById('chattSkicka');
  const stang = document.getElementById('chattStang');

  let historik = [];
  let vantar = false;

  function las() {
    try {
      const ratt = sessionStorage.getItem(NYCKEL);
      const lista = ratt ? JSON.parse(ratt) : [];
      return Array.isArray(lista) ? lista : [];
    } catch (e) { return []; }
  }

  function spara() {
    try { sessionStorage.setItem(NYCKEL, JSON.stringify(historik)); } catch (e) {}
  }

  /* textContent, aldrig innerHTML: serverns text ska aldrig kunna tolkas
     som markup. Radbrytningar syns ändå tack vare white-space: pre-wrap. */
  function bubbla(roll, text) {
    const el = document.createElement('div');
    el.className = 'chatt-bubbla chatt-bubbla--' + (roll === 'user' ? 'kund' : 'assistent');
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
    if (!flode.childElementCount) rita();
    tillBotten();
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
    spara();
    bubbla('user', text);
    falt.value = '';
    tillBotten();

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
      const reply = data && data.reply ? String(data.reply) : FELTEXT;

      skriver.remove();
      historik.push({ role: 'assistant', content: reply });
      spara();
      bubbla('assistant', reply);

    } catch (e) {
      /* Frågan ligger kvar i historiken, så kunden kan skriva vidare eller
         ställa om den. Ingen tyst tystnad. */
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
  skicka.addEventListener('click', skickaFraga);

  falt.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); skickaFraga(); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) stangNed();
  });

  historik = las();
  if (historik.length) rita();
}
