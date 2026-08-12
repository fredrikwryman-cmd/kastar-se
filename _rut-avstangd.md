# RUT-avdrag – avstängt tills vidare

Allt som rörde RUT-avdrag togs bort från den publika sidan 2026-08-12, eftersom
det ännu inte är bekräftat med Skatteverket att verksamheten är RUT-berättigad.

Filnamnet börjar med understreck, vilket gör att GitHub Pages (Jekyll) hoppar
över filen — den publiceras alltså inte.

**Så här återställer du:** klistra tillbaka varje block nedan på den plats som
anges. Blocken är ordagranna kopior. Ta dem i den ordning de står här, uppifrån
och ner, så stämmer radnumren ungefär. Referenscommit före borttagningen:
`fe13ae2`. Snabbaste vägen tillbaka är annars `git show fe13ae2:index.html` osv.

---

## 1. index.html – punkt i hero-listan

**Satt i:** `<ul class="hero-badges">` i hero-sektionen, som **sista** `<li>`
efter "✔ Flexibla tider" (rad 179).

```html
            <li>✔ RUT-avdrag på arbetskostnaden</li>
```

Listan såg ut så här med punkten kvar:

```html
          <ul class="hero-badges">
            <li>✔ Snabbt på plats</li>
            <li>✔ Miljövänlig återvinning</li>
            <li>✔ Flexibla tider</li>
            <li>✔ RUT-avdrag på arbetskostnaden</li>
          </ul>
```

---

## 2. index.html – RUT-raden i priskalkylatorns avläsning

**Satt i:** `<div class="calc-readout">` inuti `.calc-truck`, **mellan**
`<span class="calc-price" id="calcPrice">` och
`<span class="calc-desc" id="calcDesc">` (rad 210–211).

```html
              <!-- Döljs tills RUT_LABOUR_SHARE i script.js är satt -->
              <span class="rut-price" id="calcRutPrice" hidden></span>
```

Hela avläsningen med raden kvar:

```html
            <div class="calc-readout">
              <span class="calc-label" id="calcLabel">8 m³</span>
              <span class="calc-vol"   id="calcVol">Cirka en halv bil</span>
              <span class="calc-from">Från</span>
              <span class="calc-price" id="calcPrice">4 195 kr</span>
              <!-- Döljs tills RUT_LABOUR_SHARE i script.js är satt -->
              <span class="rut-price" id="calcRutPrice" hidden></span>
              <span class="calc-desc"  id="calcDesc">Halva bilen – perfekt för större tömningar.</span>
            </div>
```

---

## 3. index.html – informationsblocket under priskalkylatorn

**Satt i:** `section#priser`, direkt **efter** `</div>` som stänger `div.calc`
och direkt **före** kommentaren `<!-- Trust-rad -->` (rad 226–232). Blocket
låg alltså mellan kalkylatorkortet och trust-raden, med en tom rad före och
efter.

```html
        <div class="rut-info">
          <h3>💡 Visste du? Du kan använda RUT-avdrag</h3>
          <p>Våra tjänster är godkända för RUT-avdrag. Det innebär att du drar av 50 % av arbetskostnaden — alltså den del av priset som avser arbetstid, inte transport, fordon eller avfallsavgifter. Vi sköter pappersarbetet, du anger bara ditt personnummer.</p>
          <!-- TODO: Beloppstaket per person och år är medvetet utelämnat.
               Reglerna ändrades inför 2026 och siffran är inte verifierad.
               Lägg tillbaka först när aktuellt tak är bekräftat hos Skatteverket. -->
        </div>
```

---

## 4. index.html + integritetspolicy.html – raden i sidfoten

**Satt i:** `<div class="container footer-legal">` i sidfoten, första `<p>` efter
den bortkommenterade organisationsnummer-raden.
`index.html` rad 506, `integritetspolicy.html` rad 140. **Identisk rad i båda
filerna.**

Raden **med** RUT (så här ska den se ut igen):

```html
      <p>F-skatteregistrerad · Ansvarsförsäkrade · Godkänd för RUT-avdrag</p>
```

Raden står nu i stället som:

```html
      <p>F-skatteregistrerad · Ansvarsförsäkrade</p>
```

