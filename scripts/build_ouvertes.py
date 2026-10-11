#!/usr/bin/env python3
"""Données publiques ouvertes sur la Corse : élus, sites et équipements, lieux remarquables, repères
sur les personnalités du répertoire.

    python3 scripts/build_ouvertes.py

Sources (toutes en licence ouverte)
  Répertoire national des élus (RNE)   ministère de l'Intérieur, data.gouv.fr
  Installations classées               Géorisques (ministère de la Transition écologique)
  Équipements, monuments, personnes    Wikidata (CC0)

Sorties (data/ouvertes/)
  elus.json        exécutif de chaque commune (maire et adjoints) et nombre de conseillers ;
                   Assemblée de Corse et Conseil exécutif, parlementaires, présidents d'intercommunalité
  personnes.json   pour les fiches publiques du répertoire : mandats officiels (RNE) et repères Wikidata
  sites.json       installations classées sensibles et grands équipements
  lieux.json       monuments historiques et lieux remarquables, par commune
  rapport.txt      ce que le script a trouvé : colonnes, effectifs, rapprochements écartés
  ../ouvertes.js   le tout pour le site (window.KB_OUV)

Données personnelles : seuls sont conservés le nom, le prénom, la fonction et les dates de mandat.
Ni date de naissance, ni profession, ni sexe des élus. Le conseil municipal complet n'est pas publié :
seulement son effectif. Les repères Wikidata ne concernent que les fiches publiques du répertoire
(élus, anciens élus, hauts fonctionnaires, organisations).

Tourne dans GitHub Actions (.github/workflows/ouvertes.yml).
"""
import csv, io, json, os, re, sys, time, unicodedata

import requests

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RACINE, "scripts"))
import build_images as BI  # noqa: E402  (requêtes Wikidata, règles de rapprochement)

SORTIE = os.path.join(RACINE, "data", "ouvertes")
UA = BI.UA
s = requests.Session()
s.headers["User-Agent"] = UA
RAPPORT = []


def log(*a):
    ligne = " ".join(str(x) for x in a)
    print(ligne)
    RAPPORT.append(ligne)


def norm(x):
    x = unicodedata.normalize("NFD", (x or "").lower())
    x = "".join(c for c in x if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", x).strip()


def date_iso(v):
    v = (v or "").strip()
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})", v)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", v)
    return m.group(0) if m else ""


def corse(dep):
    return (dep or "").strip().upper() in ("2A", "2B", "20")


# ===================================================================== RNE
FICHIERS = [  # (catégorie, mots qui doivent figurer dans le titre de la ressource)
    ("cm", ["conseillers municipaux"]),
    ("epci", ["communautaires"]),
    ("cac", ["statut particulier"]),
    ("cac", ["assemblee de corse"]),
    ("cac", ["conseillers regionaux"]),
    ("dep", ["deputes"]),
    ("sen", ["senateurs"]),
]


def colonnes(entete):
    """Repère les colonnes utiles par leur libellé (le RNE change parfois l'ordre)."""
    n = [norm(h) for h in entete]

    def c(*cles, sauf=()):
        for cle in cles:
            for i, h in enumerate(n):
                if all(m in h for m in cle.split()) and not any(x in h for x in sauf):
                    return i
        return None

    return {
        "dep": c("code du departement", "code departement"),
        "libDep": c("libelle du departement"),
        "region": c("libelle de la region"),
        "commune": c("code de la commune", "code commune"),
        "libCommune": c("libelle de la commune", "libelle commune"),
        "nom": c("nom de l elu", "nom", sauf=("prenom", "libelle", "nomenclature")),
        "prenom": c("prenom"),
        "naissance": c("naissance"),
        "fonction": c("libelle de la fonction", "fonction", sauf=("date",)),
        "debutMandat": c("debut du mandat", "debut mandat"),
        "debutFonction": c("debut de la fonction", "debut fonction"),
        "circo": c("libelle de la circonscription", "circonscription", sauf=("code",)),
        "collectivite": c("libelle de la collectivite", "collectivite a statut particulier", sauf=("code",)),
        "epci": c("libelle de l epci", "epci", sauf=("siren", "code")),
        "nuance": c("nuance"),
    }


def lire_csv(url):
    r = s.get(url, timeout=300)
    r.raise_for_status()
    brut = r.content
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            texte = brut.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    premiere = texte.split("\n", 1)[0]
    sep = max([";", ",", "\t", "|"], key=premiere.count)
    lignes = csv.reader(io.StringIO(texte), delimiter=sep)
    entete = next(lignes)
    return entete, lignes


