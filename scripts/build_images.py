#!/usr/bin/env python3
"""Photos et logos libres de droits, depuis Wikidata et Wikimedia Commons.

    python3 scripts/build_images.py            # communes et fiches du répertoire
    python3 scripts/build_images.py --essai    # rapprochements seulement, sans téléchargement

Entrées   data/kb.json (communes, fiches du répertoire)
Sorties   assets/img/communes/<code Insee>.jpg, assets/img/fiches/<id>.jpg|png
          data/images.json et data/images.js (window.KB_IMG), avec auteur et licence de chaque image

Règles de rapprochement
  communes      par le code Insee (propriété P374 de Wikidata) : pas d'ambiguïté possible.
  personnes     nom exact, être humain, et un seul candidat lié à la Corse (né dans une commune
                corse, ou description qui cite la Corse, Ajaccio, Bastia…). Sinon, pas de photo :
                un visage faux est plus grave qu'une initiale.
  organisations nom exact (ou sigle entre parenthèses), un seul candidat lié à la Corse
                (siège ou localisation dans une commune corse, ou description), logo de préférence.

Les rapprochements de personnes sont marqués « à valider » : une personne de la documentation
doit les contrôler avant tout usage à l'antenne.

Ce script tourne dans GitHub Actions (.github/workflows/images.yml) : l'environnement de travail
de Claude n'a pas accès à Wikimedia.
"""
import argparse, html, io, json, os, re, sys, time, unicodedata
from urllib.parse import quote

import requests

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "BaseConnaissancesCorse/1.0 (https://github.com/madcvincent-png/base-de-connaissances-corse)"
SPARQL = "https://query.wikidata.org/sparql"
COMMONS = "https://commons.wikimedia.org/w/api.php"
LARGEUR = 480
CORSE_TEXTE = re.compile(r"cors[ei]|ajacci|bastia|porto-vecchio|calvi|corte\b|bonifacio|insulaire", re.I)

s = requests.Session()
s.headers["User-Agent"] = UA


def sparql(q):
    for essai in range(4):
        r = s.get(SPARQL, params={"query": q, "format": "json"}, timeout=90)
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(5 * (essai + 1))
            continue
        r.raise_for_status()
        return r.json()["results"]["bindings"]
    raise RuntimeError("Wikidata ne répond pas")


def v(b, k):
    return b.get(k, {}).get("value", "")


def fichier(url_commons):
    """« http://commons.wikimedia.org/wiki/Special:FilePath/Ajaccio%20vue.jpg » -> « Ajaccio vue.jpg »"""
    from urllib.parse import unquote
    return unquote(url_commons.rsplit("/", 1)[-1])


def nom_affiche(p):
    """« SIMEONI Gilles » -> « Gilles Simeoni » (même règle que le site)."""
    if p["nature"] != "Personne":
        return p["nom"]
    m = re.match(r"^((?:[A-ZÀ-ÖØ-Þ'’\-]{2,}\s?)+)\s+(.+)$", p["nom"])
    if not m:
        return p["nom"]
    nom = re.sub(r"(^|[\s\-'’])(\w)", lambda x: x.group(1) + x.group(2).upper(), m.group(1).strip().lower())
    nom = re.sub(r"^(De|Du|Des|D['’])(?=[\s\w])", lambda x: x.group(1).lower(), nom)  # « de La Foata », « d'Ornano »
    return f"{m.group(2)} {nom}"


def graphies(nom):
    """Graphies essayées sur Wikidata : telle quelle, apostrophe droite ou typographique."""
    return list(dict.fromkeys([nom, nom.replace("’", "'"), nom.replace("'", "’")]))


def libelles_organisation(nom):
    """« PNC (Partitu di a Nazione Corsa) » -> ["PNC (Partitu…)", "PNC", "Partitu di a Nazione Corsa"]"""
    out = [nom]
    m = re.match(r"^(.*?)\s*\((.*?)\)\s*$", nom)
    if m:
        out += [m.group(1).strip(), m.group(2).strip()]
    return [x for x in dict.fromkeys(out) if len(x) >= 2]


def lit(x):
    return '"' + x.replace("\\", "\\\\").replace('"', '\\"') + '"@fr'


# ------------------------------------------------------------------ rapprochements
def communes(codes):
    q = """SELECT ?insee ?img WHERE { ?c wdt:P374 ?insee ; wdt:P18 ?img .
             FILTER(STRSTARTS(?insee, "2A") || STRSTARTS(?insee, "2B")) }"""
    out = {}
    for b in sparql(q):
        c = v(b, "insee")
        if c in codes and c not in out:
            out[c] = {"fichier": fichier(v(b, "img")), "wikidata": ""}
    return out


