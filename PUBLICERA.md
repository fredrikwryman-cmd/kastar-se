# Publicera bohagsbolaget.se på GitHub Pages – utan driftstopp

Guiden är i tre delar: **A)** lägg upp koden på GitHub, **B)** slå på GitHub
Pages, **C)** peka om domänen i Loopia. Ordningen är viktig – vi gör klart och
testar allt *innan* vi rör domänen, så att sidan aldrig ligger nere.

> Färdigifyllt för ditt konto: **fredrikwryman-cmd**. Repo-namnet nedan
> (`kastar-se`) kan du byta fritt – det påverkar inte domänen.

---

## A. Lägg upp koden på GitHub

1. Skapa ett nytt, **tomt** repo på https://github.com/new
   - Namn: t.ex. `kastar-se` (spelar ingen roll för domänen)
   - Publikt (krävs för gratis GitHub Pages)
   - Bocka INTE i "Add a README" – vi har redan filer

2. I mappen med sajten (den du fick), kör:
   ```bash
   git init
   git add .
   git commit -m "Första versionen av bohagsbolaget.se"
   git branch -M main
   git remote add origin https://github.com/fredrikwryman-cmd/kastar-se.git
   git push -u origin main
   ```

Nu ligger koden på GitHub. Detta påverkar INTE din nuvarande sida på bohagsbolaget.se.

---

## B. Slå på GitHub Pages

1. På repot: **Settings → Pages**
2. Under **Build and deployment → Source**: välj **Deploy from a branch**
3. Branch: **main**, mapp: **/ (root)** → **Save**
4. Efter ~1 minut visas din sida på:
   **https://fredrikwryman-cmd.github.io/kastar-se/**
   Öppna den och kontrollera att allt ser rätt ut.
5. Fortfarande i **Settings → Pages**, fältet **Custom domain**: skriv
   `bohagsbolaget.se` och tryck **Save**.
   (Filen `CNAME` i repot innehåller redan `bohagsbolaget.se`, så detta stämmer.)
   GitHub börjar nu göra en "DNS check" som blir grön när steg C är klart.

> Din sida på bohagsbolaget.se rullar hela tiden vidare hos Loopia tills vi byter DNS.

---

## C. Peka om domänen i Loopia (DNS)

Detta är själva "flytten". Så länge du INTE säger upp SiteBuilder samma dag
ligger sidan uppe hela tiden – gammal trafik går till Loopia, ny trafik till
GitHub, tills allt slagit igenom.

1. Logga in i Loopias **Kundzon** → välj domänen **bohagsbolaget.se**.
2. Om domänen är låst till konfigurationen **"Sitebuilder"**: välj att ändra
   till egna DNS-inställningar / **DNS-editor** (så du kan redigera poster).
   Rör INTE e-post-/MX-posterna – de ska vara kvar så att boka@bohagsbolaget.se funkar.
3. Öppna **DNS-editorn**. Under **@** (rot-domänen):
   - Ta bort ev. befintlig A-post/CNAME som pekar mot Sitebuilder.
   - Lägg till **fyra A-poster** som pekar mot GitHub:
     ```
     185.199.108.153
     185.199.109.153
     185.199.110.153
     185.199.111.153
     ```
   - (Valfritt, för IPv6, lägg även till fyra AAAA-poster:)
     ```
     2606:50c0:8000::153
     2606:50c0:8001::153
     2606:50c0:8002::153
     2606:50c0:8003::153
     ```
4. Under **www**: lägg till en **CNAME** som pekar på
   `fredrikwryman-cmd.github.io` (med punkt på slutet om Loopia kräver det:
   `fredrikwryman-cmd.github.io.`).
5. Spara. Ändringen slår oftast igenom inom en timme (kan ta upp till 24 h).

### Slutkoll
- Gå tillbaka till **GitHub → Settings → Pages**. När DNS-checken är grön,
  bocka i **Enforce HTTPS** (kan dröja upp till 24 h innan valet går att klicka).
- Surfa till **https://bohagsbolaget.se** (i inkognitofönster) och kontrollera att den
  nya sidan visas med hänglås.
- Testa att skicka/ta emot mail på boka@bohagsbolaget.se – ska fungera oförändrat.

### När allt fungerar
Först då kan du **säga upp / nedgradera Loopia SiteBuilder**. Behåll domänen och
mailen hos Loopia – det är bara webbhotell-/SiteBuilder-delen som inte längre
behövs.

---

## Bra att veta

- **Domänverifiering (valfritt men bra):** i GitHub → Settings → Pages → "Verify
  domain" får du en TXT-post (`_github-pages-challenge-fredrikwryman-cmd`) att
  lägga till i Loopias DNS. Skyddar mot domänkapning.

- **Om du hellre deployar via en Actions-workflow** (som på ditt
  `-ad-byggprojekt`): det går lika bra. Lägg din vanliga "Deploy to GitHub
  Pages"-workflow i `.github/workflows/`, sätt Pages-källan till "GitHub Actions"
  istället för "branch", och lägg custom domain `bohagsbolaget.se` på samma ställe. DNS-
  stegen i del C är identiska oavsett vilken deploy-metod du väljer.
- **Framtida ändringar:** öppna repot i Claude Code, ändra, och kör
  `git add . && git commit -m "..." && git push`. Sidan uppdateras automatiskt
  inom en minut.
- **E-post påverkas inte** så länge du bara ändrar A-/CNAME-posterna för webben
  och lämnar MX-posterna orörda.
