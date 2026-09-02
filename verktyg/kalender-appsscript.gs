/**
 * JOBBREGISTER - Google Apps Script-backend (webbapp) for internt jobbregister.
 *
 * SA HAR SATTER DU UPP DET (Fredrik):
 *
 *  1. Skapa ett nytt Google-kalkylark. Dop bladet (fliken langst ned) till exakt: Jobb
 *     Klistra in rubrikraden i rad 1, en rubrik per kolumn, i denna ordning:
 *
 *       id, skapad, status, datum, starttid, timmar, kund_namn, kund_tel, kund_epost,
 *       fran_adress, till_adress, tjanster, volym_m3, yta_kvm, pris_total, arbetskostnad,
 *       rut_belopp, kund_betalar, bemanning, stad_bokad, stad_datum, noteringar,
 *       fakturanr, faktura_datum, rut_ansokt_datum, betald_datum
 *
 *  2. Gar till Tillagg -> Apps Script. Radera exempelkoden som ligger dar och
 *     klistra in hela den har filen i stallet. Spara.
 *
 *  3. Byt LOSENORD har nedanfor till nagot eget. Lat inte 'BYT_MIG' sta kvar.
 *
 *  4. Distribuera -> Ny distribution -> valj typ Webbapp.
 *     Kor som: jag (din egen adress).
 *     Vem har atkomst: alla med lanken.
 *
 *  5. Godkann behorigheterna. Forsta gangen varnar Google for en overifierad app.
 *     Klicka Avancerat -> Fortsatt till projektet, och godkann.
 *
 *  6. Kopiera webbadressen som slutar pa /exec. Den adressen och losenordet
 *     klistrar du in i verktygets installningsvy.
 *
 *  7. Andrar du koden harefter maste du distribuera om (Distribuera -> Hantera
 *     distributioner -> pennan -> Version: Ny version). Annars fortsatter Google
 *     att kora den gamla versionen och dina andringar syns inte.
 *
 * VIKTIGT OM SAKERHET:
 * Webbadressen (/exec) och losenordet far ALDRIG laggas in i kodrepot - repot ar
 * publikt, och den som far tag pa adress + losenord kommer at hela jobbregistret
 * med kunduppgifter. Spara dem bara i verktygets installningsvy (lokalt i webblasaren)
 * eller nagon annan privat plats.
 */

/** Delat losenord. BYT UT innan du distribuerar. */
var LOSENORD = 'BYT_MIG';

/** Bladets namn i kalkylarket. */
var BLADNAMN = 'Jobb';

/** Bladet for den delade anteckningslistan. Rubrikraden ligger i
 *  verktyg/anteckningar-kolumner.txt. */
var BLADNAMN_ANTECKNINGAR = 'Anteckningar';


/* ------------------------------------------------------------------ */
/* Ingangar                                                            */
/* ------------------------------------------------------------------ */

function doGet(e) {
  return hanteraAnrop(e);
}

function doPost(e) {
  return hanteraAnrop(e);
}

/**
 * Gemensam hantering for GET och POST. Plockar parametrar fran e.parameter
 * och/eller fran en JSON-body i e.postData.contents.
 */
function hanteraAnrop(e) {
  try {
    var indata = laesIndata(e);

    // Losenordskontroll allra forst. Ingen data lamnar servern utan ratt losenord.
    if (!indata.losenord || String(indata.losenord) !== String(LOSENORD)) {
      return svara({ ok: false, fel: 'Fel losenord', kod: 401 });
    }

    var atgard = indata.atgard ? String(indata.atgard) : '';

    if (atgard === 'lista') {
      return svara({ ok: true, data: atgardLista(indata) });
    }
    if (atgard === 'skapa') {
      return svara({ ok: true, data: atgardSkapa(indata) });
    }
    if (atgard === 'uppdatera') {
      return svara({ ok: true, data: atgardUppdatera(indata) });
    }
    if (atgard === 'ant_lista') {
      return svara({ ok: true, data: atgardAntLista(indata) });
    }
    if (atgard === 'ant_skapa') {
      return svara({ ok: true, data: atgardAntSkapa(indata) });
    }
    if (atgard === 'ant_uppdatera') {
      return svara({ ok: true, data: atgardAntUppdatera(indata) });
    }
    if (atgard === 'ant_radera') {
      return svara({ ok: true, data: atgardAntRadera(indata) });
    }

    return svara({ ok: false, fel: 'Okand atgard' });

  } catch (fel) {
    return svara({ ok: false, fel: (fel && fel.message) ? fel.message : String(fel) });
  }
}

