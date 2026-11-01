// Bohagsbolaget.se, livssignalen till den interna appen.
//
// Skickar två uppgifter medan någon läser sidan: ett slumpat sessions-id
// och sidans sökväg. Fredrik och Thom ser då i appen hur många som är inne
// på sajten just nu och vilka sidor som läses.
//
// Dessutom skickas tre händelser: chatten öppnas, ett telefonnummer klickas
// och ett formulär går igenom. Händelsen bär bara sitt eget namn, samma
// sessions-id och sidans sökväg. Ingen ny uppgift om besökaren samlas in,
// och mottagaren räknar händelserna i egna fält utan att röra besökstalet.
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

  // De tre händelsenamn mottagaren känner igen. Allt annat skickas aldrig.
  const HANDELSER = ['chatt-oppnad', 'ring-klick', 'formular-skickat'];

  // Sidan formuläret landar på när Web3Forms har tagit emot det.
  const TACKSIDA = '/tack.html';

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

  /* ------------------------------------------------------------ Postningen */

  /* Ett enda ställe som rör nätet. Både närvarosignalen och händelserna
     går här, med samma inställningar: inga kakor, ingen referer, och ett
     fel som aldrig syns för den som läser sidan. */
  function posta(kropp) {
    try {
      window
        .fetch(MOTTAGARE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(kropp),
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

  /* ---------------------------------------------------------- Signalen */

  let senast = 0;
  let timer = null;

  function skicka() {
    if (document.visibilityState !== 'visible') return;
    const nu = Date.now();
    if (nu - senast < MINSTA_AVSTAND) return;
    senast = nu;

    // Bara sökvägen. Ingen sökparameter, ingen hash, ingen titel.
    posta({ sid: sid, path: window.location.pathname });
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

  /* ---------------------------------------------------------- Händelser */

  /* Händelsen går sin egen väg och rörs inte av tiosekundersspärren: ett
     ringklick direkt efter sidvisningen är verkligt och ska räknas. Den
     uppdaterar inte heller spärren, så en händelse kan aldrig skjuta upp
     nästa närvarosignal. */
  function handelse(namn) {
    if (HANDELSER.indexOf(namn) === -1) return;
    posta({ sid: sid, path: window.location.pathname, handelse: namn });
  }

  /* Chatten räknas på panelens tillstånd, inte på klicket i knappen.
     Klicket kan komma utan att panelen öppnas, och panelen kan öppnas
     på annat sätt än med knappen; det som ska räknas är att chatten
     faktiskt står öppen. */
  function bevakaChatten() {
    const panel = document.getElementById('chattPanel');
    if (!panel) return false;

    let oppenForut = !panel.hidden;
    const vakt = new window.MutationObserver(function () {
      const oppen = !panel.hidden;
      if (oppen && !oppenForut) handelse('chatt-oppnad');
      oppenForut = oppen;
    });
    vakt.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
    return true;
  }

  if (typeof window.MutationObserver === 'function' && !bevakaChatten()) {
    // Chattpanelen byggs av script.js. Står den inte i dokumentet ännu
    // väntar vi in resten av sidan och ger upp tyst om den aldrig kommer.
    document.addEventListener('DOMContentLoaded', bevakaChatten);
  }

  /* Varje tel-länk, var den än står: en lyssnare på dokumentet i stället
     för en per länk, så att en länk som byggs av chatten eller menyn
     räknas den också. Tangentbordet räknas med, eftersom Enter på en
     länk också ger ett click. */
  document.addEventListener(
    'click',
    function (handelsen) {
      const mal = handelsen.target;
      if (!mal || typeof mal.closest !== 'function') return;
      if (mal.closest('a[href^="tel:"]')) handelse('ring-klick');
    },
    true,
  );

  /* Formuläret räknas när tacksidan öppnas, alltså när Web3Forms har
     tagit emot det. En omladdning eller ett steg bakåt är inte ett nytt
     skickat formulär och räknas därför inte; kan webbläsaren inte svara
     på vilken sorts navigering det var räknas sidvisningen. */
  function tacksidanRaknas() {
    if (window.location.pathname !== TACKSIDA) return false;
    try {
      const poster = window.performance.getEntriesByType('navigation');
      if (poster && poster.length && poster[0].type) return poster[0].type === 'navigate';
    } catch (e) {
      /* Saknas stödet räknas sidvisningen, se kommentaren ovan. */
    }
    return true;
  }

  if (tacksidanRaknas()) handelse('formular-skickat');
})();
