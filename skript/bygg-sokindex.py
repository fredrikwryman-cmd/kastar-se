"""Bygger sok/index.json, sökindexet för sajtsökningen.

Kör från repots rot när sidornas text har ändrats:

    python skript/bygg-sokindex.py

Skriptet läser sajtens egna HTML-filer (sidorna i sitemap.xml plus
integritetspolicyn) och plockar ut titel, h1, h2, metabeskrivning, varje
FAQ-fråga med svar och varje prisavsnitt. Föremålen i sok/foremal.json läggs
till sist. Varje föremåls källmening kontrolleras mot sidans synliga text: står
meningen inte ordagrant på sidan avbryts bygget, så att sökningen aldrig kan
visa ett svar som inte är publicerat.

Bara Pythons standardbibliotek används. Mappen skript/ står i exclude i
_config.yml och publiceras inte.
"""

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent
DOMAN = "https://bohagsbolaget.se"

# Kort namn per sida, det som visas under varje träff. Ny sida i sitemap.xml
# utan rad här stoppar bygget, så att ingen sida får ett tomt namn.
SIDNAMN = {
    "/": "Startsidan",
    "/tjanster/flytthjalp/": "Flytthjälp",
    "/tjanster/tomning/": "Tömning",
    "/tjanster/dodsbo/": "Dödsbo",
    "/tjanster/bortforsling/": "Bortforsling",
    "/tjanster/nedmontering/": "Nedmontering och rivning",
    "/tjanster/magasinering/": "Magasinering",
    "/tjanster/mc-forvaring/": "MC-förvaring",
    "/tjanster/foretag/": "Företag och föreningar",
    "/rot-rut.html": "Rot och rut",
    "/integritetspolicy.html": "Integritetspolicy",
    "/fredrik/": "Fredriks visitkort",
    "/thom/": "Thoms visitkort",
}
# Sidor som inte står i sitemap.xml men ändå ska vara sökbara.
EXTRA_SIDOR = ["/integritetspolicy.html"]

HOPPA_OVER = {"script", "style", "svg", "template", "noscript", "head"}
TOMMA = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
         "meta", "source", "track", "wbr"}
BLOCK = {"p", "li", "h1", "h2", "h3", "h4", "summary", "td", "th", "dt", "dd",
         "figcaption", "blockquote", "div", "section", "article", "tr", "label",
         "legend", "caption", "span"}


class Nod:
    def __init__(self, tagg, attr, foralder):
        self.tagg = tagg
        self.attr = dict(attr)
        self.foralder = foralder
        self.barn = []

    def klasser(self):
        return (self.attr.get("class") or "").split()

    def text(self):
        delar = []
        _samla_text(self, delar)
        return " ".join("".join(delar).split())

    def hitta_alla(self, villkor):
        ut = []
        for b in self.barn:
            if isinstance(b, Nod):
                if villkor(b):
                    ut.append(b)
                ut.extend(b.hitta_alla(villkor))
        return ut


def _dold(nod):
    return (nod.tagg in HOPPA_OVER or nod.attr.get("aria-hidden") == "true"
            or "hidden" in nod.attr or "sr-only" in nod.klasser())


def _samla_text(nod, delar):
    for b in nod.barn:
        if isinstance(b, str):
            delar.append(b)
        elif not _dold(b):
            if b.tagg in BLOCK or b.tagg == "br":
                delar.append(" ")
            _samla_text(b, delar)
            if b.tagg in BLOCK:
                delar.append(" ")