/**
 * Slar ihop e.parameter (GET/formulardata) med en eventuell JSON-body.
 * JSON-body vinner vid krock, eftersom den ar det uttryckliga anropet.
 */
function laesIndata(e) {
  var indata = {};

  if (e && e.parameter) {
    for (var nyckel in e.parameter) {
      if (Object.prototype.hasOwnProperty.call(e.parameter, nyckel)) {
        indata[nyckel] = e.parameter[nyckel];
      }
    }
  }

  // Falt som skickats som JSON-strangar via GET packas upp.
  ['jobb', 'andringar'].forEach(function (faltnamn) {
    if (typeof indata[faltnamn] === 'string') {
      try {
        indata[faltnamn] = JSON.parse(indata[faltnamn]);
      } catch (ignorerat) {
        // Lamna varden som den ar om den inte var giltig JSON.
      }
    }
  });

  if (e && e.postData && e.postData.contents) {
    var kropp = {};
    try {
      kropp = JSON.parse(e.postData.contents) || {};
    } catch (fel) {
      throw new Error('Kunde inte tolka JSON i anropet: ' + fel.message);
    }
    for (var kroppNyckel in kropp) {
      if (Object.prototype.hasOwnProperty.call(kropp, kroppNyckel)) {
        indata[kroppNyckel] = kropp[kroppNyckel];
      }
    }
  }

  return indata;
}

/** Bygger ett JSON-svar. */
function svara(objekt) {
  return ContentService
    .createTextOutput(JSON.stringify(objekt))
    .setMimeType(ContentService.MimeType.JSON);
}


/* ------------------------------------------------------------------ */
/* Atgarder                                                            */
/* ------------------------------------------------------------------ */

/**
 * lista: alla jobb som objekt. Valfria falt fran/till (YYYY-MM-DD) filtrerar
 * pa kolumnen datum, granserna inkluderade.
 */
function atgardLista(indata) {
  var blad = haemtaBlad();
  var kolumner = haemtaKolumner(blad);
  var antalRader = blad.getLastRow() - 1;

  if (antalRader < 1) {
    return [];
  }

  var varden = blad.getRange(2, 1, antalRader, kolumner.length).getValues();
  var fran = indata.fran ? String(indata.fran).slice(0, 10) : '';
  var till = indata.till ? String(indata.till).slice(0, 10) : '';

  var jobbLista = [];
  for (var i = 0; i < varden.length; i++) {
    var jobb = radTillObjekt(varden[i], kolumner);

    // Hoppa over helt tomma rader.
    if (!jobb.id && !jobb.datum && !jobb.kund_namn) {
      continue;
    }

    var datum = jobb.datum || '';
    if (fran && (!datum || datum < fran)) {
      continue;
    }
    if (till && (!datum || datum > till)) {
      continue;
    }

    jobbLista.push(jobb);
  }

  return jobbLista;
}

/**
 * skapa: lagger till en ny rad sist. id och skapad satts server-side.
 * Falt som saknas blir tomma strangar.
 */