def rne(communes_pop):
    ds = None
    for slug in ("repertoire-national-des-elus-1", "repertoire-national-des-elus"):
        r = s.get(f"https://www.data.gouv.fr/api/1/datasets/{slug}/", timeout=60)
        if r.ok:
            ds = r.json()
            break
    if not ds:
        log("RNE : jeu de données introuvable sur data.gouv.fr")
        return None
    log(f"RNE : « {ds['title']} », modifié le {ds.get('last_modified', '')[:10]}")
    ressources = [x for x in ds["resources"] if re.search(r"\.(csv|txt)$", x["url"].split("?")[0], re.I) or (x.get("format") or "").lower() in ("csv", "txt")]
    for x in ressources:
        log(f"  ressource : {x['title']} | {x.get('last_modified', '')[:10]}")

    out = {"miseAJour": "", "communes": {}, "effectifs": {}, "institutions": {"Assemblée de Corse": [], "Députés": [], "Sénateurs": [], "Intercommunalités": []}}
    tous = []  # toutes les lignes corses, pour rapprocher les fiches du répertoire (jamais publiées en bloc)
    vus = set()
    for cat, mots in FICHIERS:
        res = next((x for x in ressources if all(m in norm(x["title"]) for m in mots)), None)
        if not res or res["url"] in vus:
            continue
        vus.add(res["url"])
        out["miseAJour"] = max(out["miseAJour"], (res.get("last_modified") or "")[:10])
        try:
            entete, lignes = lire_csv(res["url"])
        except Exception as e:
            log(f"  {cat} : échec de lecture ({type(e).__name__}: {e})")
            continue
        k = colonnes(entete)
        log(f"  {cat} : colonnes {entete}")
        log(f"  {cat} : repérage {k}")
        n = 0
        for l in lignes:
            g = lambda c: (l[k[c]].strip() if k.get(c) is not None and k[c] < len(l) else "")
            dep = g("dep")
            coll = g("collectivite")
            if cat == "cac":
                if "corse" not in norm(coll) and "corse" not in norm(g("region")) and not corse(dep):
                    continue
            elif not corse(dep):
                continue
            n += 1
            e = {"cat": cat, "nom": g("nom"), "prenom": g("prenom"), "fonction": g("fonction"),
                 "debutMandat": date_iso(g("debutMandat")), "debutFonction": date_iso(g("debutFonction")),
                 "commune": g("commune"), "circo": g("circo"), "epci": g("epci"), "nuance": g("nuance"),
                 "_naissance": g("naissance")}
            if e["commune"] and len(e["commune"]) < 5 and dep:
                e["commune"] = (dep + e["commune"].zfill(3))[-5:]
            tous.append(e)
            public = {x: e[x] for x in ("nom", "prenom", "fonction", "debutMandat", "debutFonction") if e[x]}
            if cat == "cm":
                out["effectifs"][e["commune"]] = out["effectifs"].get(e["commune"], 0) + 1
                if re.search(r"maire|adjoint", norm(e["fonction"])) and "delegue" not in norm(e["fonction"]):
                    out["communes"].setdefault(e["commune"], []).append(public)
            elif cat == "epci":
                if norm(e["fonction"]).startswith("president"):
                    out["institutions"]["Intercommunalités"].append({**public, "epci": e["epci"]})
            elif cat == "cac":
                out["institutions"]["Assemblée de Corse"].append(public)
            elif cat == "dep":
                circo = re.sub(r"(\d)(?:ère|Ère|ere)\b", r"\1re", re.sub(r"(\d)(?:ème|Ème|eme)\b", r"\1e", e["circo"])).lower()
                out["institutions"]["Députés"].append({**public, "circonscription": f"{circo} de {g('libDep')}".strip()})
            elif cat == "sen":
                out["institutions"]["Sénateurs"].append(public)
        log(f"  {cat} : {n} lignes pour la Corse")

    ordre = lambda f: (0 if norm(f.get("fonction", "")).startswith("maire") else 1, int((re.findall(r"\d+", f.get("fonction", "")) or [99])[0]))
    for c in out["communes"].values():
        c.sort(key=ordre)
    sans = [c for c in communes_pop if c not in out["communes"]]
    log(f"RNE : exécutif trouvé pour {len(out['communes'])} communes ; sans maire repéré : {len(sans)} {sans[:15]}")
    for nom, l in out["institutions"].items():
        log(f"RNE : {nom} : {len(l)}")
    return out, tous


