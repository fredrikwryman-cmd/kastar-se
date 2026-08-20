# Kastar.se – instruktioner

## Push
Efter varje avslutad uppgift, när ändringarna är committade, kör alltid
detta som sista steg utan att fråga först:

    git -C "%USERPROFILE%\Downloads\kastar-site" push origin main

Fredrik godkänner kommandot i dialogrutan. Om kommandot hänger eller
timar ut: avbryt, säg det rakt ut och be honom köra samma rad i sitt
eget CMD-fönster. Försök inte med alternativa push-varianter.

## Parallellt arbete
När ett direktiv innehåller flera delar som rör OLIKA filer, kör dem
parallellt med subagenter i stället för i följd. Ett direktiv som är
uppdelat i numrerade delar ska tolkas som en uppmaning att göra just
det.

Villkor:

- Endast delar som rör skilda filer får köras parallellt. Delar som rör
  samma fil körs alltid i följd, annars uppstår konflikter.
- Bildrendering, videobearbetning och annan tung filbehandling ska
  alltid läggas på egen subagent, eftersom den typen av arbete är det
  som tar mest tid.
- Ingen subagent committar. Huvudagenten samlar in resultaten,
  kontrollerar helheten, och gör en enda commit och en enda push till
  sist.
- Kontrollen av responsivitet, konsolfel och strukturerad data görs av
  huvudagenten efter att alla delar är sammanförda, aldrig av
  delagenterna var för sig.