function atgardSkapa(indata) {
  var inkommande = indata.jobb || indata.data || {};
  if (typeof inkommande !== 'object' || inkommande === null) {
    throw new Error('Faltet jobb maste vara ett objekt');
  }

  var las = LockService.getScriptLock();
  if (!las.tryLock(10000)) {
    throw new Error('Kunde inte fa skrivlas, forsok igen om en stund');
  }

  try {
    var blad = haemtaBlad();
    var kolumner = haemtaKolumner(blad);

    var nyttJobb = {};
    for (var i = 0; i < kolumner.length; i++) {
      var kolumn = kolumner[i];
      var varde = inkommande[kolumn];
      nyttJobb[kolumn] = (varde === undefined || varde === null) ? '' : String(varde);
    }

    nyttJobb.id = skapaId();
    nyttJobb.skapad = new Date().toISOString();

    var rad = [];
    for (var j = 0; j < kolumner.length; j++) {
      rad.push(nyttJobb[kolumner[j]]);
    }

    // Formatet satts pa raden INNAN vardena skrivs. Skrivs de forst hinner
    // Sheets tolka dem som tal och de inledande nollorna ar redan borta.
    var nyttRadnummer = blad.getLastRow() + 1;
    var nyttOmrade = blad.getRange(nyttRadnummer, 1, 1, kolumner.length);
    nyttOmrade.setNumberFormat('@');
    nyttOmrade.setValues([rad]);
    SpreadsheetApp.flush();

    return nyttJobb;

  } finally {
    las.releaseLock();
  }
}

/**
 * uppdatera: las-andra-skriv pa en enskild rad.
 * Endast de falt som finns i "andringar" skrivs om - resten av raden lamnas
 * exakt som den ligger i arket. Da kan tva personer andra olika falt pa samma
 * jobb utan att skriva over varandras arbete.
 */
function atgardUppdatera(indata) {
  var id = indata.id ? String(indata.id) : '';
  if (!id) {
    throw new Error('Faltet id saknas');
  }

  var andringar = indata.andringar || {};
  if (typeof andringar !== 'object' || andringar === null) {
    throw new Error('Faltet andringar maste vara ett objekt');
  }

  var las = LockService.getScriptLock();
  if (!las.tryLock(10000)) {
    throw new Error('Kunde inte fa skrivlas, forsok igen om en stund');
  }

  try {
    var blad = haemtaBlad();
    var kolumner = haemtaKolumner(blad);
    var idIndex = kolumner.indexOf('id');
    if (idIndex === -1) {
      throw new Error('Kolumnen id saknas i rubrikraden');
    }

    var radnummer = hittaRadnummer(blad, kolumner, id);
    if (radnummer === -1) {
      throw new Error('Hittade inget jobb med id ' + id);
    }

    // Las den befintliga raden fardigt innan nagot skrivs.
    var omrade = blad.getRange(radnummer, 1, 1, kolumner.length);
    var befintligRad = omrade.getValues()[0];

    // Skriv bara over de namngivna falten.
    for (var faltnamn in andringar) {
      if (!Object.prototype.hasOwnProperty.call(andringar, faltnamn)) {
        continue;
      }
      // id och skapad ar server-agda och far inte andras av klienten.
      if (faltnamn === 'id' || faltnamn === 'skapad') {
        continue;
      }
      var kolumnIndex = kolumner.indexOf(faltnamn);
      if (kolumnIndex === -1) {
        continue; // Okant falt ignoreras hellre an kraschar.
      }
      var nyttVarde = andringar[faltnamn];
      befintligRad[kolumnIndex] = (nyttVarde === undefined || nyttVarde === null)
        ? ''
        : String(nyttVarde);
    }

    // Aven har satts formatet fore skrivningen, annars aterkommer felet
    // vid varje redigering av ett telefonnummer eller fakturanummer.
    omrade.setNumberFormat('@');
    omrade.setValues([befintligRad]);
    SpreadsheetApp.flush();

    // Las tillbaka raden sa att klienten far exakt det som star i arket.
    var sparadRad = blad.getRange(radnummer, 1, 1, kolumner.length).getValues()[0];
    return radTillObjekt(sparadRad, kolumner);

  } finally {
    las.releaseLock();
  }
}


/* ------------------------------------------------------------------ */
/* Hjalpfunktioner                                                     */
/* ------------------------------------------------------------------ */