---

## 5. script.js – konstanten och kommentaren överst i filen

**Satt i:** allra överst i `script.js`, **mellan** filkommentaren
(`// Kastar.se – mobilmeny, …`) och avsnittet `/* ---------- Mobilmeny …`
(rad 3–16, inklusive tom rad efter).

```js
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
```

---

## 6. script.js – elementreferensen

**Satt i:** blocket med `getElementById`-konstanter i priskalkylatorn, som
**sista** raden efter `const stepsEl = document.getElementById('calcSteps');`
(rad 63).

```js
const rutEl   = document.getElementById('calcRutPrice');
```

Hela blocket med raden kvar:

```js
const range   = document.getElementById('calcRange');
const loadEl  = document.getElementById('truckLoad');
const labelEl = document.getElementById('calcLabel');
const volEl   = document.getElementById('calcVol');
const priceEl = document.getElementById('calcPrice');
const descEl  = document.getElementById('calcDesc');
const stepsEl = document.getElementById('calcSteps');
const rutEl   = document.getElementById('calcRutPrice');
```

---

## 7. script.js – uträkningen och visningsvillkoret

**Satt i:** direkt **efter** konstantblocket i punkt 6 och direkt **före**
`function formatPrice(n)` (rad 65–74, inklusive tomraderna emellan).

```js
// Avdraget är 50 % av arbetskostnaden – inte av hela priset. Resultatet är en
// uppskattning och avrundas därför till närmaste hundralapp.
function priceAfterRut(price) {
  return Math.round((price - price * RUT_LABOUR_SHARE * 0.5) / 100) * 100;
}

// Visas bara när arbetskostnadsandelen faktiskt är satt till ett giltigt värde.
const showRut = typeof RUT_LABOUR_SHARE === 'number'
  && RUT_LABOUR_SHARE > 0 && RUT_LABOUR_SHARE <= 1;
```

---

## 8. script.js – RUT-raden i renderTier()

**Satt i:** funktionen `renderTier(i)`, direkt **efter**
`priceEl.textContent = formatPrice(t.price);` och direkt **före** kommentaren
`// färgad del av reglaget` (rad 104–109).

```js
  if (rutEl) {
    rutEl.hidden = !showRut;
    rutEl.textContent = showRut
      ? 'Cirka ' + formatPrice(priceAfterRut(t.price)) + ' efter RUT'
      : '';
  }
```

Så här såg den delen av funktionen ut med blocket kvar:

```js
  loadEl.style.setProperty('--fill', (t.fill * 100) + '%');
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
```

---

## 9. styles.css – CSS-reglerna

**Satt i:** direkt **efter** `.footer-credit { margin-top: .75rem; }` och direkt
**före** kommentaren `/* Textsidor (integritetspolicy) */` (rad 285–317).

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

---

## 10. styles.css – kommentaren ovanför .steps

**Satt vid:** regeln `.steps { max-width: 900px; … }` i prissektionen. Kommentaren
räknade upp `.rut-info` bland blocken som delar 900px-bredd. Den lyder nu utan
`.rut-info`; med RUT tillbaka ska den se ut så här:

```css
/* Samma 900px som .calc, .rut-info och .trust – hela prissektionen delar kant */
```

---

## Noterat om layouten

`.rut-info` hade `margin: 2.5rem auto 0` och `.trust` har `margin: 1.75rem auto 0`.
När blocket är borta blir avståndet mellan kalkylatorkortet och trust-raden
1,75 rem i stället för 2,5 rem. Det behöver inte kompenseras — det är samma
avstånd som resten av prissektionen använder — men det är skillnaden att känna
till om något ser tätare ut än förut.

## Inget att återställa på dessa ställen

Genomsökning på "rut", "RUT" och "avdrag" i alla filer visade att RUT **inte**
förekom i:

* meta description, og-taggar eller Twitter-taggar
* strukturerad data (JSON-LD, `MovingCompany`)
* trust-raden i prissektionen (de fyra punkterna är återbruk, försäkring,
  service och område — ingen om RUT)
* `tack.html`, `sitemap.xml`, `robots.txt`, `site.webmanifest`, `README.md`,
  `PUBLICERA.md`
