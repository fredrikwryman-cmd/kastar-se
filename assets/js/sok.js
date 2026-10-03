// Bohagsbolaget.se – sajtsökningen: förslag i sidhuvudet och träfflistan på /sok/.
//
// Sökningen sker helt i besökarens webbläsare. Den läser bara det statiska
// indexet /sok/index.json (byggt av skript/bygg-sokindex.py ur sajtens egna
// sidor) och synonymerna i /sok/synonymer.json. Den skriver ingen egen text:
// varje träff är en sida, en fråga, ett prisavsnitt eller ett föremålssvar som
// redan står publicerat.
//
// Utan JavaScript fungerar sökrutan ändå: den är ett vanligt formulär som
// skickar q till /sok/, och där visar en noscript-ruta tjänsterna och numret.

(function () {
  'use strict';

  const MAX_FORSLAG = 5;
  const TYPNAMN = { sida: 'Sida', faq: 'Fråga', pris: 'Pris', 'föremål': 'Föremål' };
  const TYPORDNING = { 'föremål': 0, sida: 1, pris: 2, faq: 3 };

  /* ---------- Normalisering ----------
     Gemener, och å ä ö (och é) blir a a o e, så att "dodsbo" hittar dödsbo och
     "tomning" hittar tömning. Samma funktion körs på indexet och på sökordet. */
  function normalisera(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  // Helt ord eller hel fras, inte en bit av ett annat ord: "lager" ska inte
  // fånga "lagerflytt".
  function innehaller(fraga, ord) {
    return (' ' + fraga + ' ').indexOf(' ' + ord + ' ') !== -1;
  }

  /* ---------- Motorn laddas först när någon vill söka ---------- */
  let motorLofte = null;

  function laddaMotor() {
    if (motorLofte) return motorLofte;
    const hamta = (url) => fetch(url, { credentials: 'same-origin' }).then((svar) => {
      if (!svar.ok) throw new Error(url + ' svarade ' + svar.status);
      return svar.json();
    });
    motorLofte = Promise.all([
      import('/assets/js/fuse.basic.min.js?v=1'),
      hamta('/sok/index.json?v=2'),
      hamta('/sok/synonymer.json?v=2'),
    ]).then(([modul, index, synonymer]) => {
      const Fuse = modul.default;
      const poster = index.poster;
      const standardGetFn = Fuse.config.getFn;
      const fuse = new Fuse(poster, {
        keys: [
          { name: 'namn', weight: 5 },
          { name: 'ord', weight: 5 },
          { name: 'titel', weight: 3 },
          { name: 'rubriker', weight: 1.5 },
          { name: 'text', weight: 1 },
        ],
        includeScore: true,
        ignoreLocation: true,
        threshold: 0.34,
        minMatchCharLength: 2,
        getFn: (post, sokvag) => {
          const varde = standardGetFn(post, sokvag);
          return Array.isArray(varde) ? varde.map(normalisera) : normalisera(varde);
        },
      });
      const syn = synonymer.map((g) => ({ ord: g.ord.map(normalisera), till: g.till }));
      const foremal = poster
        .filter((p) => p.typ === 'föremål')
        .map((p) => ({ post: p, ord: p.ord.map(normalisera) }));
      return { fuse, poster, syn, foremal };
    });
    motorLofte.catch(() => { motorLofte = null; });
    return motorLofte;
  }

  /* ---------- Själva sökningen ----------
     Ordning: föremål som sökordet nämner, sedan synonymernas mål, sedan
     likhetsmatchningen. Varje post visas en gång. */
  function sok(motor, text) {
    const fraga = normalisera(text);
    if (fraga.length < 2) return [];
    const ut = [];
    const sett = new Set();
    const lagg = (p) => { if (p && !sett.has(p.id)) { sett.add(p.id); ut.push(p); } };

    motor.foremal.forEach((f) => {
      if (f.ord.some((o) => innehaller(fraga, o))) lagg(f.post);
    });

    motor.syn.forEach((g) => {
      if (!g.ord.some((o) => innehaller(fraga, o))) return;
      const t = g.till;
      motor.poster.forEach((p) => {
        if (t.url && p.typ === 'sida' && p.url === t.url) lagg(p);
        else if (t.typ && p.typ === t.typ) lagg(p);
        else if (t.titel && p.titel === t.titel) lagg(p);
      });
    });

    motor.fuse.search(fraga)
      .sort((a, b) => (a.score - b.score) || (TYPORDNING[a.item.typ] - TYPORDNING[b.item.typ]))
      .forEach((r) => lagg(r.item));

    return ut;
  }

  function radText(p) {
    const delar = [TYPNAMN[p.typ] || ''];
    if (p.sida && p.typ !== 'sida') delar.push(p.sida);
    return delar.join(' · ') + ': ' + p.utdrag;
  }

  /* ==========================================================================
     Sökrutan i sidhuvudet (combobox med listbox)
     ========================================================================== */
  function initRuta(ruta) {
    const falt = ruta.querySelector('.sok-falt');
    const lista = ruta.querySelector('.sok-lista');
    const status = ruta.querySelector('.sok-status');
    const knapp = ruta.querySelector('summary');
    if (!falt || !lista || !status || !knapp) return;

    // Roller sätts här och inte i markupen: utan JavaScript finns inga
    // förslag, och då ska fältet vara ett vanligt sökfält.
    falt.setAttribute('role', 'combobox');
    falt.setAttribute('aria-autocomplete', 'list');
    falt.setAttribute('aria-expanded', 'false');
    falt.setAttribute('aria-controls', lista.id);

    let traffar = [];
    let aktiv = -1;
    let senast = 0;
    let vantan = null;

    function stangLista() {
      lista.hidden = true;
      lista.textContent = '';
      falt.setAttribute('aria-expanded', 'false');
      falt.removeAttribute('aria-activedescendant');
      traffar = [];
      aktiv = -1;
    }

    function satAktiv(i) {
      const val = lista.querySelectorAll('[role="option"]');
      if (!val.length) return;
      aktiv = (i + val.length) % val.length;
      val.forEach((v, n) => v.setAttribute('aria-selected', n === aktiv ? 'true' : 'false'));
      falt.setAttribute('aria-activedescendant', val[aktiv].id);
      val[aktiv].scrollIntoView({ block: 'nearest' });
    }

    function visa(lista5) {
      lista.textContent = '';
      traffar = lista5;
      aktiv = -1;
      falt.removeAttribute('aria-activedescendant');
      lista5.forEach((p, i) => {
        const li = document.createElement('li');
        li.id = lista.id + '-' + i;
        li.className = 'sok-val';
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        const titel = document.createElement('span');
        titel.className = 'sok-val-titel';
        titel.textContent = p.titel;
        const rad = document.createElement('span');
        rad.className = 'sok-val-text';
        rad.textContent = radText(p);
        li.append(titel, rad);
        // mousedown i stället för click: fältet hinner annars tappa fokus.
        li.addEventListener('mousedown', (e) => { e.preventDefault(); gaTill(p); });
        li.addEventListener('mousemove', () => { if (aktiv !== i) satAktiv(i); });
        lista.appendChild(li);
      });
      const oppen = lista5.length > 0;
      lista.hidden = !oppen;
      falt.setAttribute('aria-expanded', oppen ? 'true' : 'false');
    }

    function gaTill(p) {
      window.location.href = p.url;
    }

    function kor() {
      const text = falt.value;
      const nr = ++senast;
      if (normalisera(text).length < 2) {
        stangLista();
        status.textContent = '';
        return;
      }
      laddaMotor().then((motor) => {
        if (nr !== senast) return;            // ett nyare sökord har hunnit före
        const alla = sok(motor, text);
        visa(alla.slice(0, MAX_FORSLAG));
        status.textContent = alla.length === 0
          ? 'Inga träffar. Tryck Enter för att söka ändå.'
          : alla.length + (alla.length === 1 ? ' träff' : ' träffar') +
            (alla.length > MAX_FORSLAG ? ', ' + MAX_FORSLAG + ' visas' : '') +
            '. Pil ned för att välja.';
      }).catch(() => {
        // Indexet gick inte att hämta. Formuläret till /sok/ fungerar ändå.
        stangLista();
      });
    }

    falt.addEventListener('focus', () => { laddaMotor().catch(() => {}); });
    falt.addEventListener('input', () => {
      clearTimeout(vantan);
      vantan = setTimeout(kor, 90);
    });

    falt.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (lista.hidden) {
          if (traffar.length || falt.value) kor();
          return;
        }
        e.preventDefault();
        satAktiv(e.key === 'ArrowDown' ? aktiv + 1 : (aktiv < 0 ? -1 : aktiv - 1));
      } else if (e.key === 'Enter') {
        if (!lista.hidden && aktiv >= 0 && traffar[aktiv]) {
          e.preventDefault();
          gaTill(traffar[aktiv]);
        }
        // Annars skickas formuläret som vanligt till /sok/?q=…
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (!lista.hidden) {
          stangLista();
        } else if (ruta.open) {
          ruta.open = false;
          knapp.focus();
        }
      }
    });

    falt.addEventListener('blur', () => {
      // Ett klick i listan hanteras på mousedown, före blur.
      setTimeout(() => { if (document.activeElement !== falt) stangLista(); }, 0);
    });

    // Rutan öppnas och stängs av <details> själv, även utan JavaScript.
    // Här flyttas bara fokus in, och mobilmenyn stängs så att de två
    // panelerna inte ligger ovanpå varandra.
    const navToggle = document.getElementById('navToggle');
    const nav = document.getElementById('nav');
    ruta.addEventListener('toggle', () => {
      if (ruta.open) {
        if (nav && navToggle && nav.classList.contains('open')) navToggle.click();
        falt.focus();
      } else {
        stangLista();
      }
    });
    if (navToggle) {
      navToggle.addEventListener('click', () => { if (ruta.open) ruta.open = false; });
    }

    // Escape var som helst i rutan, och klick utanför, stänger den.
    ruta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && e.target !== falt && ruta.open) {
        ruta.open = false;
        knapp.focus();
      }
    });
    document.addEventListener('click', (e) => {
      if (ruta.open && !ruta.contains(e.target)) ruta.open = false;
    });
  }

  /* ==========================================================================
     Sidan /sok/
     ========================================================================== */
  const TJANSTER = [
    ['/tjanster/flytthjalp/', 'Flytthjälp'],
    ['/tjanster/tomning/', 'Tömning'],
    ['/tjanster/dodsbo/', 'Dödsbo'],
    ['/tjanster/bortforsling/', 'Bortforsling'],
    ['/tjanster/nedmontering/', 'Nedmontering och rivning'],
    ['/tjanster/magasinering/', 'Magasinering'],
    ['/tjanster/foretag/', 'Företag och föreningar'],
  ];

  function el(tagg, klass, text) {
    const e = document.createElement(tagg);
    if (klass) e.className = klass;
    if (text != null) e.textContent = text;
    return e;
  }

  function lank(href, text) {
    const a = el('a', null, text);
    a.href = href;
    return a;
  }

  function nollTraffar(fraga) {
    const ruta = el('div', 'sok-noll');
    // Sökordet skrivs ut med textContent, aldrig som HTML.
    ruta.appendChild(el('p', 'sok-noll-rubrik', 'Vi hittade inget för ”' + fraga + '”.'));
    ruta.appendChild(el('p', null, 'Prova ett annat ord, eller välj en av våra tjänster:'));
    const ul = el('ul', 'sok-noll-tjanster');
    TJANSTER.forEach(([href, namn]) => {
      const li = el('li');
      li.appendChild(lank(href, namn));
      ul.appendChild(li);
    });
    ruta.appendChild(ul);
    const p = el('p');
    p.append('Du kan också ringa oss på ', lank('tel:+46705614845', '070-561 48 45'),
      ' eller ', lank('/#kontakt', 'skicka en förfrågan i formuläret'), '.');
    ruta.appendChild(p);
    return ruta;
  }

  function initSida(yta) {
    const falt = document.getElementById('sokSidaFalt');
    const status = document.getElementById('sokSidaStatus');
    const ut = document.getElementById('sokSidaTraffar');
    if (!falt || !status || !ut) return;

    const fraga = (new URLSearchParams(window.location.search).get('q') || '').trim();
    falt.value = fraga;
    if (!fraga) {
      status.textContent = 'Skriv vad du letar efter, till exempel dödsbo, piano eller magasinering.';
      return;
    }
    document.title = 'Sök: ' + fraga + ' – Bohagsbolaget.se';
    status.textContent = 'Söker …';

    laddaMotor().then((motor) => {
      const traffar = sok(motor, fraga);
      ut.textContent = '';
      if (!traffar.length) {
        status.textContent = '0 träffar för ”' + fraga + '”.';
        ut.appendChild(nollTraffar(fraga));
        yta.classList.add('sok-tom');
        return;
      }
      status.textContent = traffar.length + (traffar.length === 1 ? ' träff' : ' träffar') +
        ' för ”' + fraga + '”.';
      const ol = el('ol', 'sok-traffar');
      traffar.forEach((p) => {
        const li = el('li', 'sok-traff');
        const h = el('h2', 'sok-traff-titel');
        h.appendChild(lank(p.url, p.titel));
        const typ = el('p', 'sok-traff-typ', TYPNAMN[p.typ] + (p.sida ? ' · ' + p.sida : ''));
        const text = el('p', 'sok-traff-text', p.utdrag);
        li.append(h, typ, text);
        ol.appendChild(li);
      });
      ut.appendChild(ol);
    }).catch(() => {
      status.textContent = 'Sökningen gick inte att ladda just nu.';
      ut.textContent = '';
      ut.appendChild(nollTraffar(fraga));
    });
  }

  document.querySelectorAll('details.sok').forEach(initRuta);
  const sida = document.getElementById('sokSida');
  if (sida) initSida(sida);
})();