/** Hamtar bladet Jobb, eller kastar ett begripligt fel. */
function haemtaBlad() {
  var kalkylark = SpreadsheetApp.getActiveSpreadsheet();
  if (!kalkylark) {
    throw new Error('Skriptet ar inte kopplat till nagot kalkylark');
  }
  var blad = kalkylark.getSheetByName(BLADNAMN);
  if (!blad) {
    throw new Error('Hittade inget blad som heter ' + BLADNAMN);
  }
  saekraTextformat(blad);
  return blad;
}

/**
 * Satter oformaterad text ('@') pa hela bladet.
 *
 * Med standardformat tolkar Sheets varden som tal, och tal har inga
 * inledande nollor: 070 033 22 20 blir 70 033 22 20 och fakturanummer
 * 001 blir 1. Samma fella drabbar postnummer, portkoder och
 * lagenhetsnummer i noteringar. Datumen skrivs redan som text i formen
 * 2026-09-09, sa ingenting i arket vinner pa talformat.
 *
 * Korsvis en gang per korning - flaggan hindrar att varje anrop i samma
 * exekvering gor om samma skrivning.
 */
var formatSatt = false;
function saekraTextformat(blad) {
  if (formatSatt) {
    return;
  }
  blad.getRange(1, 1, blad.getMaxRows(), blad.getMaxColumns()).setNumberFormat('@');
  formatSatt = true;
}

/**
 * Laser kolumnordningen ur rubrikraden i stallet for att hardkoda index.
 * Da overlever koden att nagon lagger till eller flyttar en kolumn.
 */
function haemtaKolumner(blad) {
  var sistaKolumn = blad.getLastColumn();
  if (sistaKolumn < 1) {
    throw new Error('Rubrikraden i bladet ' + BLADNAMN + ' ar tom');
  }
  var rubriker = blad.getRange(1, 1, 1, sistaKolumn).getValues()[0];
  var kolumner = [];
  for (var i = 0; i < rubriker.length; i++) {
    kolumner.push(String(rubriker[i]).trim());
  }
  if (kolumner.indexOf('id') === -1) {
    throw new Error('Rubrikraden maste innehalla kolumnen id');
  }
  return kolumner;
}

/** Letar upp radnumret (1-baserat, som i arket) for ett givet id. */
function hittaRadnummer(blad, kolumner, id) {
  var antalRader = blad.getLastRow() - 1;
  if (antalRader < 1) {
    return -1;
  }
  var idIndex = kolumner.indexOf('id');
  var idKolumn = blad.getRange(2, idIndex + 1, antalRader, 1).getValues();
  for (var i = 0; i < idKolumn.length; i++) {
    if (String(idKolumn[i][0]).trim() === id) {
      return i + 2; // +2 for rubrikraden och 1-baserade radnummer.
    }
  }
  return -1;
}

/** Gor om en rad fran arket till ett objekt med kolumnnamnen som nycklar. */
function radTillObjekt(rad, kolumner) {
  var jobb = {};
  for (var i = 0; i < kolumner.length; i++) {
    jobb[kolumner[i]] = normalisera(kolumner[i], rad[i]);
  }
  return jobb;
}

/**
 * Normaliserar ett cellvarde till en strang sa att klienten aldrig far
 * Date-objekt eller serialiserade tidsstamplar i JSON.
 * Datumkolumner blir YYYY-MM-DD, tidskolumner blir HH:MM.
 */
function normalisera(kolumnnamn, varde) {
  if (varde === null || varde === undefined || varde === '') {
    return '';
  }

  var tidszon = Session.getScriptTimeZone() || 'Europe/Stockholm';

  if (Object.prototype.toString.call(varde) === '[object Date]') {
    if (arTidskolumn(kolumnnamn)) {
      return Utilities.formatDate(varde, tidszon, 'HH:mm');
    }
    if (kolumnnamn === 'skapad') {
      return varde.toISOString();
    }
    return Utilities.formatDate(varde, tidszon, 'yyyy-MM-dd');
  }

  // Tid kan ligga som text, t.ex. "8:00" eller "08:00:00".
  if (arTidskolumn(kolumnnamn)) {
    var text = String(varde).trim();
    var traff = text.match(/^(\d{1,2}):(\d{2})/);
    if (traff) {
      var timme = traff[1].length === 1 ? '0' + traff[1] : traff[1];
      return timme + ':' + traff[2];
    }
    return text;
  }

  // Datum kan ligga som text, t.ex. "2026-09-01" eller "2026-09-01T00:00:00".
  if (arDatumkolumn(kolumnnamn)) {
    var datumtext = String(varde).trim();
    var datumtraff = datumtext.match(/^(\d{4}-\d{2}-\d{2})/);
    if (datumtraff) {
      return datumtraff[1];
    }
    return datumtext;
  }

  return String(varde);
}

