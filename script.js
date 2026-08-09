// Kastar.se – liten mängd JavaScript för meny och årtal.

// Mobilmeny (hamburgare)
const toggle = document.getElementById('navToggle');
const nav = document.getElementById('nav');

if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  // Stäng menyn när man klickar på en länk (mobil)
  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

// Sätt årtal i sidfoten automatiskt
const yearEl = document.getElementById('year');
if (yearEl) {
  yearEl.textContent = '© ' + new Date().getFullYear();
}