def personnes(fiches):
    """Une fiche reçoit une photo seulement si, toutes graphies confondues, un seul humain lié à la Corse porte ce nom."""
    graph = {p["id"]: graphies(nom_affiche(p)) for p in fiches}
    affiche = {p["id"]: nom_affiche(p) for p in fiches}
    tous = [g for gs in graph.values() for g in gs]
    cand = {}
    for i in range(0, len(tous), 40):
        lot = tous[i : i + 40]
        q = f"""SELECT ?label ?p ?img ?desc ?ne WHERE {{
          VALUES ?label {{ {" ".join(lit(n) for n in lot)} }}
          ?p rdfs:label ?label ; wdt:P31 wd:Q5 .
          OPTIONAL {{ ?p wdt:P18 ?img }}
          OPTIONAL {{ ?p schema:description ?desc FILTER(LANG(?desc) = "fr") }}
          OPTIONAL {{ ?p wdt:P19 ?lieu . ?lieu wdt:P374 ?ne FILTER(STRSTARTS(?ne, "2A") || STRSTARTS(?ne, "2B")) }}
        }}"""
        for b in sparql(q):
            c = cand.setdefault(v(b, "label"), {}).setdefault(v(b, "p"), {"img": "", "desc": "", "ne": False})
            c["img"] = c["img"] or v(b, "img")
            c["desc"] = c["desc"] or v(b, "desc")
            c["ne"] = c["ne"] or bool(v(b, "ne"))
        time.sleep(1)
    out, rapport = {}, []
    for pid, gs in graph.items():
        nom = affiche[pid]
        items = {}
        for g in gs:
            items.update(cand.get(g, {}))
        corses = {k: c for k, c in items.items() if c["ne"] or CORSE_TEXTE.search(c["desc"])}
        if len(corses) == 1:
            qid, c = next(iter(corses.items()))
            if c["img"]:
                out[pid] = {"fichier": fichier(c["img"]), "wikidata": qid.rsplit("/", 1)[-1], "aValider": True}
                rapport.append(f"  photo : {nom} ({c['desc'] or 'sans description'})")
            else:
                rapport.append(f"  sans image sur Wikidata : {nom}")
        elif len(corses) > 1:
            rapport.append(f"  écarté, plusieurs candidats corses : {nom}")
        elif items:
            rapport.append(f"  écarté, aucun candidat lié à la Corse ({len(items)} homonyme(s)) : {nom}")
        else:
            rapport.append(f"  absent de Wikidata : {nom}")
    return out, rapport


def organisations(fiches):
    out, rapport = {}, []
    for p in fiches:
        libs = libelles_organisation(p["nom"])
        q = f"""SELECT ?o ?logo ?img ?desc ?loc WHERE {{
          VALUES ?label {{ {" ".join(lit(x) for x in libs)} }}
          ?o rdfs:label|skos:altLabel ?label .
          FILTER NOT EXISTS {{ ?o wdt:P31 wd:Q5 }}
          OPTIONAL {{ ?o wdt:P154 ?logo }}
          OPTIONAL {{ ?o wdt:P18 ?img }}
          OPTIONAL {{ ?o schema:description ?desc FILTER(LANG(?desc) = "fr") }}
          OPTIONAL {{ ?o wdt:P159|wdt:P131|wdt:P115 ?lieu . ?lieu wdt:P374 ?loc FILTER(STRSTARTS(?loc, "2A") || STRSTARTS(?loc, "2B")) }}
        }}"""
        cand = {}
        for b in sparql(q):
            c = cand.setdefault(v(b, "o"), {"logo": "", "img": "", "desc": "", "loc": False})
            for k in ("logo", "img", "desc"):
                c[k] = c[k] or v(b, k)
            c["loc"] = c["loc"] or bool(v(b, "loc"))
        corses = {k: c for k, c in cand.items() if c["loc"] or CORSE_TEXTE.search(c["desc"])}
        if len(corses) == 1:
            qid, c = next(iter(corses.items()))
            src = c["logo"] or c["img"]
            if src:
                out[p["id"]] = {"fichier": fichier(src), "wikidata": qid.rsplit("/", 1)[-1], "logo": bool(c["logo"])}
                rapport.append(f"  {'logo' if c['logo'] else 'image'} : {p['nom']}")
            else:
                rapport.append(f"  sans image sur Wikidata : {p['nom']}")
        else:
            rapport.append(f"  écarté ({len(corses)} candidat(s) liés à la Corse) : {p['nom']}")
        time.sleep(0.5)
    return out, rapport


