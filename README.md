# Kastar.se

Webbplats för Kastar.se, ett företag i Arlandastad som utför tömning,
bortforsling, flytt, montering och magasinering i Stockholm och Uppsala med
omnejd.

Sajten vänder sig till privatpersoner som ska tömma ett dödsbo, flytta, eller
bli av med möbler och inventarier. Den ska göra två saker: visa vad arbetet
kostar innan besökaren tar kontakt, och göra det lätt att höra av sig. Priserna
visas därför efter rot- och rutavdrag med ordinarie pris under, och varje pris
länkar till villkoren som förklarar vad avdraget faktiskt omfattar.

Utöver startsidan finns två digitala visitkort, `/fredrik` och `/thom`, med
vCard-nedladdning och QR-kod.

## Teknikval

Ren HTML, CSS och JavaScript. Inget ramverk, inget byggsteg, inga beroenden.
Publiceras via GitHub Pages direkt från `main`.

Motivet är enkelt. En sajt av den här storleken — en innehållsrik startsida och
fem mindre sidor — behöver inget ramverk för att hålla ihop. Det som ett
byggsteg hade tillfört är i huvudsak sådant som redan finns i plattformen:
moduler, variabler, nästlade selektorer.

Viktigare är att utan byggsteg finns ingenting som kan ruttna. Det som ligger i
repot är exakt det som ligger på servern. Ingen `node_modules` som blir osäker,
inga låsfiler som slutar gå att installera, ingen verktygskedja som kräver
underhåll för att sajten ska gå att ändra om två år. Den som öppnar `index.html`
ser sidan.

Priser och tjänsteinnehåll står i markupen, inte i en databas. Det är ett
medvetet val: innehållet ändras några gånger om året och redigeras direkt i
filerna.

## Prestanda

- **Bilder i WebP** med `srcset` och `sizes` i två bredder per motiv, satta
  efter uppmätta renderade mått i stället för källfilens storlek. Hero-bilden
  har `fetchpriority="high"`; allt under första skärmen är `loading="lazy"`.
- **Typsnittet hostas lokalt.** Asap ligger som en variabel woff2 i
  `assets/fonts/`, med `preload` i `<head>` och `font-display: swap`. Ingen
  uppkoppling mot en främmande domän behövs innan sidan kan målas.
- **Noll renderingsblockerande resurser.** Den externa typsnittslänken var den
  enda och är borta.
- **Tung initiering är flyttad till `requestIdleCallback`**, med `setTimeout`
  som reserv. Tjänstepanelernas fokushantering och priskalkylatorns uppsättning
  är det tyngsta skriptet gör, och ingenting av det syns på första skärmen.
  Mobilmenyn, headern och hero-parallaxen initieras direkt — de hör till första
  skärmen.

## Tillgänglighet

- **AA-kontrast genomgående**, verifierad på samtliga sidor. Alla textfärger är
  uträknade mot den botten de faktiskt står på, inte mot den avsedda.
- **Skip-link** som första fokuserbara element på varje sida. Den är gömd med
  förskjutning utanför skärmen, inte med `display: none`, som hade tagit den ur
  tabbordningen.
- **Semantiska landmarks** på alla sidor: `header`, `main`, `footer`. Visitkorten
  fick sina genom att kortets mediaruta och fot lyftes ut ur `main`.
- **Rubrikhierarki utan hopp.** Där en nivå saknas av layoutskäl finns en
  visuellt dold rubrik i stället, till exempel först i trygghetsraden och i
  sidfoten.
- **Länkar i löptext är understrukna.** Färg ensam räcker inte som signal när
  kontrasten mot omgivande text understiger 3:1.
- **Reducerad rörelse respekteras i både CSS och JavaScript.** Ett CSS-mediavillkor
  når inte inline-stilar satta av skript, så parallaxen frågar själv via
  `matchMedia` och registrerar då ingen scroll-lyssnare alls. Ett byte mitt i
  besöket nollställer stilarna direkt.

## Färgsystem

Paletten ligger i `:root` i `styles.css`. Regeln är att varje färg används via
sin variabel, aldrig som hexkod direkt i en regel.

| Variabel | Värde | Används till |
|---|---|---|
| `--orange` | `#E8862E` | Ytor: knappar, ikonramar, linjer. Även text mot petrol |
| `--orange-ink` | `#A85610` | Orange text mot vit eller krämvit botten |
| `--petrol` | `#0E3A44` | Mörka sektioner, sidhuvud, sidfot |
| `--petrol-deep` | `#092F38` | Text på orange yta |
| `--muted` | `#5B6A70` | Dämpad brödtext |
| `--bg` | `#FAF5EF` | Krämvit sektionsbotten |

Det finns **två oranga toner, och det är inte en dubblett.** En färg som
fungerar som yta är sällan läsbar som text, eftersom kraven är olika: en stor
ifylld knapp behöver bara skilja sig från sin omgivning, medan text på ljus
botten måste nå 4,5:1 mot just den bottnen.

`#E8862E` är varumärkets orange och fungerar som yta. Som text mot vitt ger den
2,66:1 och mot krämvitt 2,46:1 — långt under gränsen. `#A85610` är samma kulör
nedmörkad tills den klarar 5,25:1 mot vitt och 4,84:1 mot krämvitt. De ser ut som
samma färg på en knapp respektive i en mening, men bara den ena går att läsa.

Samma resonemang styr texten på orange yta. Vit text på `#E8862E` ger 2,66:1;
petroltext ger 5,34:1. Därför är primärknappen mörk text på orange, och därför
byter den aldrig bakgrundsfärg vid hovring — den lyfts i stället, så att
kontrasten är densamma i alla lägen.

`--muted` är nedmörkad av samma skäl. Den ska hålla mot tre bottnar: vitt,
krämvitt och den varmare ytan `#F1EAE0` i faktarutan på rot- och rut-sidan.

## Filöversikt

| Fil | Innehåll |
|---|---|
| `index.html` | Startsidan: hero, priser, rot och rut, tjänster, FAQ, kontakt |
| `rot-rut.html` | Vad som ger avdrag och vad som inte gör det |
| `integritetspolicy.html`, `tack.html` | Policy respektive kvittens efter formulär |
| `fredrik/`, `thom/` | Digitala visitkort med `.vcf`-fil och QR-kod |
| `styles.css` | All styling för sajten. Paletten ligger överst i `:root` |
| `script.js` | Meny, header, paneler, priskalkylator, formulär, hero-parallax |
| `kort.css`, `kort.js` | Enbart visitkorten |
| `verktyg/kalkyl.html` | Internt offertverktyg, inte länkat från sajten |
| `assets/` | Bilder i WebP, Open Graph-bilder i JPEG, ikoner, typsnitt |
| `CNAME`, `site.webmanifest`, `robots.txt`, `sitemap.xml` | Domän, manifest, indexering |

Stilmallar och skript laddas med en versionsfråga i sökvägen, till exempel
`styles.css?v=34`. Den räknas upp vid varje ändring så att besökare inte får en
cachad gammal fil.

## Köra lokalt

```bash
python -m http.server 8000
```

Öppna sedan `http://localhost:8000`. Ingen installation, inget bygge.
