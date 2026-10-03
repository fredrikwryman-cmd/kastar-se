// Bohagsbolaget.se – markerar sökordet på målsidan efter en sökträff.
//
// Sökningen länkar till <sida>?markera=<sökord>#<id>. Den här filen öppnar
// rätt avsnitt, markerar de ord på sidan som liknar sökordet, scrollar dit
// och lämnar fokus där. Markeringen försvinner vid första klick eller
// tangenttryck. Allt sker i webbläsaren; ingen text skrivs om, och sökordet
// används bara för jämförelse, aldrig som HTML.
//
// Utan JavaScript fungerar ankaret ensamt: besökaren hamnar på rätt avsnitt,
// bara utan markering.

(function () {
  'use strict';

  const KLASS = 'sok-markering';
  const MAX_TECKEN = 40;
  const LUFT = 16;   // px mellan sidhuvudets underkant och målet

  // Gemener, och å ä ö blir a a o, så att dödsbå och dodsbo jämförs lika.
  function normalisera(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  }

  function avstand(a, b) {
    if (a === b) return 0;
    const rad = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let fore = rad[0];
      rad[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = rad[j];
        rad[j] = Math.min(rad[j] + 1, rad[j - 1] + 1, fore + (a[i - 1] === b[j - 1] ? 0 : 1));
        fore = tmp;
      }
    }
    return rad[b.length];
  }

  // Exakt träff: samma ord, eller ett ord som börjar med sökordet. Så
  // markerar "rutavdrag" ordet RUT-avdraget men aldrig rotavdrag.
  function exakt(ord, sok) {
    if (!ord || !sok) return false;
    if (ord === sok) return true;
    return sok.length >= 3 && ord.startsWith(sok);
  }

  // Suddig träff, som bara används när sökordet inte finns exakt på sidan:
  // en bokstav fel (två för längre ord). Så markerar "pianno" ordet piano.
  function liknar(ord, sok) {
    if (exakt(ord, sok)) return true;
    if (!ord || !sok || sok.length < 3) return false;
    if (sok.length < 4 || ord.length < 3) return false;
    const tolerans = sok.length >= 8 ? 2 : 1;
    if (Math.abs(ord.length - sok.length) <= tolerans && avstand(ord, sok) <= tolerans) return true;
    // Längre sammansättningar: jämför början av ordet med sökordet.
    return ord.length > sok.length && sok.length >= 5 && avstand(ord.slice(0, sok.length), sok) <= 1;
  }

  const RUBRIK = /^H[1-6]$/;

  // Vilken del av sidan som hör till målet. En rubrik äger allt fram till
  // nästa rubrik på samma eller högre nivå; main står för sidans topp.
  function omrade(el) {
    if (el.tagName === 'MAIN') {
      const h1 = el.querySelector('h1');
      return h1 ? [h1] : [el];
    }
    if (!RUBRIK.test(el.tagName)) return [el];
    const niva = Number(el.tagName[1]);
    const delar = [el];
    let n = el.nextElementSibling;
    while (n && !(RUBRIK.test(n.tagName) && Number(n.tagName[1]) <= niva)) {
      delar.push(n);
      n = n.nextElementSibling;
    }
    return delar;
  }

  // Rubriken som markeras när inget ord liknar sökordet.
  function rubrikFor(el) {
    if (el.tagName === 'MAIN') return el.querySelector('h1');
    if (RUBRIK.test(el.tagName)) return el;
    if (el.tagName === 'DETAILS') return el.querySelector('summary');
    const fraga = el.closest('details');
    if (fraga) return fraga.querySelector('summary');
    let n = el;
    while (n && n !== document.body) {
      let s = n.previousElementSibling;
      while (s) {
        if (RUBRIK.test(s.tagName)) return s;
        s = s.previousElementSibling;
      }
      n = n.parentElement;
    }
    return null;
  }

  const ORD = /[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu;

  function textnoder(rot) {
    const gang = document.createTreeWalker(rot, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest('script, style, mark, [aria-hidden="true"]')
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const noder = [];
    while (gang.nextNode()) noder.push(gang.currentNode);
    return noder;
  }

  // Finns sökordet exakt någonstans på sidan? Då används bara exakta träffar
  // för det ordet, och felstavningstoleransen stängs av.
  function finnsExakt(sok) {
    const rot = document.querySelector('main') || document.body;
    return textnoder(rot).some((nod) => {
      let m;
      ORD.lastIndex = 0;
      while ((m = ORD.exec(nod.data))) {
        if (exakt(normalisera(m[0]), sok)) return true;
      }
      return false;
    });
  }

  // Delar textnoder och lindar varje träff i <mark>. Bara textnoder och
  // createElement används, aldrig innerHTML.
  function markeraOrd(delar, sokord) {
    const prov = sokord.map((s) => (finnsExakt(s) ? exakt : liknar));
    const marks = [];
    delar.forEach((del) => {
      textnoder(del).forEach((nod) => {
        const traffar = [];
        let m;
        ORD.lastIndex = 0;
        while ((m = ORD.exec(nod.data))) {
          const ord = normalisera(m[0]);
          if (sokord.some((s, i) => prov[i](ord, s))) traffar.push([m.index, m[0].length]);
        }
        // Bakifrån, så att tidigare positioner inte flyttas av delningen.
        for (let i = traffar.length - 1; i >= 0; i--) {
          const [start, langd] = traffar[i];
          const ordNod = nod.splitText(start);
          ordNod.splitText(langd);
          const mark = document.createElement('mark');
          mark.className = KLASS;
          ordNod.parentNode.replaceChild(mark, ordNod);
          mark.appendChild(ordNod);
          marks.push(mark);
        }
      });
    });
    return marks;
  }

  function markeraRubrik(rubrik) {
    if (!rubrik) return [];
    const mark = document.createElement('mark');
    mark.className = KLASS;
    while (rubrik.firstChild) mark.appendChild(rubrik.firstChild);
    rubrik.appendChild(mark);
    return [mark];
  }

  function taBort() {
    document.querySelectorAll('mark.' + KLASS).forEach((mark) => {
      const foralder = mark.parentNode;
      while (mark.firstChild) foralder.insertBefore(mark.firstChild, mark);
      foralder.removeChild(mark);
      foralder.normalize();
    });
  }

  let lyssnar = false;
  function taBortVidForstaHandling() {
    if (lyssnar) return;
    lyssnar = true;
    const stad = () => {
      lyssnar = false;
      document.removeEventListener('pointerdown', stad, true);
      document.removeEventListener('keydown', stad, true);
      taBort();
    };
    document.addEventListener('pointerdown', stad, true);
    document.addEventListener('keydown', stad, true);
  }

  function sidhuvudetsHojd() {
    const h = document.querySelector('.site-header');
    if (!h) return 0;
    return getComputedStyle(h).position === 'fixed' || getComputedStyle(h).position === 'sticky'
      ? h.getBoundingClientRect().height : 0;
  }

  // Elementets läge i dokumentet utan transform. getBoundingClientRect räknar
  // med .reveal-blockens translateY, som försvinner när de tonat in, och då
  // hamnade målet 24 px för högt, under sidhuvudet.
  function dokumentTopp(el) {
    let y = 0;
    for (let n = el; n; n = n.offsetParent) y += n.offsetTop;
    return y;
  }

  function scrollaTill(el) {
    const lugnt = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mal = dokumentTopp(el) - sidhuvudetsHojd() - LUFT;
    window.scrollTo({ top: Math.max(0, mal), behavior: lugnt ? 'auto' : 'smooth' });
  }

  function markera(id, text) {
    const el = id ? document.getElementById(id) : null;
    if (!el) return false;
    const sokord = String(text || '').slice(0, MAX_TECKEN)
      .split(/\s+/).map(normalisera).filter((s) => s.length >= 2);

    taBort();
    // Ett svar i en stängd fråga syns inte förrän frågan öppnas.
    if (el.tagName === 'DETAILS') el.open = true;
    const fraga = el.parentElement && el.parentElement.closest('details');
    if (fraga) fraga.open = true;

    let marks = sokord.length ? markeraOrd(omrade(el), sokord) : [];
    if (!marks.length) marks = markeraRubrik(rubrikFor(el));

    const mal = el.tagName === 'MAIN' ? (el.querySelector('h1') || el) : el;
    scrollaTill(mal);
    if (!mal.hasAttribute('tabindex')) mal.setAttribute('tabindex', '-1');
    mal.focus({ preventScroll: true });
    if (marks.length) taBortVidForstaHandling();
    return true;
  }

  // sok.js anropar den här direkt när målet ligger på sidan man redan står på.
  window.bbMarkera = markera;

  const adress = new URL(window.location.href);
  const sokt = adress.searchParams.get('markera');
  if (sokt !== null && adress.hash.length > 1) {
    // Bort med parametern ur adressfältet, ankaret står kvar.
    adress.searchParams.delete('markera');
    history.replaceState(history.state, '', adress.pathname + adress.search + adress.hash);
    const id = decodeURIComponent(adress.hash.slice(1));
    const kor = () => markera(id, sokt);
    // Webbläsaren hoppar själv till ankaret vid laddning. Vi väntar tills
    // sidan laddat klart, så att bilder inte flyttar målet efter scrollen.
    if (document.readyState === 'complete') kor();
    else window.addEventListener('load', kor, { once: true });
  }
})();