/** Kolumner som innehaller ett datum. */
function arDatumkolumn(kolumnnamn) {
  return kolumnnamn === 'datum'
    || kolumnnamn === 'stad_datum'
    || kolumnnamn === 'faktura_datum'
    || kolumnnamn === 'rut_ansokt_datum'
    || kolumnnamn === 'betald_datum';
}

/** Kolumner som innehaller ett klockslag. */
function arTidskolumn(kolumnnamn) {
  return kolumnnamn === 'starttid';
}

/** Skapar ett id pa formen tidsstampel-sexslumptecken. */
function skapaId() {
  var tecken = 'abcdefghijklmnopqrstuvwxyz0123456789';
  var slumpdel = '';
  for (var i = 0; i < 6; i++) {
    slumpdel += tecken.charAt(Math.floor(Math.random() * tecken.length));
  }
  return Date.now() + '-' + slumpdel;
}


/* ------------------------------------------------------------------ */
/* Anteckningar - delad att-gora-lista                                 */
/* ------------------------------------------------------------------ */

/**
 * Hamtar anteckningsbladet. Skapar det ALDRIG - saknas bladet ar det ett
 * uppsattningsfel som ska rattas i arket, inte nagot skriptet ska gissa.
 *
 * Egen formatflagga: flaggan for jobbladet skulle annars hindra att det
 * har bladet far sitt textformat i samma korning.
 */
var formatSattAnteckningar = false;
function haemtaAnteckningsblad() {
  var kalkylark = SpreadsheetApp.getActiveSpreadsheet();
  if (!kalkylark) {
    throw new Error('Skriptet ar inte kopplat till nagot kalkylark');
  }
  var blad = kalkylark.getSheetByName(BLADNAMN_ANTECKNINGAR);
  if (!blad) {
    throw new Error('Hittade inget blad som heter ' + BLADNAMN_ANTECKNINGAR +
      '. Skapa bladet och klistra in rubrikraden ur anteckningar-kolumner.txt i rad 1.');
  }
  if (!formatSattAnteckningar) {
    blad.getRange(1, 1, blad.getMaxRows(), blad.getMaxColumns()).setNumberFormat('@');
    formatSattAnteckningar = true;
  }
  return blad;
}

/** ant_lista: alla anteckningar som objekt med kolumnnamnen som nycklar. */
function atgardAntLista(indata) {
  var blad = haemtaAnteckningsblad();
  var kolumner = haemtaKolumner(blad);
  var antalRader = blad.getLastRow() - 1;

  if (antalRader < 1) {
    return [];
  }

  var varden = blad.getRange(2, 1, antalRader, kolumner.length).getValues();
  var lista = [];
  for (var i = 0; i < varden.length; i++) {
    var post = radTillObjekt(varden[i], kolumner);

    // Hoppa over helt tomma rader.
    if (!post.id && !post.text) {
      continue;
    }

    lista.push(post);
  }

  return lista;
}

/**
 * ant_skapa: lagger till en rad sist. id, skapad, klar och klar_datum satts
 * server-side - klienten skickar bara text och skapad_av.
 */