class Tradbyggare(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rot = Nod("#rot", [], None)
        self.aktuell = self.rot

    def handle_starttag(self, tagg, attr):
        nod = Nod(tagg, attr, self.aktuell)
        self.aktuell.barn.append(nod)
        if tagg not in TOMMA:
            self.aktuell = nod

    def handle_startendtag(self, tagg, attr):
        self.aktuell.barn.append(Nod(tagg, attr, self.aktuell))

    def handle_endtag(self, tagg):
        nod = self.aktuell
        while nod is not self.rot and nod.tagg != tagg:
            nod = nod.foralder
        if nod is not self.rot:
            self.aktuell = nod.foralder

    def handle_data(self, data):
        self.aktuell.barn.append(data)


def las_sida(fil):
    tb = Tradbyggare()
    tb.feed(fil.read_text(encoding="utf-8"))
    return tb.rot


def forsta(rot, villkor):
    traffar = rot.hitta_alla(villkor)
    return traffar[0] if traffar else None


def utdrag(text, max_tecken=170):
    text = " ".join(text.split())
    if len(text) <= max_tecken:
        return text
    kort = text[:max_tecken].rsplit(" ", 1)[0].rstrip(",.;:")
    return kort + " …"


def ankare(nod):
    """Närmaste id på noden själv eller en förälder, för länk till avsnittet."""
    while nod is not None:
        if nod.attr.get("id") and nod.tagg not in ("main", "body"):
            return "#" + nod.attr["id"]
        nod = nod.foralder
    return ""


def fil_for(url):
    if url.endswith("/"):
        return ROT / url.lstrip("/") / "index.html"
    return ROT / url.lstrip("/")


def sidor_ur_sitemap():
    xml = (ROT / "sitemap.xml").read_text(encoding="utf-8")
    urler = [u.replace(DOMAN, "") or "/" for u in re.findall(r"<loc>([^<]+)</loc>", xml)]
    return urler + [u for u in EXTRA_SIDOR if u not in urler]


def flode(main):
    """Mains rubriker och textblock i dokumentordning, som (tagg, nod)."""
    ut = []

    def gå(nod):
        for b in nod.barn:
            if not isinstance(b, Nod) or _dold(b):
                continue
            if b.tagg in ("h2", "h3", "p", "li", "table", "dl") or "prisrad" in b.klasser():
                ut.append((b.tagg, b))
            elif b.tagg == "details":
                ut.append(("details", b))
            else:
                gå(b)
    gå(main)
    return ut


def poster_for_sida(url, rot):
    namn = SIDNAMN[url]
    main = forsta(rot, lambda n: n.tagg == "main") or forsta(rot, lambda n: n.tagg == "body")
    titel_nod = forsta(rot, lambda n: n.tagg == "title")
    besk = forsta(rot, lambda n: n.tagg == "meta" and n.attr.get("name") == "description")
    h1 = forsta(main, lambda n: n.tagg == "h1")
    h2or = [h.text() for h in main.hitta_alla(lambda n: n.tagg == "h2" and not _dold(n))]
    h1_text = h1.text() if h1 else namn
    beskrivning = besk.attr.get("content", "") if besk else ""

    # Sidans <title> utan varumärkessuffixet läser bättre i en träfflista än
    # h1, som på startsidan är en uppräkning med punkter.
    titel = titel_nod.text() if titel_nod else h1_text
    titel = re.sub(r"\s+[–|-]\s+Bohagsbolaget\.se$", "", titel)
    poster = [{
        "typ": "sida",
        "url": url,
        "sida": namn,
        "namn": namn,
        "titel": titel,
        "rubriker": h2or,
        "utdrag": utdrag(beskrivning),
        "text": " ".join([h1_text, beskrivning]),
    }]

    # FAQ som <details> med <summary> (startsidan).
    for d in main.hitta_alla(lambda n: n.tagg == "details"):
        fraga = forsta(d, lambda n: n.tagg == "summary")
        svar = forsta(d, lambda n: "faq-svar" in n.klasser())
        if fraga and svar:
            poster.append({
                "typ": "faq", "url": url + ankare(d), "sida": namn,
                "titel": fraga.text(), "utdrag": utdrag(svar.text()), "text": svar.text(),
            })

    # Tjänstesidorna har platt struktur: h2, sedan h3 och stycken fram till
    # nästa h2. Under en h2 som börjar med "Vanliga frågor" är varje h3 en
    # fråga och styckena efter den svaret. En h2 om pris blir ett prisavsnitt.
    aktuell_h2 = None
    i_faq = False
    fraga = None
    svarsdelar = []
    pris = None

    def avsluta_fraga():
        nonlocal fraga, svarsdelar
        if fraga is not None and svarsdelar:
            svar = " ".join(svarsdelar)
            poster.append({
                "typ": "faq", "url": url, "sida": namn,
                "titel": fraga, "utdrag": utdrag(svar), "text": svar,
            })
        fraga, svarsdelar = None, []

    def avsluta_pris():
        nonlocal pris
        if pris and pris["delar"]:
            text = " ".join(pris["delar"])
            poster.append({
                "typ": "pris", "url": url + pris["ankare"], "sida": namn,
                "titel": pris["titel"], "utdrag": utdrag(text), "text": text[:900],
            })
        pris = None

    for tagg, nod in flode(main):
        if tagg == "h2":
            avsluta_fraga()
            avsluta_pris()
            aktuell_h2 = nod.text()
            i_faq = aktuell_h2.lower().startswith("vanliga frågor")
            i_prissektion = ankare(nod) == "#priser"
            if re.search(r"kostar|pris", aktuell_h2, re.I) or i_prissektion:
                pris = {"titel": aktuell_h2, "ankare": ankare(nod), "delar": []}
        elif tagg == "h3" and i_faq:
            avsluta_fraga()
            fraga = nod.text()
        elif tagg == "details":
            continue
        else:
            text = nod.text()
            if not text:
                continue
            if i_faq and fraga is not None:
                svarsdelar.append(text)
            if pris is not None:
                pris["delar"].append(text)
    avsluta_fraga()
    avsluta_pris()
    return poster


def synlig_text(rot):
    body = forsta(rot, lambda n: n.tagg == "body") or rot
    return body.text()


def main():
    poster = []
    sidtexter = {}
    for url in sidor_ur_sitemap():
        if url not in SIDNAMN:
            sys.exit(f"FEL: {url} står i sitemap.xml men saknar namn i SIDNAMN.")
        rot = las_sida(fil_for(url))
        sidtexter[url] = synlig_text(rot)
        poster.extend(poster_for_sida(url, rot))

    foremal = json.loads((ROT / "sok" / "foremal.json").read_text(encoding="utf-8"))
    fel = []
    for f in foremal:
        kalla = f["kalla"]
        sidtext = sidtexter.get(kalla["sida"])
        if sidtext is None:
            fel.append(f"{f['namn']}: källsidan {kalla['sida']} finns inte i indexet")
        elif " ".join(kalla["mening"].split()) not in sidtext:
            fel.append(f"{f['namn']}: meningen står inte ordagrant på {kalla['sida']}:\n    {kalla['mening']}")
        poster.append({
            "typ": "föremål", "url": f["lank"], "sida": SIDNAMN.get(f["lank"].split("#")[0], ""),
            "titel": f["namn"], "ord": f["sokord"], "utdrag": f["svar"], "text": f["svar"],
        })
    if fel:
        sys.exit("FEL i sok/foremal.json:\n  " + "\n  ".join(fel))

    for i, p in enumerate(poster):
        p["id"] = i

    ut = ROT / "sok" / "index.json"
    ut.write_text(json.dumps({"poster": poster}, ensure_ascii=False, separators=(",", ":")),
                  encoding="utf-8")
    antal = {}
    for p in poster:
        antal[p["typ"]] = antal.get(p["typ"], 0) + 1
    print(f"Skrev {ut.relative_to(ROT)}: {len(poster)} poster {antal}")


if __name__ == "__main__":
    main()
