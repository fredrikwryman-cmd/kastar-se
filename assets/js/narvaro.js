// Bohagsbolaget.se, livssignalen till den interna appen.
//
// Skickar två uppgifter medan någon läser sidan: ett slumpat sessions-id
// och sidans sökväg. Fredrik och Thom ser då i appen hur många som är inne
// på sajten just nu och vilka sidor som läses.
//
// Ingen kaka, ingen IP-adress, ingen referer, ingen sökparameter och ingen
// personuppgift. Id:t slumpas med crypto, lever i sessionStorage och
// försvinner när fliken stängs; det går inte att följa någon mellan besök,
// och ingenting här pekar ut en person. Därför behövs ingen samtyckesruta.
//
// Signalen går bara när fliken är synlig, så en bortglömd flik räknas inte
// som en besökare. Fel sväljs tyst: en räknare får aldrig märkas av den som
// läser sidan, och ingenting loggas i konsolen.
//
// Interna verktyg under /verktyg/ skickar ingenting. Det är våra egna sidor.

(function () {
  'use strict';

  const MOTTAGARE = 'https://bohagsbolaget-app.vercel.app/api/narvaro';
  const TECKEN = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const LANGD = 16;
  const NYCKEL = 'bb.narvaro.sid';
  const INTERVALL = 30000;
  // Mottagaren släpper igenom ett anrop per sessions-id var tionde sekund.
  // Samma gräns här, så att en flik som göms och visas igen inte skickar
  // förgäves.
  const MINSTA_AVSTAND = 10000;

  if (window.location.pathname.indexOf('/verktyg/') === 0) return;

  /* ------------------------------------------------------ Sessions-id */

  // Rejektionsurval: 252 är 36 × 7, så varje accepterad byte ger ett
  // jämnt fördelat tecken. Modulo på hela byten hade gett de sex första
  // tecknen i alfabetet en liten övervikt.
  function slumpaId() {
    const krypto = window.crypto;
    if (!krypto || typeof krypto.getRandomValues !== 'function') return null;
    let ut = '';
    while (ut.length < LANGD) {
      const bytes = new Uint8Array(LANGD);
      krypto.getRandomValues(bytes);
      for (let i = 0; i < bytes.length && ut.length < LANGD; i++) {
        if (bytes[i] < 252) ut += TECKEN[bytes[i] % 36];
      }
    }
    return ut;
  }

  // sessionStorage kan vara blockerad eller full. Då lever id:t bara i
  // minnet: signalen fungerar, den börjar bara om vid nästa sidladdning.
  function sparatId() {
    try {
      return window.sessionStorage.getItem(NYCKEL);
    } catch (e) {
      return null;
    }
  }

  function spara(id) {
    try {
      window.sessionStorage.setItem(NYCKEL, id);
    } catch (e) {
      /* Inget att göra. Id:t används ändå under den här sidvisningen. */
    }
  }

  let sid = sparatId();
  if (!sid || !/^[a-z0-9]{8,64}$/.test(sid)) {
    sid = slumpaId();
    if (sid) spara(sid);
  }
  if (!sid) return;

  /* ---------------------------------------------------------- Signalen */

  let senast = 0;
  let timer = null;

  function skicka() {
    if (document.visibilityState !== 'visible') return;
    const nu = Date.now();
    if (nu - senast < MINSTA_AVSTAND) return;
    senast = nu;

    // Bara sökvägen. Ingen sökparameter, ingen hash, ingen titel.
    const kropp = JSON.stringify({ sid: sid, path: window.location.pathname });

    try {
      window
        .fetch(MOTTAGARE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: kropp,
          mode: 'cors',
          // Inga kakor åt mottagaren, och ingen referer på vägen dit.
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          cache: 'no-store',
          keepalive: true,
        })
        .catch(function () {
          /* Tyst. Räknaren får aldrig störa den som läser sidan. */
        });
    } catch (e) {
      /* Tyst, av samma skäl. */
    }
  }

  function starta() {
    if (timer !== null) return;
    skicka();
    timer = window.setInterval(skicka, INTERVALL);
  }

  function pausa() {
    if (timer === null) return;
    window.clearInterval(timer);
    timer = null;
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') starta();
    else pausa();
  });

  if (document.visibilityState === 'visible') starta();
})();