# ===================================================================== personnes du répertoire
def mandats_rne(personnes, tous):
    out, ambigus, ecartes = {}, [], []
    index = {}
    for e in tous:
        index.setdefault((norm(e["nom"]), norm(e["prenom"])), []).append(e)
    for p in personnes:
        if p["nature"] != "Personne":
            continue
        m = re.match(r"^((?:[A-ZÀ-ÖØ-Þ'’\-]{2,}\s?)+)\s+(.+)$", p["nom"])
        if not m:
            continue
        lignes = index.get((norm(m.group(1)), norm(m.group(2))), [])
        if not lignes:
            continue
        if not set(p.get("qualite") or []) & {"Élu", "Ancien élu"}:
            ecartes.append(p["nom"])  # homonyme possible : la fiche ne dit pas que la personne est élue
            continue
        individus = {l["_naissance"] for l in lignes}
        if len(individus) > 1:
            ambigus.append(p["nom"])  # deux homonymes élus en Corse : on ne choisit pas
            continue
        lib = {"cm": "Conseil municipal", "epci": "Intercommunalité", "cac": "Assemblée de Corse", "dep": "Assemblée nationale", "sen": "Sénat"}
        out[p["id"]] = [{"institution": lib[l["cat"]], "fonction": l["fonction"] or ("Député" if l["cat"] == "dep" else "Sénateur" if l["cat"] == "sen" else "Conseiller"),
                         "commune": l["commune"] if l["cat"] == "cm" else "", "epci": l["epci"] if l["cat"] == "epci" else "",
                         "circonscription": l["circo"] if l["cat"] == "dep" else "", "debutMandat": l["debutMandat"], "debutFonction": l["debutFonction"]} for l in lignes]
    log(f"Répertoire : mandats RNE trouvés pour {len(out)} fiches ; homonymes écartés : {ambigus} ; fiches non élues portant le nom d'un élu (non rattachées) : {ecartes}")
    return out


PUBLIC = re.compile(r"politi|ministre|préfet|prefet|haut fonctionnaire|magistrat|député|sénateur|avocat", re.I)