# ------------------------------------------------------------------ Commons : crédits et fichiers
def credits(noms):
    """Auteur, licence et page de chaque fichier, par lots de 40."""
    out = {}
    noms = list(dict.fromkeys(noms))
    for i in range(0, len(noms), 40):
        lot = noms[i : i + 40]
        r = s.get(COMMONS, params={"action": "query", "format": "json", "prop": "imageinfo", "iiprop": "extmetadata|url",
                                   "iiurlwidth": LARGEUR, "titles": "|".join("File:" + n for n in lot)}, timeout=60)
        r.raise_for_status()
        q = r.json()["query"]
        alias = {n["to"]: n["from"] for n in q.get("normalized", [])}
        for page in q["pages"].values():
            if "imageinfo" not in page:
                continue
            ii = page["imageinfo"][0]
            md = ii.get("extmetadata", {})
            titre = alias.get(page["title"], page["title"])
            auteur = re.sub(r"<[^>]+>", "", html.unescape(md.get("Artist", {}).get("value", ""))).strip()
            out[titre[5:]] = {
                "auteur": re.sub(r"\s+", " ", auteur)[:120],
                "licence": md.get("LicenseShortName", {}).get("value", ""),
                "libre": md.get("NonFree", {}).get("value", "false") != "true",
                "page": ii.get("descriptionurl", ""),
                "vignette": ii.get("thumburl") or ii.get("url"),
            }
        time.sleep(1)
    return out


def telecharger(url, chemin, logo):
    from PIL import Image

    r = s.get(url, timeout=60)
    r.raise_for_status()
    im = Image.open(io.BytesIO(r.content))
    im.thumbnail((LARGEUR, LARGEUR))
    os.makedirs(os.path.dirname(chemin), exist_ok=True)
    if logo:
        im.convert("RGBA").save(chemin, "PNG", optimize=True)
    else:
        im.convert("RGB").save(chemin, "JPEG", quality=80, optimize=True, progressive=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--essai", action="store_true")
    a = ap.parse_args()
    kb = json.load(open(os.path.join(RACINE, "data", "kb.json"), encoding="utf-8"))

    print("Communes…")
    com = communes({c["code"] for c in kb["communes"]})
    print(f"  {len(com)} communes sur {len(kb['communes'])} ont une image sur Wikidata")
    print("Personnes…")
    pers, r1 = personnes([p for p in kb["personnes"] if p["nature"] == "Personne"])
    print("\n".join(r1))
    print("Organisations…")
    org, r2 = organisations([p for p in kb["personnes"] if p["nature"] != "Personne"])
    print("\n".join(r2))
    if a.essai:
        return

    meta = credits([x["fichier"] for x in list(com.values()) + list(pers.values()) + list(org.values())])
    sortie = {"source": "Wikidata et Wikimedia Commons", "genere": time.strftime("%Y-%m-%d"), "communes": {}, "fiches": {}}
    for groupe, dossier, base in (("communes", "communes", com), ("fiches", "fiches", {**pers, **org})):
        for cle, x in base.items():
            m = meta.get(x["fichier"])
            if not m or not m["libre"] or not m["vignette"]:
                continue
            logo = x.get("logo", False)
            rel = f"assets/img/{dossier}/{cle}.{'png' if logo else 'jpg'}"
            try:
                telecharger(m["vignette"], os.path.join(RACINE, rel), logo)
            except Exception as e:
                print(f"  échec du téléchargement ({type(e).__name__}) : {x['fichier']}")
                continue
            sortie[groupe][cle] = {"src": rel, "auteur": m["auteur"], "licence": m["licence"], "page": m["page"],
                                   "wikidata": x.get("wikidata", ""), **({"aValider": True} if x.get("aValider") else {})}
            time.sleep(0.2)
    with open(os.path.join(RACINE, "data", "images.json"), "w", encoding="utf-8") as f:
        json.dump(sortie, f, ensure_ascii=False, indent=1)
    with open(os.path.join(RACINE, "data", "images.js"), "w", encoding="utf-8") as f:
        f.write("window.KB_IMG=" + json.dumps(sortie, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(f"{len(sortie['communes'])} images de communes, {len(sortie['fiches'])} photos ou logos de fiches")


if __name__ == "__main__":
    main()
