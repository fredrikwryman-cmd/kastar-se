// Kastar.se – digitala visitkort: dela-knappen.
// Delar sidans adress via systemets delningsruta. Saknas stödet kopieras
// adressen till urklipp i stället och kortet svarar "Länk kopierad".

const delaKnapp = document.getElementById('delaKnapp');
const delaStatus = document.getElementById('delaStatus');

if (delaKnapp) {
  // Kortets riktiga adress står i canonical – den ska delas även om sidan
  // öppnats via en testserver eller med utsläckt bindestreck i URL:en.
  const canonical = document.querySelector('link[rel="canonical"]');
  const adress = (canonical && canonical.href) || window.location.href;

  const visa = (text) => {
    if (!delaStatus) return;
    delaStatus.textContent = text;
    delaStatus.hidden = false;
  };

  const kopiera = async (url) => {
    // Urklippet kräver säker kontext (https eller localhost).
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(url);
        return true;
      } catch (fel) {
        // Faller vidare till reservvägen nedan.
      }
    }
    // Reserv för äldre webbläsare: kopiera från ett fält utanför bilden.
    const falt = document.createElement('textarea');
    falt.value = url;
    falt.setAttribute('readonly', '');
    falt.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0';
    document.body.appendChild(falt);
    falt.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (fel) {
      ok = false;
    }
    falt.remove();
    return ok;
  };

  delaKnapp.addEventListener('click', async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: document.title, url: adress });
        return;
      } catch (fel) {
        // Avbruten delning är inget fel – då säger kortet ingenting.
        if (fel && fel.name === 'AbortError') return;
      }
    }

    const ok = await kopiera(adress);
    visa(ok ? 'Länk kopierad' : adress.replace(/^https?:\/\//, ''));
  });
}