def reperes_wikidata(personnes):
    """Rapprochement strict (même règle que les photos), puis repères : naissance (année, lieu), partis,
    fonctions occupées, article Wikipédia, site officiel."""
    gens = [p for p in personnes if p["nature"] == "Personne"]
    orgs = [p for p in personnes if p["nature"] != "Personne"]
    qid = {}
    # personnes
    graph = {p["id"]: BI.graphies(BI.nom_affiche(p)) for p in gens}
    tous = [g for gs in graph.values() for g in gs]
    cand = {}
    for i in range(0, len(tous), 40):
        q = f"""SELECT ?label ?p ?desc ?ne WHERE {{ VALUES ?label {{ {" ".join(BI.lit(n) for n in tous[i:i + 40])} }}
          ?p rdfs:label ?label ; wdt:P31 wd:Q5 .
          OPTIONAL {{ ?p schema:description ?desc FILTER(LANG(?desc) = "fr") }}
          OPTIONAL {{ ?p wdt:P19 ?lieu . ?lieu wdt:P374 ?ne FILTER(STRSTARTS(?ne, "2A") || STRSTARTS(?ne, "2B")) }} }}"""
        for b in BI.sparql(q):
            c = cand.setdefault(BI.v(b, "label"), {}).setdefault(BI.v(b, "p"), {"desc": "", "ne": False})
            c["desc"] = c["desc"] or BI.v(b, "desc")
            c["ne"] = c["ne"] or bool(BI.v(b, "ne"))
        time.sleep(1)
    for pid, gs in graph.items():
        items = {}
        for g in gs:
            items.update(cand.get(g, {}))
        corses = [k for k, c in items.items() if c["ne"] or BI.CORSE_TEXTE.search(c["desc"])]
        if len(corses) == 1:
            qid[pid] = corses[0].rsplit("/", 1)[-1]
        elif not corses and len(items) == 1:
            # Personnalité nationale : un seul être humain porte ce nom sur Wikidata, et il est décrit
            # comme responsable public ; la fiche, elle, le dit élu ou haut fonctionnaire.
            k, c = next(iter(items.items()))
            fiche = next(p for p in gens if p["id"] == pid)
            if PUBLIC.search(c["desc"]) and set(fiche.get("qualite") or []) & {"Élu", "Ancien élu", "Haut fonctionnaire"}:
                qid[pid] = k.rsplit("/", 1)[-1]
    # organisations
    for p in orgs:
        libs = BI.libelles_organisation(p["nom"])
        q = f"""SELECT ?o ?desc ?loc WHERE {{ VALUES ?label {{ {" ".join(BI.lit(x) for x in libs)} }}
          ?o rdfs:label|skos:altLabel ?label . FILTER NOT EXISTS {{ ?o wdt:P31 wd:Q5 }}
          OPTIONAL {{ ?o schema:description ?desc FILTER(LANG(?desc) = "fr") }}
          OPTIONAL {{ ?o wdt:P159|wdt:P131|wdt:P115 ?lieu . ?lieu wdt:P374 ?loc FILTER(STRSTARTS(?loc, "2A") || STRSTARTS(?loc, "2B")) }} }}"""
        c = {}
        for b in BI.sparql(q):
            x = c.setdefault(BI.v(b, "o"), {"desc": "", "loc": False})
            x["desc"] = x["desc"] or BI.v(b, "desc")
            x["loc"] = x["loc"] or bool(BI.v(b, "loc"))
        corses = [k for k, x in c.items() if x["loc"] or BI.CORSE_TEXTE.search(x["desc"])]
        if len(corses) == 1:
            qid[p["id"]] = corses[0].rsplit("/", 1)[-1]
        time.sleep(0.5)
    log(f"Wikidata : {len(qid)} fiches rapprochées sur {len(personnes)} ({len([1 for p in gens if p['id'] in qid])} personnes, {len([1 for p in orgs if p['id'] in qid])} organisations)")
    log("  non rapprochées : " + ", ".join(p["nom"] for p in personnes if p["id"] not in qid))

    out = {}
    inv = {v: k for k, v in qid.items()}
    ids = list(inv)
    for i in range(0, len(ids), 25):
        q = f"""SELECT ?p ?desc ?naissance ?lieuLabel ?partiLabel ?posteLabel ?debut ?fin ?article ?site ?fondation ?siegeLabel WHERE {{
          VALUES ?p {{ {" ".join("wd:" + x for x in ids[i:i + 25])} }}
          OPTIONAL {{ ?p schema:description ?desc FILTER(LANG(?desc) = "fr") }}
          OPTIONAL {{ ?p wdt:P569 ?naissance }}
          OPTIONAL {{ ?p wdt:P19 ?lieu }}
          OPTIONAL {{ ?p wdt:P102 ?parti }}
          OPTIONAL {{ ?p p:P39 ?st . ?st ps:P39 ?poste . OPTIONAL {{ ?st pq:P580 ?debut }} OPTIONAL {{ ?st pq:P582 ?fin }} }}
          OPTIONAL {{ ?article schema:about ?p ; schema:isPartOf <https://fr.wikipedia.org/> }}
          OPTIONAL {{ ?p wdt:P856 ?site }}
          OPTIONAL {{ ?p wdt:P571 ?fondation }}
          OPTIONAL {{ ?p wdt:P159 ?siege }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "fr,en". }} }}"""
        for b in BI.sparql(q):
            q_ = BI.v(b, "p").rsplit("/", 1)[-1]
            r = out.setdefault(inv[q_], {"wikidata": q_, "description": "", "naissance": "", "lieuNaissance": "", "partis": [], "fonctions": [], "wikipedia": "", "site": "", "fondation": "", "siege": ""})
            r["description"] = r["description"] or BI.v(b, "desc")
            r["naissance"] = r["naissance"] or BI.v(b, "naissance")[:4]  # année seulement
            r["lieuNaissance"] = r["lieuNaissance"] or BI.v(b, "lieuLabel")
            r["wikipedia"] = r["wikipedia"] or BI.v(b, "article")
            r["site"] = r["site"] or BI.v(b, "site")
            r["fondation"] = r["fondation"] or BI.v(b, "fondation")[:4]
            r["siege"] = r["siege"] or BI.v(b, "siegeLabel")
            pa = BI.v(b, "partiLabel")
            if pa and not re.match(r"^Q\d+$", pa) and pa not in r["partis"]:
                r["partis"].append(pa)
            po = BI.v(b, "posteLabel")
            if po and not re.match(r"^Q\d+$", po):
                f = {"poste": po, "debut": BI.v(b, "debut")[:10], "fin": BI.v(b, "fin")[:10]}
                if f not in r["fonctions"]:
                    r["fonctions"].append(f)
        time.sleep(1)
    for r in out.values():
        r["fonctions"].sort(key=lambda f: f["debut"] or "0000", reverse=True)
        for k in [k for k, v in r.items() if v in ("", [])]:
            del r[k]
    return out


