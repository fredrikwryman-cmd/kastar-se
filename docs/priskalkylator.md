# Priskalkylatorn på Kastar.se – fullständig dokumentation

Detta dokument beskriver **enbart priskalkylatorn** (sektionen `#priser` med den
lastbil som fylls). Allt annat på sajten – hero, tjänstekort, omdömen, formulär,
sidfot – lämnas därhän utom där det direkt påverkar kalkylatorn.

Syftet är att kalkylatorn ska gå att **återskapa fristående** och att
vidareutveckla utan att gissa. All kod nedan är ordagrant kopierad ur filerna,
inget är förkortat.

**Referenspunkt:** commit `cefff7e` ("Korrekta RUT-formuleringar, lagad sidfot och
rensade dubbletter"), branch `main`. Radnummer som anges gäller den commiten.

---

## 0. Snabborientering

| Fil | Vad den bidrar med | Rader |
|---|---|---|
| `index.html` | Hela sektionen `#priser`: SVG-lastbilen, avläsningen, reglaget, den tomma behållaren för knapparna, RUT-rutan | 229–347 |
| `styles.css` | Kalkylatorkortet, lastbilens färger, reglaget, knapparna, avläsningen, responsiva regler | 283–315, 362–439, 480–485, 492–496, 523 |
| `script.js` | `TIERS`, `buildSteps()`, `renderTier()`, händelselyssnare, RUT-logik | 1–137 |

Tre saker är värda att veta innan man läser vidare:

1. **`TIERS` i `script.js` är enda sanningskällan för stegen.** Storleksknapparna
   finns inte i HTML – de byggs av JavaScript ur `TIERS`. Reglagets `max` sätts
   också av JavaScript ur `TIERS.length`.
2. **Bilens fyllnad är ett `width`-attribut på en `<rect>`**, inget annat. Ingen
   canvas, inget bibliotek, ingen animation i JS – animationen är en CSS-transition
   på `width`.
3. **Skriptet laddas sist i `<body>`** (`index.html:532`, `<script src="script.js?v=4"></script>`)
   utan `defer`. Därför kan `script.js` köra `document.getElementById(...)` rakt av
   på toppnivå – DOM:en är redan byggd när skriptet körs. Flyttar man script-taggen
   upp i `<head>` slutar kalkylatorn fungera om man inte lägger till `defer`.

---

## 1. FULLSTÄNDIG KOD

### 1.1 HTML – hela sektionen `#priser`

Ur `index.html`, rad 229–347 (kommentarsraden 229 tas med för sammanhangets skull;
själva sektionen börjar på rad 230 och slutar med `</section>` på rad 347).

```html
    <!-- ============ PRISKALKYLATOR ============ -->
    <section class="section section-price" id="priser">
      <div class="container">
        <div class="section-head reveal">
          <p class="eyebrow">Priser</p>
          <h2>Hur mycket vill du bli av med?</h2>
          <p class="lead">Du betalar efter <strong>hur mycket plats</strong> dina saker tar i bilen.</p>
        </div>

        <div class="calc reveal">
          <!-- Lastbil som fylls -->
          <div class="calc-truck">
            <svg viewBox="0 0 320 150" role="img" aria-label="Lastbil som fylls beroende på vald mängd">
              <!-- lastutrymme -->
              <rect class="truck-box" x="108" y="26" width="200" height="76" rx="4" />
              <!-- fyllnad -->
              <clipPath id="boxClip"><rect x="110" y="28" width="196" height="72" rx="3" /></clipPath>
              <g clip-path="url(#boxClip)">
                <rect id="truckFill" class="truck-fill" x="110" y="28" width="0" height="72" />
              </g>
              <!-- hytt -->
              <path class="truck-cab" d="M104 102 V54 H70 L44 74 v28 Z" />
              <rect class="truck-window" x="60" y="60" width="26" height="18" rx="3" />
              <!-- chassi -->
              <rect class="truck-chassis" x="40" y="102" width="268" height="8" rx="3" />
              <!-- hjul -->
              <circle class="truck-wheel" cx="88" cy="118" r="15" />
              <circle class="truck-hub"   cx="88" cy="118" r="6" />
              <circle class="truck-wheel" cx="250" cy="118" r="15" />
              <circle class="truck-hub"   cx="250" cy="118" r="6" />
            </svg>
            <!-- Texterna nedan är bara startvärden – script.js skriver över dem
                 direkt vid laddning utifrån TIERS. -->
            <div class="calc-readout">
              <span class="calc-label" id="calcLabel">8 m³</span>
              <span class="calc-vol"   id="calcVol">Cirka en halv bil</span>
              <span class="calc-from">Från</span>
              <span class="calc-price" id="calcPrice">4 195 kr</span>
              <!-- Döljs tills RUT_LABOUR_SHARE i script.js är satt -->
              <span class="rut-price" id="calcRutPrice" hidden></span>
              <span class="calc-desc"  id="calcDesc">Halva bilen – perfekt för större tömningar.</span>
            </div>
          </div>

          <!-- Reglage -->
          <label class="sr-only" for="calcRange">Välj hur mycket som ska bort</label>
          <input class="calc-range" id="calcRange" type="range" min="0" max="5" step="1" value="2" />

          <!-- Knapparna byggs av script.js ur TIERS – en enda sanningskälla -->
          <div class="calc-steps" id="calcSteps"></div>

          <a href="#kontakt" class="btn btn-primary btn-calc">Få fast pris – skicka bilder</a>
        </div>

        <div class="rut-info">
          <h3>💡 Visste du? Du kan använda RUT-avdrag</h3>
          <p>Våra tjänster är godkända för RUT-avdrag. Det innebär att du drar av 50 % av arbetskostnaden — alltså den del av priset som avser arbetstid, inte transport, fordon eller avfallsavgifter. Vi sköter pappersarbetet, du anger bara ditt personnummer.</p>
          <!-- TODO: Beloppstaket per person och år är medvetet utelämnat.
               Reglerna ändrades inför 2026 och siffran är inte verifierad.
               Lägg tillbaka först när aktuellt tak är bekräftat hos Skatteverket. -->
        </div>

        <!-- Trust-rad -->
        <div class="trust reveal">
          <div class="trust-item">
            <div class="trust-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20c0-8.8 7.2-16 16-16 0 8.8-7.2 16-16 16Z"/><path d="M4 20c2.5-5 6-8.5 11-11"/></svg>
            </div>
            <h3>Återbruk &amp; återvinning</h3>
            <p>Vi sorterar och återanvänder så mycket som möjligt.</p>
          </div>

          <div class="trust-item">
            <div class="trust-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5.5c0 4.3-2.9 7.6-7 8.5-4.1-.9-7-4.2-7-8.5V6l7-3Z"/><path d="m9 12 2 2 4-4"/></svg>
            </div>
            <h3>Tryggt &amp; försäkrat</h3>
            <p>F-skatt, ansvarsförsäkring och nöjda kunder.</p>
          </div>

          <div class="trust-item">
            <div class="trust-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.2l3.2 2"/></svg>
            </div>
            <h3>Snabb &amp; flexibel service</h3>
            <p>Vi kommer när det passar dig – ofta inom 24–48 h.</p>
          </div>

          <div class="trust-item">
            <div class="trust-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/></svg>
            </div>
            <h3>Vi finns i</h3>
            <p>Stockholm, Uppsala med omnejd.</p>
          </div>
        </div>

        <!-- Så går det till -->
        <div class="steps reveal">
          <div class="step">
            <span class="step-num">1</span>
            <h3>Skicka bilder</h3>
            <p>Skicka några bilder på det som ska bort via sms eller formulär.</p>
          </div>
          <div class="step">
            <span class="step-num">2</span>
            <h3>Få pris direkt</h3>
            <p>Vi uppskattar mängden och ger dig ett fast pris innan vi kommer.</p>
          </div>
          <div class="step">
            <span class="step-num">3</span>
            <h3>Vi fixar resten</h3>
            <p>Vi bär, lastar, sorterar och tar hand om allt – du slipper jobbet.</p>
          </div>
        </div>

        <p class="price-note reveal">Priserna är frånpriser inklusive moms. Extra kostnad kan tillkomma vid mycket tungt material, långa bäravstånd, många trappor eller särskilda avfallsavgifter.</p>
      </div>
    </section>
```

Not: `.trust`, `.steps` och `.price-note` ligger inne i sektionen men är
**inte** en del av kalkylatorn – de är statiskt innehåll. Själva kalkylatorn är
`div.calc` (rad 238–281) plus `div.rut-info` (283–289).

Skriptet laddas i botten av dokumentet, `index.html:532`:

```html
  <script src="script.js?v=4"></script>
```

och stilmallen i `<head>`, `index.html:137`:

```html
  <link rel="stylesheet" href="styles.css?v=4" />
```

(`?v=4` är cache-busting; höj siffran när du deployar ändrad CSS/JS, annars kan
GitHub Pages-cachen servera gammal fil.)

---

### 1.2 CSS

All CSS nedan är ordagrant ur `styles.css`. Blocken kommer i filens ordning.

#### 1.2.1 Färgvariabler som kalkylatorn använder (`:root`, rad 11–34)

Kalkylatorn refererar `--petrol`, `--orange`, `--orange-hover`, `--line`, `--bg`,
`--bg-card`, `--ink`, `--body-c`, `--muted`, `--on-dark`, `--on-dark-body`,
`--radius-card`, `--shadow`. Hela blocket tas med så att kalkylatorn går att lyfta
ut fristående:

```css
:root {
  /* Palett från www.kastar.se (custom-palette-1, HSL→hex) */
  --petrol:       #0E3A44;  /* sektionsbakgrund mörk */
  --petrol-rgb:   14, 58, 68; /* samma färg som --petrol, för overlay med alfa */
  --petrol-deep:  #092F38;  /* footer / djupare ton */
  --petrol-black: #00242E;
  --orange:       #E8862E;  /* knappfärg (secondary-tonen på sidan) */
  --orange-hover: #D9731A;
  --orange-badge: #ED7D31;  /* citatbubbla i omdömen */
  --bg:           #FAF5EF;  /* krämvit sektionsbakgrund */
  --bg-card:      #FFFFFF;
  --line:         #E5DED6;

  --ink:          #111111;  /* svarta rubriker på ljus botten */
  --body-c:       #3A4A50;
  --muted:        #6E7B81;
  --on-dark:      #FFFFFF;
  --on-dark-body: #E7EEF0;

  --radius-btn:   4px;      /* nästan raka hörn som originalet */
  --radius-card:  10px;
  --shadow:  0 8px 20px rgba(0, 36, 46, 0.08);
  --maxw:    1160px;
}
```

#### 1.2.2 RUT-blocket och RUT-raden i avläsningen (rad 283–315)

```css
/* RUT-avdrag – exakt samma bredd och rundning som kalkylatorkortet ovanför,
   annars sticker blocket ut 110px åt vardera hållet på desktop */
.rut-info {
  max-width: 900px;
  margin: 2.5rem auto 0;
  background: var(--petrol);
  color: var(--on-dark);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow);
  padding: 2rem 2.5rem;
  text-align: center;
}
.rut-info h3 {
  color: var(--on-dark);
  text-transform: none;
  font-size: 1.3rem;
  margin-bottom: .75rem;
}
.rut-info p {
  color: var(--on-dark-body);
  max-width: 640px;
  margin: 0 auto;
  font-size: .95rem;
}
.rut-price {
  display: block;
  font-size: .82rem;
  font-weight: 600;
  color: var(--orange);
  margin-top: .25rem;
}
/* display:block ovan slår annars ut webbläsarens [hidden]-regel */
.rut-price[hidden] { display: none; }
```

#### 1.2.3 Hela kalkylator-blocket (rad 362–439)

```css
/* ==========================================================================
   Priskalkylator – interaktiv lastbil
   ========================================================================== */

.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}

.section-price { background: var(--bg); }
.section-price .lead { color: var(--body-c); }
.section-price .lead strong { color: var(--orange-hover); }

.calc {
  max-width: 900px; margin: 0 auto;
  background: var(--bg-card); border: 1px solid var(--line);
  border-radius: var(--radius-card); box-shadow: var(--shadow);
  padding: clamp(1.5rem, 4vw, 2.5rem);
}

.calc-truck { display: grid; grid-template-columns: 1.25fr .75fr; gap: 2rem; align-items: center; }
.calc-truck svg { width: 100%; height: auto; }

.truck-box     { fill: #fff; stroke: var(--petrol); stroke-width: 3; }
.truck-fill    { fill: var(--orange); transition: width .45s cubic-bezier(.4,0,.2,1); }
.truck-cab     { fill: #fff; stroke: var(--petrol); stroke-width: 3; stroke-linejoin: round; }
.truck-window  { fill: #DCE7EA; stroke: var(--petrol); stroke-width: 2.5; }
.truck-chassis { fill: var(--petrol); }
.truck-wheel   { fill: var(--petrol); }
.truck-hub     { fill: #fff; }

.calc-readout { display: grid; gap: .15rem; }
.calc-label {
  justify-self: start;
  background: var(--petrol); color: #fff;
  font-weight: 800; font-size: .82rem; letter-spacing: .06em;
  text-transform: uppercase; padding: .35rem .85rem; border-radius: 4px;
  margin-bottom: .4rem;
}
.calc-vol  { font-weight: 700; color: var(--ink); font-size: 1rem; }
.calc-from { font-size: .78rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); font-weight: 700; margin-top: .5rem; }
.calc-price {
  font-size: clamp(2.2rem, 5vw, 3rem); font-weight: 800; color: var(--orange-hover);
  line-height: 1.1; font-variant-numeric: tabular-nums;
}
.calc-desc { color: var(--body-c); font-size: .95rem; margin-top: .35rem; }

/* Reglage */
.calc-range {
  -webkit-appearance: none; appearance: none;
  width: 100%; height: 8px; border-radius: 99px; margin: 2rem 0 1rem;
  background: linear-gradient(to right, var(--orange) 0%, var(--orange) var(--pct,40%), var(--line) var(--pct,40%), var(--line) 100%);
  cursor: pointer;
}
.calc-range::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 28px; height: 28px; border-radius: 50%;
  background: var(--orange); border: 4px solid #fff;
  box-shadow: 0 2px 8px rgba(0,36,46,.28); cursor: grab;
}
.calc-range::-moz-range-thumb {
  width: 28px; height: 28px; border-radius: 50%; border: 4px solid #fff;
  background: var(--orange); box-shadow: 0 2px 8px rgba(0,36,46,.28); cursor: grab;
}

/* --steg sätts av script.js efter antalet steg i TIERS */
.calc-steps { display: grid; grid-template-columns: repeat(var(--steg, 6), 1fr); gap: .4rem; }
.calc-steps button {
  font: inherit; font-size: .78rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: .03em; padding: .5rem .25rem; cursor: pointer;
  background: var(--bg); color: var(--muted);
  border: 1px solid var(--line); border-radius: 4px;
  transition: background .15s, color .15s, border-color .15s;
}
.calc-steps button:hover { border-color: var(--orange); color: var(--orange-hover); }
.calc-steps button.active { background: var(--petrol); border-color: var(--petrol); color: #fff; }

.btn-calc { width: 100%; margin-top: 1.5rem; }
```

#### 1.2.4 Scroll-animation + reducerad rörelse (rad 477–485)

`.calc` och `.section-head` bär klassen `reveal`; `prefers-reduced-motion` stänger
även av lastbilens fyllnadsanimation.

```css
/* ==========================================================================
   Scroll-animationer
   ========================================================================== */
.reveal { opacity: 0; transform: translateY(24px); transition: opacity .7s ease, transform .7s cubic-bezier(.2,.7,.3,1); }
.reveal.in { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) {
  .reveal { opacity: 1; transform: none; transition: none; }
  .truck-fill { transition: none; }
}
```

#### 1.2.5 Responsiva regler som påverkar kalkylatorn

Det finns två `@media (max-width: 860px)`-block i filen. Det **första** (rad
327–360) rör hero, kort och navigation och innehåller **ingenting**
kalkylatorrelaterat. Det **andra** (rad 492–515) gör det – här är hela blocket,
de två första raderna är kalkylatorns:

```css
@media (max-width: 860px) {
  .calc-truck { grid-template-columns: 1fr; gap: 1.25rem; }
  .calc-steps { grid-template-columns: repeat(3, 1fr); }
  .trust { grid-template-columns: repeat(2, 1fr); gap: 1.5rem 1.25rem; }
  .steps { grid-template-columns: 1fr; gap: 2rem; }

  body { padding-bottom: 68px; }
  .mobile-bar {
    display: grid; grid-template-columns: 1fr 1fr; gap: .6rem;
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 60;
    padding: .7rem .8rem calc(.7rem + env(safe-area-inset-bottom));
    background: rgba(14,58,68,.97); backdrop-filter: blur(8px);
    box-shadow: 0 -4px 20px rgba(0,36,46,.25);
  }
  .mobile-bar a {
    display: flex; align-items: center; justify-content: center;
    padding: .8rem .5rem; border-radius: var(--radius-btn);
    font-weight: 700; font-size: .92rem; text-transform: uppercase; letter-spacing: .05em;
    text-decoration: none;
  }
  .mobile-bar a:hover { text-decoration: none; }
  .mb-call  { background: var(--orange); color: #fff; }
  .mb-quote { background: transparent; color: #fff; border: 2px solid rgba(255,255,255,.5); }
}
```

Effekten på kalkylatorn under 860 px:
* `.calc-truck` går från två kolumner (lastbil 1.25fr / avläsning .75fr) till **en**
  kolumn – avläsningen hamnar alltså **under** bilen, inte till höger.
* `.calc-steps` går från `repeat(var(--steg), 1fr)` till fasta **3 kolumner**, dvs.
  sex knappar blir 3×2.

Brytpunkten 560 px (rad 517–520) rör `.trust` och `.cards-services` och påverkar
inte kalkylatorn.

Slutligen, rad 523, som gör att ankarlänken `#priser` inte hamnar bakom den
klistrade headern:

```css
/* Ankarlänkar ska inte hamna bakom den fasta headern */
section[id] { scroll-margin-top: 90px; }
```

---

### 1.3 JavaScript

Ur `script.js`, rad 1–137 – dvs. filhuvudet, RUT-konstanten och hela
kalkylator-avsnittet. (Rad 17–37 är mobilmeny och årtal i sidfoten; de tas med
eftersom `RUT_LABOUR_SHARE` står ovanför dem och de visar var i filen kalkylatorn
börjar. Rad 139 och framåt är kontaktformulär och scroll-animationer och rör inte
kalkylatorn.)

```js
// Kastar.se – mobilmeny, priskalkylator, kontaktformulär och scroll-animationer.

/* ---------- RUT-avdrag ----------
   RUT_LABOUR_SHARE är hur stor andel av priset som utgörs av ARBETSKOSTNAD,
   angivet som ett tal mellan 0 och 1. Bara arbetskostnaden är avdragsgill –
   transport, fordon, drivmedel och avfallsavgifter är det inte. Att räkna
   avdraget på hela priset ger ett för lågt och därmed vilseledande kundpris.

   null  = andelen är INTE fastställd. Då visas ingen RUT-rad i kalkylatorn.
           Det är läget nu.
   0.6   = 60 % av priset är arbetskostnad. Då visas "Cirka X kr efter RUT".

   TODO: Sätt värdet först när den faktiska arbetskostnadsandelen är känd –
   stäm av med bokföringen/kalkylen innan siffran publiceras. */
const RUT_LABOUR_SHARE = null;

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

// Avdraget är 50 % av arbetskostnaden – inte av hela priset. Resultatet är en
// uppskattning och avrundas därför till närmaste hundralapp.
function priceAfterRut(price) {
  return Math.round((price - price * RUT_LABOUR_SHARE * 0.5) / 100) * 100;
}

// Visas bara när arbetskostnadsandelen faktiskt är satt till ett giltigt värde.
const showRut = typeof RUT_LABOUR_SHARE === 'number'
  && RUT_LABOUR_SHARE > 0 && RUT_LABOUR_SHARE <= 1;

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
  if (rutEl) {
    rutEl.hidden = !showRut;
    rutEl.textContent = showRut
      ? 'Cirka ' + formatPrice(priceAfterRut(t.price)) + ' efter RUT'
      : '';
  }

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
```

> **Teckendetalj i `formatPrice`:** regexen `/ /g` innehåller ett **hårt
> mellanslag (U+00A0, NBSP)** och ersättningssträngen `' '` ett **vanligt
> mellanslag (U+0020)**. `toLocaleString('sv-SE')` ger `7 795` med NBSP som
> tusentalsavgränsare; raden byter ut det mot vanligt mellanslag. Om du redigerar
> den raden i en editor som normaliserar osynliga tecken kan du råka döda
> ersättningen – då står det `7795 kr` eller `7 795 kr` beroende på vad som gick
> sönder. (Se även avsnitt 5, svaghet 11.)

---

## 2. SÅ HÄR FUNGERAR DEN

### 2.1 Uppstart (vad som händer när sidan laddas)

1. Webbläsaren parsar `index.html`. `#calcSteps` är **tom** – inga knappar finns
   ännu. `#calcRange` har `value="2"` och `max="5"` hårdkodat i HTML.
   `#truckFill` har `width="0"` – bilen är tom.
   `.calc-readout` visar hårdkodade startvärden (8 m³ / 4 195 kr) som matchar
   `TIERS[2]`.
2. `<script src="script.js?v=4">` på rad 532 körs. Toppnivåkoden hämtar alla
   element med `getElementById`.
3. `if (range && fillEl)` (rad 123) är kalkylatorns startspärr. Saknas något av
   dessa två element gör skriptet ingenting alls – därför kraschar inte
   `script.js` på `integritetspolicy.html` och `tack.html`, som saknar kalkylator.
4. `range.max = TIERS.length - 1` → `5`. Detta **skriver över** HTML:ens `max="5"`.
5. `buildSteps()` tömmer `#calcSteps`, sätter CSS-variabeln `--steg` till
   `TIERS.length` (6) och skapar en `<button>` per steg med
   `data-i="<index>"` och etiketten `t.vol`.
6. `renderTier(Number(range.value))` → `renderTier(2)` ritar upp startläget.
   Eftersom `#truckFill` startar på `width="0"` och nu sätts till `98`, och
   `.truck-fill` har `transition: width .45s`, **animeras** fyllnaden in vid
   sidladdning. Det är avsiktligt (bilen "fylls" när man kommer till sektionen).

### 2.2 Klick på en storleksknapp – steg för steg

1. Användaren klickar på en knapp i `#calcSteps`.
2. Lyssnaren ligger på **behållaren** `#calcSteps`, inte på varje knapp
   (event delegation, `script.js:129`). Det gör att knappar som byggs om av
   `buildSteps()` aldrig tappar sin lyssnare.
3. `e.target.closest('button')` klättrar uppåt från det faktiskt klickade
   elementet till närmaste `<button>`. Returnerar `null` om man klickar i
   gapet mellan knapparna → `if (!btn) return;` och inget händer.
4. `range.value = btn.dataset.i` – reglaget flyttas till samma index.
   `dataset.i` är en **sträng** (`"3"`), men `input[type=range].value` är en
   sträng-property så det fungerar direkt.
   **Viktigt:** att sätta `.value` programmatiskt utlöser **inte** något
   `input`-event. Därför måste nästa steg ske explicit.
5. `renderTier(Number(btn.dataset.i))` anropas direkt. Nu är reglage och
   avläsning i samma läge.

### 2.3 Drag i reglaget – steg för steg

1. Användaren drar tummen (eller trycker piltangent/Home/End när reglaget har
   fokus).
2. `input`-eventet avfyras kontinuerligt under draget (`script.js:127`).
   Eftersom `step="1"` snäpper webbläsaren värdet till närmaste heltal, så
   `range.value` är alltid `"0"`–`"5"`.
3. `renderTier(Number(range.value))` – samma funktion som knappvägen.
4. Inne i `renderTier` sätts `.active` om på rätt knapp och av på alla andra, så
   knappraden följer med draget.

Båda vägarna slutar alltså i **samma** funktion, `renderTier(i)`. Det är den enda
platsen som rör DOM:en efter uppstart.

### 2.4 Vad `renderTier(i)` gör, rad för rad

| Rad | Vad | Effekt |
|---|---|---|
| 98–99 | `const t = TIERS[i]; if (!t) return;` | Skydd mot index utanför arrayen |
| 101 | `fillEl.setAttribute('width', (BOX_WIDTH * t.fill).toFixed(1))` | Bilens fyllnad |
| 102 | `labelEl.textContent = t.vol` | Mörka chippet, t.ex. "8 m³" |
| 103 | `volEl.textContent = t.part` | Raden under, "Cirka en halv bil" |
| 104 | `descEl.textContent = t.desc` | Den längre texten under priset |
| 105 | `priceEl.textContent = formatPrice(t.price)` | "4 195 kr" |
| 106–111 | RUT-raden | Se 2.7 |
| 114 | `range.style.setProperty('--pct', …)` | Färgad del av reglaget |
| 116–120 | `.active` + `aria-pressed` på knapparna | Markerar vald knapp |

Notera att `renderTier` **inte** sätter `range.value`. Det gör knappvägen själv
(steg 4 ovan) och reglaget gör det åt sig självt. Om du skulle vilja anropa
`renderTier(n)` från annan kod (t.ex. en djuplänk `#priser?steg=4`) måste du
sätta `range.value` separat, annars glider reglagets tumme ur synk med resten.

### 2.5 Hur lastbilens fyllnad ritas

**SVG-uppbyggnaden** (`index.html:241–259`), koordinatsystem `viewBox="0 0 320 150"`:

```
x=0                                                            x=320
        ┌── clipPath #boxClip: x=110 … 306 (bredd 196) ──┐
   ┌────┼──────────────────────────────────────────────┼─┐  y=26
   │    │  #truckFill: x=110, width = 196 × fill        │ │
   │hytt│  ← växer åt HÖGER från förarhytten            │ │
   └────┼──────────────────────────────────────────────┼─┘  y=102
        └── .truck-box: x=108 … 308 (bredd 200) ────────┘
```

* **`.truck-box`** – `<rect x="108" y="26" width="200" height="76" rx="4">` är
  lastutrymmets kontur: vit fyllning, petrolfärgad ram, `stroke-width: 3`.
  Eftersom SVG ritar streck centrerat på kanten går ramen 1,5 enheter in och 1,5
  ut; **insidan** av konturen ligger alltså på x = 109,5 respektive x = 306,5.
* **`clipPath id="boxClip"`** – `<rect x="110" y="28" width="196" height="72" rx="3">`.
  Detta är den **exakta ytan som får färgas**, en halv enhet innanför ramens insida
  så att den orange färgen aldrig kryper ut över den petrolfärgade konturen.
  `rx="3"` gör att klippytans hörn är rundade – därför får fyllnaden rundade hörn
  i vänsterkanten även när den är smal, och rundade högerhörn först när den är
  helt full.
* **`<g clip-path="url(#boxClip)">`** – gruppen som klipps. Fyllnaden ligger
  ensam i den.
* **`#truckFill`** – `<rect id="truckFill" class="truck-fill" x="110" y="28" width="0" height="72">`.
  Enda som ändras är **attributet `width`**. `x`, `y` och `height` rörs aldrig.
  Rektangeln växer alltså **åt höger, från hyttsidan**, och fyller alltid hela
  lastutrymmets höjd. (Det är en medveten stilisering – lasten "skjuts in bakifrån"
  visuellt, inte "hälls i underifrån".)

**Uträkningen** (`script.js:56` och `101`):

```js
const BOX_WIDTH = 196;                                    // = clipPath-rektangelns bredd
fillEl.setAttribute('width', (BOX_WIDTH * t.fill).toFixed(1));
```

`t.fill` är ett tal 0–1. Attributet blir en sträng med en decimal:

| Steg | `fill` | `196 × fill` | Attribut | Högerkant (SVG-x) |
|---|---|---|---|---|
| 2 m³ | 0.12 | 23,52 | `"23.5"` | 133,5 |
| 4 m³ | 0.25 | 49 | `"49.0"` | 159 |
| 8 m³ | 0.50 | 98 | `"98.0"` | 208 |
| 10 m³ | 0.625 | 122,5 | `"122.5"` | 232,5 |
| 12 m³ | 0.75 | 147 | `"147.0"` | 257 |
| 16 m³ | 1.00 | 196 | `"196.0"` | 306 |

**Från SVG-enheter till skärmpixlar:** `viewBox="0 0 320 150"` plus CSS-regeln
`.calc-truck svg { width: 100%; height: auto; }` gör att SVG:n skalas till sin
grid-kolumn. Är kolumnen t.ex. 500 px bred blir skalfaktorn 500/320 = 1,5625, och
en fyllnad på 98 SVG-enheter renderas som ca 153 CSS-px. Det finns alltså **ingen
pixelmatematik i JavaScript** – all skalning sköts av SVG:ns viewBox. Det är
poängen med lösningen: den är upplösningsoberoende och behöver inte räknas om vid
fönsterstorleksändring.

**Animationen** (`styles.css:386`):

```css
.truck-fill { fill: var(--orange); transition: width .45s cubic-bezier(.4,0,.2,1); }
```

`width` är i SVG2 en **geometriegenskap** och kan därför animeras med CSS-transition.
Presentationsattributet `width` matas in i kaskaden, så när JS ändrar attributet
ändras det beräknade CSS-värdet och transitionen startar. Detta fungerar i alla
aktuella webbläsare (Chrome/Edge, Firefox, Safari). I en gammal, ren SVG 1.1-motor
skulle bredden hoppa direkt i stället – funktionellt men utan animation.
`prefers-reduced-motion: reduce` slår av transitionen helt (`styles.css:484`).

### 2.6 Hur reglagets ifyllda del färgas

Ett `input[type=range]` har inget standardsätt att färga "det som är passerat"
i alla webbläsare. Lösningen här är en **linjär gradient med hård gräns** som
bakgrund på själva `input`-elementet (`styles.css:413`):

```css
background: linear-gradient(to right,
  var(--orange) 0%, var(--orange) var(--pct,40%),
  var(--line) var(--pct,40%), var(--line) 100%);
```

Två stopp med samma position (`var(--pct)`) ger en knivskarp kant i stället för
en övergång: orange till vänster om `--pct`, ljusgrå (`--line`) till höger.

Variabeln sätts **inline på elementet** från `renderTier` (`script.js:114`):

```js
range.style.setProperty('--pct', (i / (TIERS.length - 1)) * 100 + '%');
```

Alltså: index delat med sista index → 0 %, 20 %, 40 %, 60 %, 80 %, 100 % vid sex
steg. `40%` i CSS är enbart en **fallback** som gäller innan JS har hunnit köra
(eller om JS är avstängt); den motsvarar ungefär startläget index 2 av 5.
Tummen (`::-webkit-slider-thumb` / `::-moz-range-thumb`) ritas ovanpå och är helt
frikopplad från gradienten – därför tummens vita 4 px ram, så att den syns mot både
orange och grått.

### 2.7 RUT-logiken

* `RUT_LABOUR_SHARE` (`script.js:15`) är **`null`** just nu, med en tydlig
  motivering i kommentaren: bara arbetskostnaden är avdragsgill, och den andelen
  är inte fastställd. Att räkna 50 % på hela priset skulle ge ett för lågt,
  vilseledande kundpris.
* `showRut` (`script.js:74–75`) är en **konstant som beräknas en gång vid
  laddning**: sann bara om värdet är ett tal i intervallet `0 < x ≤ 1`. Med `null`
  blir den `false`.
* `renderTier` sätter `rutEl.hidden = !showRut` varje gång. Med `showRut === false`
  förblir `#calcRutPrice` dolt och tomt.
* `priceAfterRut(price)` (`script.js:69–71`) räknar
  `pris − pris × andel × 0,5`, alltså 50 % avdrag **på arbetskostnadsdelen**, och
  avrundar till närmaste hundralapp med `Math.round(x / 100) * 100`.
* CSS-detaljen på rad 314–315: `.rut-price` har `display: block`, vilket skulle
  slå ut webbläsarens inbyggda `[hidden] { display: none }`. Därför den explicita
  regeln `.rut-price[hidden] { display: none; }`. **Tar du bort den raden syns
  RUT-raden alltid – även tom.**

**För att slå på RUT-raden:** sätt `const RUT_LABOUR_SHARE = 0.6;` (eller vilken
verifierad andel som gäller) i `script.js:15`. Inget annat behöver ändras. Texten
som visas byggs på `script.js:109`.

### 2.8 Kopplingspunkter mellan HTML, CSS och JS

Detta är kontraktet mellan filerna. Byter du namn på något i vänsterkolumnen
måste **alla** rutor på raden ändras samtidigt.

| Id / klass / variabel | HTML | CSS | JS | Går sönder om det byter namn |
|---|---|---|---|---|
| `#calcRange` | rad 275 (+ `for="calcRange"` rad 274) | `.calc-range` (klass, inte id) | rad 58, 114, 124, 127, 132, 136 | **Hela kalkylatorn dör tyst.** `if (range && fillEl)` blir falskt → inga knappar byggs, `#calcSteps` förblir tom, avläsningen fastnar på HTML:ens startvärden. Ingen felutskrift i konsolen. |
| `#truckFill` | rad 247 | `.truck-fill` (klass) | rad 59, 101 | Samma sak – startspärren fäller. Kalkylatorn ser trasig ut men kraschar inte. |
| `#calcSteps` | rad 278 | `.calc-steps` (klass) | rad 64, 84–85, 93, 116, 129 | **TypeError** i `buildSteps()` (`stepsEl` är null) → skriptet avbryts där. Konsekvens: inga knappar, ingen `renderTier`, ingen kontaktformulärslogik (resten av filen körs aldrig). Detta är det farligaste namnbytet. |
| `#calcLabel`, `#calcVol`, `#calcPrice`, `#calcDesc` | rad 263, 264, 266, 269 | egna klasser | rad 60–63, 102–105 | **TypeError** i `renderTier` vid första anropet → allt efter raden i fråga uteblir, inklusive `--pct` och knapparnas `.active`. Bilen kan fyllas men texten fryser. |
| `#calcRutPrice` | rad 268 | `.rut-price` | rad 65, 106–111 | Ofarligt – `if (rutEl)` skyddar. RUT-raden visas bara aldrig. |
| `#boxClip` (clipPath) | rad 245 + `clip-path="url(#boxClip)"` rad 246 | – | – | Fyllnaden slutar klippas: den orange rektangeln ritas fyrkantig, utan rundade hörn, och kan gå utanför lastutrymmets ram. |
| `data-i` på knapparna | skapas i JS | – | rad 90, 117, 132–133 | Knapparna slutar fungera (`Number(undefined)` → `NaN` → `TIERS[NaN]` → `renderTier` returnerar tidigt). Reglaget fungerar fortfarande. |
| `--steg` | – | `styles.css:428` | `script.js:85` | Knappraden faller tillbaka på CSS-fallbacken `6` kolumner. Med annat antal steg blir rutnätet fel. |
| `--pct` | – | `styles.css:413` | `script.js:114` | Reglaget fastnar på fallbacken 40 % orange oavsett valt steg. |
| `.active` | – | `styles.css:437` | `script.js:118` | Ingen visuell markering av vald knapp. |
| `.truck-*`-klasserna | rad 243–258 | rad 385–391 | – | Lastbilen blir svart (SVG:s standardfyllning) – ingen ram, ingen orange fyllnad. |
| `.calc`, `.calc-truck`, `.calc-readout` | rad 238, 240, 262 | rad 375, 382, 393 | – | Layouten kollapsar (inget kort, ingen tvåkolumnsuppställning) men funktionen består. |
| `.reveal` | rad 232, 238, 292, 327, 345 | rad 480–481 | `script.js:201` | Kortet blir **osynligt** (`opacity: 0`) om klassen finns men IntersectionObserver-koden tas bort, och tvärtom syns det direkt om klassen tas bort. |
| `.sr-only` | rad 274 | rad 366–369 | – | Etiketten "Välj hur mycket som ska bort" blir synlig som lös text ovanför reglaget. |

### 2.9 Tvåvägssynkroniseringen, sammanfattad

Det finns **ett** tillstånd: heltalsindexet `i` i `TIERS`. Det lagras egentligen
på ett enda ställe – i `range.value` (som sträng). Allt annat härleds.

```
   [Reglaget dras]                    [Knapp klickas]
          │                                  │
   input-event                       click på #calcSteps (delegerat)
          │                                  │
          │                          range.value = btn.dataset.i   ← reglaget flyttas
          │                                  │
          └──────────► renderTier(i) ◄───────┘
                            │
        ┌───────────────────┼────────────────────┬──────────────────┐
        ▼                   ▼                    ▼                  ▼
  #truckFill@width    avläsningens 4      range.style --pct    .active/aria-pressed
   (+ CSS-transition)   textnoder          (reglagets färg)      på knapparna
```

Riktningarna i klartext:

* **Knapp → reglage:** explicit, `range.value = btn.dataset.i` (rad 132). Ett
  programmatiskt satt `value` genererar inget `input`-event, därför följer
  `renderTier`-anropet direkt efter på rad 133. Skulle man förlita sig på eventet
  skulle ingenting hända.
* **Reglage → knapp:** sker inuti `renderTier` (rad 116–120). Den loopar över
  **alla** knappar och sätter `.active` + `aria-pressed` till `true`/`false` efter
  jämförelsen `Number(b.dataset.i) === i`. Ingen knapp behöver "släckas" separat.
* **Ingen av vägarna läser av den andra.** Det finns ingen risk för
  händelseloopar, och funktionen är idempotent – att anropa `renderTier(2)` två
  gånger ger samma resultat.

---

## 3. ÄNDRINGSGUIDE

### 3.1 Var ändrar jag ett pris?

`script.js`, fältet `price` i rätt objekt i `TIERS` (rad 48–53). Endast där.
Skriv talet som **heltal utan mellanslag**: `price: 4295`. Formateringen till
"4 295 kr" sköts av `formatPrice`.

Två följdställen att tänka på:

1. `index.html:266` – startvärdet `4 195 kr` i avläsningen. Det skrivs över av JS
   inom millisekunder, men syns i den korta stunden innan skriptet kör, och är det
   enda som syns om JS är avstängt. Håll det synkat med `TIERS[2]` (eller med det
   index `value=` i `#calcRange` pekar på).
2. `index.html:64` – `"priceRange": "1695–7795 SEK"` i JSON-LD-datan för Google.
   **Ändrar du billigaste eller dyraste steget måste den raden ändras också**,
   annars visar Google ett gammalt prisintervall.

### 3.2 Var lägger jag till eller tar bort en storleksnivå?

Grundfallet: **ett objekt i `TIERS`** (`script.js:47–54`). Följande sköter sig
själv:

* Knappen skapas av `buildSteps()`.
* `range.max` sätts till `TIERS.length - 1` (`script.js:124`).
* `--steg` sätts till `TIERS.length` → knappraden får rätt antal kolumner.
* `--pct` räknas om mot `TIERS.length - 1`.

Det som **inte** sköter sig själv och måste kontrolleras samtidigt:

| Vad | Var | Varför |
|---|---|---|
| `max="5"` på reglaget | `index.html:275` | Skrivs över av JS, men styr utseendet innan skriptet kör och är fel om JS är av. Håll den lika med `TIERS.length - 1`. |
| `value="2"` på reglaget | `index.html:275` | Bestämmer startsteget. Med färre steg kan `2` peka fel eller ligga utanför – kontrollera. |
| Startvärdena i avläsningen | `index.html:263–269` | Måste matcha `TIERS[value]`, annars visas fel text innan JS kör. |
| Fallbacken `repeat(var(--steg, 6), 1fr)` | `styles.css:428` | Bara fallback, men uppdatera för tydlighetens skull. |
| Mobilrutnätet `repeat(3, 1fr)` | `styles.css:494` | **Hårdkodat 3 kolumner.** 6 steg = 3×2, snyggt. 5 steg = 3+2 (ojämnt), 7 steg = 3+3+1 (fult), 8 steg = 3+3+2. Justera siffran efter nytt antal. |
| `"priceRange"` | `index.html:64` | Se 3.1. |
| Knappens bredd | `styles.css:429–435` | Etiketten är `t.vol`. Fler än ~7 steg gör att `16 m³` börjar radbrytas i sina 1fr-kolumner på desktop. |

Praktiskt tak: **6–8 steg**. Över det blir knappraden trång på mobil även med
justerat rutnät.

### 3.3 Var ändrar jag hur mycket bilen fylls vid varje nivå?

`script.js`, fältet `fill` i respektive `TIERS`-objekt. Tal mellan `0` och `1`,
där `1` = fullt lastutrymme.

* Värden **över 1** klipps bort av `#boxClip` – bilen ser bara full ut, inget går
  sönder visuellt, men det är missvisande.
* Värden **under ca 0,03** blir smalare än clipPath-hörnens rundning och ser ut
  som en liten oval snarare än en rektangel.
* Om du vill ändra *hela* lastutrymmets storlek i SVG:n måste **tre** tal ändras
  ihop: `.truck-box`-rektangelns `width` (`index.html:243`), `#boxClip`-rektangelns
  `width` (`index.html:245`) och `BOX_WIDTH` (`script.js:56`). Regeln är:
  `BOX_WIDTH === clipPath-rektangelns width`, och clipPath ska ligga ~2 enheter
  innanför `.truck-box` på varje sida.

Notera att `fill` i dag **inte** härleds ur volymen. 4, 8, 10 och 12 m³ följer
visserligen `vol / 16`, men 2 m³ har `0.12` i stället för `0.125`. Vill du ha en
konsekvent modell, se svaghet 3 i avsnitt 5.

### 3.4 Var ändrar jag texterna i avläsningen?

| Text på skärmen | Källa |
|---|---|
| Mörka chippet ("8 m³") | `TIERS[i].vol`, `script.js:48–53` – **samma fält används som knappetikett** |
| Raden under ("Cirka en halv bil") | `TIERS[i].part` |
| Beskrivningen under priset | `TIERS[i].desc` |
| Priset ("4 195 kr") | `TIERS[i].price` + `formatPrice`, `script.js:77–79` |
| Valutasuffixet "kr" | `script.js:78` |
| "Cirka X kr efter RUT" | `script.js:109` |
| Ordet **"Från"** | statiskt i HTML, `index.html:265` |
| Rubrik + ingress i sektionen | `index.html:234–235` |
| Knappen "Få fast pris – skicka bilder" | `index.html:280` |
| RUT-rutans rubrik och brödtext | `index.html:284–285` |
| Finstilta prisnoten längst ned | `index.html:345` |
| Reglagets skärmläsaretikett | `index.html:274` |
| SVG:ns `aria-label` | `index.html:241` |

Vill du ha **olika** text i chippet och på knappen (i dag är båda `t.vol`) måste
du lägga till ett fält, t.ex. `short`, i `TIERS` och använda det i `buildSteps()`
(`script.js:91`).

### 3.5 Vad är hårdkodat och skulle behöva ändras på flera ställen samtidigt?

Ordnat efter hur illa det gör om man glömmer ett ställe:

1. **`BOX_WIDTH = 196` (`script.js:56`) ↔ `#boxClip`-rektangelns `width="196"`
   (`index.html:245`) ↔ `.truck-box` `width="200"` (`index.html:243`).**
   Tre tal, ingen koppling i koden. Ändras bara ett blir fyllnaden systematiskt
   för kort eller för lång, eller kryper ut över ramen.
2. **Antal steg: `TIERS.length` ↔ `max="5"` (`index.html:275`) ↔ `repeat(3, 1fr)`
   på mobil (`styles.css:494`) ↔ fallbacken `var(--steg, 6)` (`styles.css:428`).**
3. **Startläget: `value="2"` (`index.html:275`) ↔ de fem hårdkodade textnoderna i
   `.calc-readout` (`index.html:263–269`).** Fyra texter som ska stämma med
   `TIERS[2]`.
4. **Prisintervallet: `TIERS[0].price` / `TIERS[sista].price` ↔ `"priceRange":
   "1695–7795 SEK"` (`index.html:64`).**
5. **Fallbackprocenten `40%` i gradienten (`styles.css:413`, två gånger på samma
   rad).** Ska ungefär motsvara startsteget.
6. **`.calc`, `.rut-info`, `.trust` och `.steps` har alla `max-width: 900px`
   var för sig** (`styles.css:376`, `286`, `443`, `462`). Ändrar du kortets bredd
   måste de andra tre följa med, annars hackar prissektionens vänsterkant.
7. **`?v=4` i `styles.css?v=4` och `script.js?v=4`** (`index.html:137` och `532`)
   samt motsvarande i `integritetspolicy.html` och `tack.html`. Höjs inte den vid
   deploy kan besökare få gammal kod.
8. **Telefonnumren** i felmeddelandet från kontaktformuläret (`script.js:187`,
   `192`) och på flera ställen i HTML – rör inte kalkylatorn direkt, men ligger i
   samma fil.

---

## 4. FÖRUTSÄTTNINGAR OM DU BYGGER DEN FRISTÅENDE

Minsta möjliga uppsättning för att köra kalkylatorn utanför den här sajten:

1. HTML: `div.calc`-blocket ur avsnitt 1.1 (rad 238–281). `.section`,
   `.container` och `.section-head` kan ersättas av vad som helst.
2. CSS: `:root`-variablerna (1.2.1), hela block 1.2.3, `.rut-price`-reglerna ur
   1.2.2 och de två kalkylatorraderna i mobilbrytpunkten (1.2.5).
   Utan `--petrol`, `--orange`, `--orange-hover`, `--line`, `--bg`, `--bg-card`,
   `--ink`, `--body-c`, `--muted`, `--radius-card` och `--shadow` blir kortet
   ostilat.
3. JS: rad 39–137 ur `script.js` plus `RUT_LABOUR_SHARE` (rad 15).
   Mobilmeny (17–33) och årtal (36–37) behövs inte.
4. Ta bort klassen `reveal` från `div.calc` **eller** ta med
   IntersectionObserver-koden (`script.js:200–216`) – annars är kortet osynligt
   (`opacity: 0`).
5. Skriptet måste ligga sist i `<body>` eller laddas med `defer`.
6. Typsnittet är Montserrat (laddas i `<head>` i `index.html`); utan det ser
   kortet annorlunda ut men fungerar.

Inga beroenden i övrigt: inga bibliotek, ingen byggkedja, inget nätverksanrop.

---

## 5. KÄNDA SVAGHETER

Ordnade efter hur mycket de skulle stå i vägen vid en utbyggnad – t.ex. en andra
prismodell baserad på **vikt** i stället för volym.

**1. Datamodellen antar en enda dimension, och den heter volym.**
`TIERS`-objekten blandar tre saker som egentligen är olika: mätetalet (`vol`),
presentationen (`part`, `desc`) och den visuella representationen (`fill`).
Fältnamnet `vol` används dessutom både som chip-text och som knappetikett. En
viktmodell behöver ett fält som inte heter `vol` och som inte förutsätter att
storleken går att uttrycka som en andel av en lastbil. **Detta är den enskilt
största omskrivningen** och bör göras först: byt `vol` → `label` och `part` →
`sublabel`, och bryt ut modellen ur presentationen, t.ex.

```js
const MODELLER = {
  volym: { enhet: 'm³', steg: [ … ] },
  vikt:  { enhet: 'ton', steg: [ … ] }
};
```

Med dagens struktur måste man i stället duplicera hela `TIERS` och greppa in i
`renderTier` på fyra ställen.

**2. `fill` är visuell metafor, inte data.** Vid en viktmodell finns ingen
naturlig "andel av bilen" – 800 kg betong fyller en åttondel av flaket men är
maxlast. Antingen behöver `fill` beräknas per modell (en funktion i stället för
ett tal), eller så behöver visualiseringen bytas ut mot något viktsymboliskt.
Kod som `fillEl.setAttribute('width', BOX_WIDTH * t.fill)` förutsätter att det
alltid finns en `fill` mellan 0 och 1.

**3. `fill`-värdena är handsatta och delvis inkonsekventa.** 4/8/10/12 m³ följer
`vol / 16`, men 2 m³ har `0.12` i stället för `0.125`. Ingen kommentar förklarar
avvikelsen, så nästa person vet inte om det är avsiktligt eller ett slarvfel.
Bör bli `fill: t.m3 / MAX_M3` med `MAX_M3 = 16`, så kan `fill`-kolumnen strykas
helt.

**4. Priserna finns på två ställen med olika format.** `TIERS[].price` (heltal)
och `"priceRange": "1695–7795 SEK"` i JSON-LD (sträng). Inget håller ihop dem.
Uppdaterade priser + glömd JSON-LD = Google visar fel intervall i sökresultatet.

**5. Kalkylatorn är helt beroende av JavaScript utan reservläge.** Är JS av eller
blockerat visas en tom knapprad, ett reglage som inte gör något, och en fast text
("8 m³ / 4 195 kr") som ser ut som ett fast pris. Det finns ingen `<noscript>`,
ingen prislista i HTML. En statisk `<table>` bakom `<noscript>` – eller ett
progressive-enhancement-upplägg där HTML innehåller alla steg och JS bara
förbättrar – vore rimligt innan kalkylatorn blir mer komplex.

**6. Tysta fel.** Startspärren `if (range && fillEl)` (rad 123) gör att
kalkylatorn helt enkelt **inte finns** om ett av två id byter namn – utan ett
enda felmeddelande i konsolen. Övriga fem element saknar motsvarande skydd:
byter `#calcLabel` namn får man i stället ett `TypeError` mitt i `renderTier`,
vilket avbryter allt efter den raden. Två olika felbeteenden för samma sorts
misstag.

**7. Ett fel i toppnivåkoden dödar resten av filen.** `script.js` är ett enda
globalt skript utan moduler. Kraschar `buildSteps()` körs aldrig raderna 139–216,
alltså **kontaktformuläret och scroll-animationerna**. Kalkylatorn och formuläret
har alltså ett dolt beroende av varandra. Bryt ut kalkylatorn i egen fil eller
åtminstone i en `try`-omsluten IIFE.

**8. Globala namn kolliderar.** `TIERS`, `range`, `toggle`, `nav`, `fillEl` m.fl.
ligger i globalt scope. `range` skuggar dessutom inget standard-API men är ett
riskabelt namn. Två kalkylatorer på samma sida (t.ex. volym + vikt sida vid sida)
går inte att göra utan omskrivning – allt är hårdbundet till id:n, inte till en
instans.

**9. Ingen interpolation mellan stegen.** `step="1"` gör att reglaget snäpper.
För en kund som har 6 m³ finns bara "4" eller "8". En kontinuerlig modell
(pris per m³ med golv och tak) skulle kräva att `renderTier(i)` byts mot
`renderPris(volym)` och att `part`/`desc` blir intervallregler i stället för
fasta strängar.

**10. Tillgänglighet är halvfärdig.**
* Reglaget saknar `aria-valuetext` – en skärmläsare säger "2 av 5", inte "8 m³".
* Avläsningen saknar `aria-live`, så ändringar annonseras inte alls.
* Knapparna använder `aria-pressed` (växelknappar) fast de i praktiken är en
  **radiogrupp** – `role="radiogroup"` + `aria-checked` och pil-navigering vore
  korrekt. I dag måste man tabba genom alla sex knappar.
* Knappraden och reglaget är två separata tabbstopp-uppsättningar för samma val,
  utan att det framgår att de är kopplade.

**11. `formatPrice` är skör.** Den bygger på att `toLocaleString('sv-SE')` ger
NBSP som tusentalsavgränsare och byter ut det mot vanligt mellanslag – en
osynlig teckendetalj som lätt går förlorad vid redigering, och som dessutom gör
att "7 795 kr" **kan radbrytas mitt i talet**. Ett hårt mellanslag i
ersättningen (eller `white-space: nowrap` på `.calc-price`) vore stabilare.
Funktionen antar också heltal SEK, inga ören, ingen annan valuta.

**12. `priceAfterRut` är osäker om den anropas utanför sitt skydd.** Med
`RUT_LABOUR_SHARE = null` ger `price * null * 0.5` värdet `0`, alltså
returneras hela priset som "efter RUT" – tyst fel. I dag räddas det av `showRut`,
men funktionen borde själv returnera `null` när andelen inte är satt.

**13. `showRut` beräknas en gång vid laddning.** Ska RUT någon gång kunna slås
av/på i gränssnittet (t.ex. en kryssruta "Jag vill använda RUT") måste den bli en
funktion eller läsas om i `renderTier`.

**14. Edge case: ett enda steg.** Med `TIERS.length === 1` blir
`(i / (TIERS.length - 1))` → `0/0` → `NaN`, och `--pct` sätts till strängen
`"NaN%"`. Custom properties validerar inte innehållet, så det är `background`-
deklarationen i `.calc-range` som blir ogiltig och kastas – reglaget tappar då
**hela** sin bakgrund, inte bara den orange delen. Behövs en vakt:
`TIERS.length > 1 ? … : 100`.

**15. Mobilrutnätet är hårdkodat till 3 kolumner** (`styles.css:494`) trots att
`--steg` finns och används på desktop. Det är den enda platsen där antalet steg
inte följer med automatiskt. `repeat(auto-fit, minmax(72px, 1fr))` skulle lösa
det generellt.

**16. Fyllnaden växer från fel håll om man tänker efter.** Rektangeln växer
vänster→höger, alltså **från förarhytten och bakåt**. Verkliga flak lastas från
bakluckan. Kosmetiskt, men om någon någon gång vill vända riktningen räcker det
inte att ändra `width` – då måste även `x` räknas om
(`x = 306 − BOX_WIDTH * fill`), och `x` är i dag statiskt i HTML.

**17. Ingen loggning eller mätning.** Det finns ingen händelse som talar om vilket
steg besökare faktiskt väljer innan de klickar "Få fast pris". Det är den mest
värdefulla datapunkten på hela sidan för att kalibrera prismodellen, och den
kastas bort. En rad i `renderTier` (eller hellre en debouncad variant, eftersom
`input` avfyras kontinuerligt under drag) räcker.

---

## 6. Förslag på ordning vid en utbyggnad

Om nästa steg är en andra prismodell (vikt), i den här ordningen:

1. Bryt ut kalkylatorn ur `script.js` till egen fil och kapsla in i en IIFE eller
   modul. Löser svaghet 7 och 8 utan att ändra beteende.
2. Normalisera datamodellen: `label` / `sublabel` / `desc` / `price` +
   `fillOf(t)`-funktion i stället för `vol` / `part` / `fill`. Löser 1, 2, 3.
3. Härled `fill` matematiskt och stryk kolumnen. Löser 3.
4. Inför `MODELLER`-objektet och en modellväxlare i gränssnittet. Först nu blir
   viktmodellen en fråga om data, inte om kod.
5. Lägg till `<noscript>`-prislista och `aria`-förbättringarna (5 och 10) innan
   sidan får mer trafik.

Punkt 1 och 2 är förutsättningar – görs de inte först kommer viktmodellen att
byggas som en kopia av volymmodellen, och då finns prissättningen på fyra ställen
i stället för två.
