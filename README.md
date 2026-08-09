# Kastar.se

Statisk hemsida för Kastar.se – tömning och bortforsling av bostäder och lokaler
i Stockholm och Uppsala. Byggd i ren HTML/CSS/JS, utan byggsteg, redo för
GitHub Pages.

## Filer

| Fil | Innehåll |
|-----|----------|
| `index.html` | Hela sidan (en sida med sektioner) |
| `styles.css` | All styling. Ändra färger högst upp i `:root` |
| `script.js` | Mobilmeny + årtal i sidfoten |
| `CNAME` | Talar om för GitHub Pages att domänen är `kastar.se` |
| `assets/` | Lägg dina bilder här (logga, hero-foto osv.) |

## Att göra innan lansering

1. **Lägg in dina egna bilder** i `assets/` och koppla in dem i `index.html`
   (sök efter kommentarerna som börjar med `Ersätt` / `Byt ut`).
2. **Aktivera kontaktformuläret**: skapa en gratis access key på
   https://web3forms.com och klistra in den i `index.html`
   (`value="DIN-ACCESS-KEY"`). Tills dess fungerar "Ring" och "Maila".
3. Kör lokalt om du vill förhandsgranska:
   ```bash
   python3 -m http.server 8000
   # öppna http://localhost:8000
   ```

## Publicera

Se den separata guiden du fick i chatten för GitHub- och DNS-stegen.