# ===================================================================== sites (Géorisques + Wikidata)
RUBRIQUES = [  # (préfixes de rubrique ICPE, catégorie)
    (("2760", "3540"), "Stockage de déchets"),
    (("2771", "3520"), "Incinération de déchets"),
    (("2710", "2711", "2713", "2714", "2716", "2718", "2791", "2790"), "Tri, transit et traitement de déchets"),
    (("2780", "2781", "3532"), "Compostage et méthanisation"),
    (("4734", "4718", "1434", "4330", "4331", "1412", "1414"), "Hydrocarbures et gaz"),
    (("2910", "3110", "2931"), "Production d'énergie"),
    (("2510", "2515", "2517"), "Carrières et matériaux"),
]


def geo_get(url, params):
    for essai in range(4):
        r = s.get(url, params=params, timeout=90)
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(5 * (essai + 1))
            continue
        return r
    return r


def georisques(codes):
    sites, premier = [], None
    for dep in ("2A", "2B"):
        page = 1
        while True:
            r = geo_get("https://georisques.gouv.fr/api/v1/installations_classees", {"departement": dep, "page": page, "page_size": 100})
            if not r.ok:
                log(f"Géorisques {dep} : HTTP {r.status_code} {r.text[:200]}")
                break
            j = r.json()
            data = j.get("data") or []
            if premier is None and data:
                premier = data[0]
                log("Géorisques : champs d'une installation : " + json.dumps(premier, ensure_ascii=False)[:1500])
            for x in data:
                rub = x.get("rubriques") or []
                nums = [str(y.get("numeroRubrique") or y.get("numero") or "") for y in rub if isinstance(y, dict)]
                cats = [c for pref, c in RUBRIQUES if any(n.startswith(pref) for n in nums)]
                seveso = (x.get("statutSeveso") or "").strip()
                est_seveso = seveso and "non" not in norm(seveso)
                if not cats and not est_seveso:
                    continue
                code = str(x.get("codeInsee") or "")
                try:
                    lat, lon = float(x.get("latitude")), float(x.get("longitude"))
                except (TypeError, ValueError):
                    lat = lon = None
                sites.append({
                    "nom": (x.get("raisonSociale") or "").strip(), "categorie": cats[0] if cats else "Site Seveso",
                    "autres": cats[1:], "seveso": seveso if est_seveso else "", "regime": x.get("regime") or "",
                    "etat": x.get("etatActivite") or "", "commune": code if code in codes else "", "lat": lat, "lon": lon,
                    "source": "Géorisques", "lien": f"https://www.georisques.gouv.fr/risques/installations/donnees/details/{x.get('codeAIOT')}" if x.get("codeAIOT") else "",
                })
            tp = j.get("total_pages") or j.get("totalPages") or 1
            if page >= tp or not data:
                break
            page += 1
            time.sleep(0.5)
    log(f"Géorisques : {len(sites)} installations retenues (déchets, hydrocarbures, énergie, carrières, Seveso)")
    return sites


CLASSES = [  # (élément Wikidata, catégorie) : les échantillons du rapport permettent de vérifier chaque classe
    ("Q12323", "Barrage"),
    ("Q159719", "Centrale électrique"),
    ("Q1248784", "Aéroport"),
    ("Q44782", "Port"),
    ("Q39715", "Phare"),
    ("Q16917", "Hôpital"),
    ("Q40357", "Prison"),
    ("Q1137809", "Palais de justice"),
    ("Q3918", "Université"),
    ("Q483110", "Stade"),
    ("Q180388", "Décharge"),
]


