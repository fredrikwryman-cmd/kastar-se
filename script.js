// Kastar.se – mobilmeny, priskalkylator, kontaktformulär och scroll-animationer.

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

/* ---------- Årtal i sidfoten ---------- */
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = '© ' + new Date().getFullYear();

/* ---------- Priskalkylator ----------
   Enda sanningskällan för stegen: knapparna under reglaget byggs härifrån och
   reglagets max sätts efter antalet steg. Lägg till eller ta bort ett steg här
   så följer resten med.
     vol   – volymen, primär avläsning (chippen och knappens etikett)
     part  – motsvarande del av bilen, sekundär förklaringsrad
     fill  – hur mycket av lastutrymmet i SVG:n som färgas
     desc  – längre beskrivning under priset */
const TIERS = [
  { vol: '2 m³',  part: 'Några få saker',            price: 1695, fill: 0.12,  desc: 'För några få saker, mindre möbler eller lådor.' },
  { vol: '4 m³',  part: 'Cirka en kvarts bil',       price: 2695, fill: 0.25,  desc: 'Passar mindre bohag, förråd eller garage.' },
  { vol: '8 m³',  part: 'Cirka en halv bil',         price: 4195, fill: 0.50,  desc: 'Halva bilen – perfekt för större tömningar.' },
  { vol: '10 m³', part: 'Cirka fem åttondelars bil', price: 5195, fill: 0.625, desc: 'För dig som har mycket som ska bort.' },
  { vol: '12 m³', part: 'Cirka tre kvarts bil',      price: 5995, fill: 0.75,  desc: 'Nästan full bil – för större boenden eller lokaler.' },
  { vol: '16 m³', part: 'En fullastad bil',          price: 7795, fill: 1.00,  desc: 'Fullastad bil – för hela hem, dödsbon eller lokaler.' }
];

const BOX_WIDTH = 196; // bredd på lastutrymmet i SVG-koordinater

const range   = document.getElementById('calcRange');
const fillEl  = document.getElementById('truckFill');
const labelEl = document.getElementById('calcLabel');
const volEl   = document.getElementById('calcVol');
const priceEl = document.getElementById('calcPrice');
const descEl  = document.getElementById('calcDesc');
const stepsEl = document.getElementById('calcSteps');
const rutEl   = document.getElementById('calcRutPrice');

// Halva priset, avrundat uppåt till närmaste 5-tal.
function rutPrice(n) {
  return Math.ceil((n / 2) / 5) * 5;
}

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

  fillEl.setAttribute('width', (BOX_WIDTH * t.fill).toFixed(1));
  labelEl.textContent = t.vol;   // primärt: volymen
  volEl.textContent   = t.part;  // sekundärt: motsvarande del av bilen
  descEl.textContent  = t.desc;
  priceEl.textContent = formatPrice(t.price);
  if (rutEl) rutEl.textContent = 'efter RUT: ' + formatPrice(rutPrice(t.price));

  // färgad del av reglaget
  range.style.setProperty('--pct', (i / (TIERS.length - 1)) * 100 + '%');

  stepsEl.querySelectorAll('button').forEach((b) => {
    const on = Number(b.dataset.i) === i;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

if (range && fillEl) {
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
    data.from_name = (data.name || '').trim() || 'Kastar.se – webbformulär';
    data.replyto   = (data.email || '').trim() || 'boka@kastar.se';

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
        showStatus('Tack! Din förfrågan är skickad – vi hör av oss inom kort.', true);
      } else {
        showStatus(
          (result.message ? result.message + ' ' : '') +
          'Något gick fel. Ring gärna Thom på 070-343 34 40 eller Fredrik på 070-561 48 45, eller maila boka@kastar.se.',
          false
        );
      }
    } catch (err) {
      showStatus('Kunde inte skicka just nu. Ring Thom 070-343 34 40 eller Fredrik 070-561 48 45, eller maila boka@kastar.se.', false);
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