function atgardAntSkapa(indata) {
  var inkommande = indata.anteckning || {};
  if (typeof inkommande !== 'object' || inkommande === null) {
    throw new Error('Faltet anteckning maste vara ett objekt');
  }

  var las = LockService.getScriptLock();
  if (!las.tryLock(10000)) {
    throw new Error('Kunde inte fa skrivlas, forsok igen om en stund');
  }

  try {
    var blad = haemtaAnteckningsblad();
    var kolumner = haemtaKolumner(blad);

    var ny = {};
    for (var i = 0; i < kolumner.length; i++) {
      var kolumn = kolumner[i];
      var varde = inkommande[kolumn];
      ny[kolumn] = (varde === undefined || varde === null) ? '' : String(varde);
    }

    ny.id = skapaId();
    ny.skapad = new Date().toISOString();
    ny.klar = 'nej';
    ny.klar_datum = '';

    var rad = [];
    for (var j = 0; j < kolumner.length; j++) {
      rad.push(ny[kolumner[j]]);
    }

    // Formatet satts INNAN vardena skrivs, annars tolkar Sheets dem som tal.
    var radnummer = blad.getLastRow() + 1;
    var omrade = blad.getRange(radnummer, 1, 1, kolumner.length);
    omrade.setNumberFormat('@');
    omrade.setValues([rad]);
    SpreadsheetApp.flush();

    return ny;

  } finally {
    las.releaseLock();
  }
}

/**
 * ant_uppdatera: las-andra-skriv pa en enskild rad. Endast de falt som finns
 * i "andringar" skrivs om, resten av raden lamnas exakt som den ligger.
 */
function atgardAntUppdatera(indata) {
  var id = indata.id ? String(indata.id) : '';
  if (!id) {
    throw new Error('Faltet id saknas');
  }

  var andringar = indata.andringar || {};
  if (typeof andringar !== 'object' || andringar === null) {
    throw new Error('Faltet andringar maste vara ett objekt');
  }

  var las = LockService.getScriptLock();
  if (!las.tryLock(10000)) {
    throw new Error('Kunde inte fa skrivlas, forsok igen om en stund');
  }

  try {
    var blad = haemtaAnteckningsblad();
    var kolumner = haemtaKolumner(blad);

    var radnummer = hittaRadnummer(blad, kolumner, id);
    if (radnummer === -1) {
      throw new Error('Hittade ingen anteckning med id ' + id);
    }

    var omrade = blad.getRange(radnummer, 1, 1, kolumner.length);
    var befintligRad = omrade.getValues()[0];

    for (var faltnamn in andringar) {
      if (!Object.prototype.hasOwnProperty.call(andringar, faltnamn)) {
        continue;
      }
      // id och skapad ar server-agda och far inte andras av klienten.
      if (faltnamn === 'id' || faltnamn === 'skapad') {
        continue;
      }
      var kolumnIndex = kolumner.indexOf(faltnamn);
      if (kolumnIndex === -1) {
        continue; // Okant falt ignoreras hellre an kraschar.
      }
      var nyttVarde = andringar[faltnamn];
      befintligRad[kolumnIndex] = (nyttVarde === undefined || nyttVarde === null)
        ? ''
        : String(nyttVarde);
    }

    omrade.setNumberFormat('@');
    omrade.setValues([befintligRad]);
    SpreadsheetApp.flush();

    var sparadRad = blad.getRange(radnummer, 1, 1, kolumner.length).getValues()[0];
    return radTillObjekt(sparadRad, kolumner);

  } finally {
    las.releaseLock();
  }
}

/** ant_radera: tar bort hela raden vars id matchar. */
function atgardAntRadera(indata) {
  var id = indata.id ? String(indata.id) : '';
  if (!id) {
    throw new Error('Faltet id saknas');
  }

  var las = LockService.getScriptLock();
  if (!las.tryLock(10000)) {
    throw new Error('Kunde inte fa skrivlas, forsok igen om en stund');
  }

  try {
    var blad = haemtaAnteckningsblad();
    var kolumner = haemtaKolumner(blad);

    var radnummer = hittaRadnummer(blad, kolumner, id);
    if (radnummer === -1) {
      throw new Error('Hittade ingen anteckning med id ' + id);
    }

    blad.deleteRow(radnummer);
    SpreadsheetApp.flush();

    return { id: id, raderad: true };

  } finally {
    las.releaseLock();
  }
}