def equipements(codes):
    out = []
    for q, cat in CLASSES:
        req = f"""SELECT DISTINCT ?i ?iLabel ?insee ?coord WHERE {{
          ?i wdt:P31/wdt:P279* wd:{q} . ?i wdt:P131 ?c . ?c wdt:P374 ?insee .
          FILTER(STRSTARTS(?insee, "2A") || STRSTARTS(?insee, "2B"))
          OPTIONAL {{ ?i wdt:P625 ?coord }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "fr,en". }} }}"""
        try:
            res = BI.sparql(req)
        except Exception as e:
            log(f"Wikidata {cat} : échec ({type(e).__name__})")
            continue
        vus = set()
        for b in res:
            i = BI.v(b, "i").rsplit("/", 1)[-1]
            if i in vus or re.match(r"^Q\d+$", BI.v(b, "iLabel")):
                continue
            if cat == "Hôpital" and not re.search(r"h[oô]pital|hospitalier|clinique|miséricorde", BI.v(b, "iLabel"), re.I):
                continue
            vus.add(i)
            m = re.match(r"Point\(([-\d.]+) ([-\d.]+)\)", BI.v(b, "coord"))
            out.append({"nom": BI.v(b, "iLabel"), "categorie": cat, "commune": BI.v(b, "insee") if BI.v(b, "insee") in codes else "",
                        "lat": float(m.group(2)) if m else None, "lon": float(m.group(1)) if m else None,
                        "source": "Wikidata", "lien": f"https://www.wikidata.org/wiki/{i}", "wikidata": i})
        echantillon = [x["nom"] for x in out if x["categorie"] == cat][:12]
        log(f"Wikidata {cat} ({q}) : {len(vus)} — {echantillon}")
        time.sleep(1)
    return out


def monuments(codes):
    req = """SELECT DISTINCT ?i ?iLabel ?insee ?coord ?protLabel WHERE {
      ?i wdt:P380 ?merimee ; wdt:P131 ?c . ?c wdt:P374 ?insee .
      FILTER(STRSTARTS(?insee, "2A") || STRSTARTS(?insee, "2B"))
      OPTIONAL { ?i wdt:P625 ?coord } OPTIONAL { ?i wdt:P1435 ?prot }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". } }"""
    out, vus = [], {}
    for b in BI.sparql(req):
        i = BI.v(b, "i").rsplit("/", 1)[-1]
        if re.match(r"^Q\d+$", BI.v(b, "iLabel")):
            continue
        if i in vus:
            p = BI.v(b, "protLabel")
            if p and p not in vus[i]["protection"]:
                vus[i]["protection"] = (vus[i]["protection"] + " ; " + p).strip(" ;")
            continue
        m = re.match(r"Point\(([-\d.]+) ([-\d.]+)\)", BI.v(b, "coord"))
        vus[i] = {"nom": BI.v(b, "iLabel"), "commune": BI.v(b, "insee") if BI.v(b, "insee") in codes else "", "protection": BI.v(b, "protLabel"),
                  "lat": float(m.group(2)) if m else None, "lon": float(m.group(1)) if m else None, "wikidata": i}
        out.append(vus[i])
    log(f"Wikidata monuments historiques : {len(out)} — {[x['nom'] for x in out[:10]]}")
    return out


# ===================================================================== main
def main():
    os.makedirs(SORTIE, exist_ok=True)
    kb = json.load(open(os.path.join(RACINE, "data", "kb.json"), encoding="utf-8"))
    codes = {c["code"]: c.get("pop") for c in kb["communes"]}
    sortie = {"genere": time.strftime("%Y-%m-%d")}

    def etape(nom, f, *a):
        try:
            return f(*a)
        except Exception as e:  # une source en panne n'empêche pas les autres
            log(f"ÉCHEC {nom} : {type(e).__name__}: {str(e)[:300]}")
            return None

    r = etape("RNE", rne, codes)
    elus, tous = (r if r else (None, []))
    if elus:
        json.dump(elus, open(os.path.join(SORTIE, "elus.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        sortie["elus"] = elus
    pers = {}
    m = etape("mandats RNE", mandats_rne, kb["personnes"], tous) or {}
    w = etape("Wikidata personnes", reperes_wikidata, kb["personnes"]) or {}
    for pid in set(m) | set(w):
        pers[pid] = {**({"rne": m[pid]} if pid in m else {}), **({"wikidata": w[pid]} if pid in w else {})}
    json.dump(pers, open(os.path.join(SORTIE, "personnes.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    sortie["personnes"] = pers
    sites = (etape("Géorisques", georisques, codes) or []) + (etape("Wikidata équipements", equipements, codes) or [])
    json.dump(sites, open(os.path.join(SORTIE, "sites.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    sortie["sites"] = sites
    lieux = etape("Wikidata monuments", monuments, codes) or []
    json.dump(lieux, open(os.path.join(SORTIE, "lieux.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    sortie["lieux"] = lieux
    with open(os.path.join(RACINE, "data", "ouvertes.js"), "w", encoding="utf-8") as f:
        f.write("window.KB_OUV=" + json.dumps(sortie, ensure_ascii=False, separators=(",", ":")) + ";\n")
    open(os.path.join(SORTIE, "rapport.txt"), "w", encoding="utf-8").write("\n".join(RAPPORT) + "\n")


if __name__ == "__main__":
    main()
