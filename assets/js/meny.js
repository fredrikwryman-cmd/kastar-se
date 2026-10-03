// Bohagsbolaget.se – mobilmeny, sidhuvudets glaseffekt och årtalet i sidfoten.
//
// Utbrutet ur script.js så att sidor som inte laddar script.js (till exempel
// /sok/) ändå har en fungerande meny. Laddas på varje sida med
// sidhuvud, före script.js där den filen också laddas. Allt ligger i en egen
// funktion så att namnen inte krockar med script.js.

(function () {
  'use strict';

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

  /* ---------- Header: glaseffekt och scroll-indikator ----------
     Båda delar en enda scroll-lyssnare, throttlad med requestAnimationFrame så
     att layouten läses av högst en gång per bildruta. Saknas headern gör koden
     ingenting – resten av filen ska fungera ändå. */
  const siteHeader = document.querySelector('.site-header');

  if (siteHeader) {
    let ticking = false;

    const updateHeader = () => {
      const y = window.scrollY;
      siteHeader.classList.toggle('scrolled', y > 50);

      // Hur långt ned på sidan vi kommit, 0–1. Styr bredden på indikatorn.
      const max = document.documentElement.scrollHeight - window.innerHeight;
      siteHeader.style.setProperty('--scroll-progress', max > 0 ? Math.min(y / max, 1) : 0);

      ticking = false;
    };

    window.addEventListener('scroll', () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(updateHeader);
      }
    }, { passive: true });

    updateHeader();
  }

  /* ---------- Årtal i sidfoten ---------- */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = '© ' + new Date().getFullYear();
})();
