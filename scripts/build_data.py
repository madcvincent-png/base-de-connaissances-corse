#!/usr/bin/env python3
"""Construit les données du site à partir de l'export brut des bases Notion.

    python3 scripts/build_data.py --raw prive/raw.json --profil public
    python3 scripts/build_data.py --raw prive/raw.json --profil complet

Entrées
  --raw       export brut (une liste de lignes par base), produit par scripts/export_notion.py
  sources/    contours des communes et des intercommunalités, archives drone,
              maires sortants à la veille des municipales de mars 2026

Sorties
  data/kb.json   les données, lisibles
  data/kb.js     les mêmes, chargées par les pages (window.KB_DATA)
  data/geo.js    les contours (window.KB_GEO)

Deux profils
  complet   tout ce que contient la base. À ne jamais déposer sur un hébergement public.
  public    liste blanche : ni justice, ni faits divers, ni rôles procéduraux, ni notes internes.
            Un champ ajouté dans Notion n'apparaît dans aucun profil tant qu'il n'est pas nommé ici.
"""
import argparse, datetime, html, json, os, re, sys, unicodedata

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# ---------------------------------------------------------------- utilitaires
def pid(url):
    """Identifiant d'une page Notion : les 32 derniers caractères hexadécimaux de son adresse."""
    m = re.findall(r"[0-9a-f]{32}", (url or "").replace("-", ""))
    return m[-1] if m else ""


def rel(v):
    """Une relation arrive sous forme de liste d'adresses, parfois sérialisée en JSON."""
    if not v:
        return []
    if isinstance(v, str):
        try:
            v = json.loads(v)
        except ValueError:
            return []
    return [pid(u) for u in v if pid(u)]


def multi(v):
    if not v:
        return []
    if isinstance(v, str):
        try:
            return json.loads(v)
        except ValueError:
            return [v]
    return list(v)


def txt(v):
    return (v or "").strip() if isinstance(v, str) else ("" if v is None else str(v))


def date(r, nom, fin=False):
    v = r.get(f"date:{nom}:{'end' if fin else 'start'}") or ""
    return v[:10]


def oui(v):
    return v in ("__YES__", True, "true")


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


# ------------------------------------------------- texte des notes vers HTML
def _inline(s, titres):
    s = html.escape(s, quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\*\w])\*(?!\s)(.+?)(?<!\s)\*(?![\*\w])", r"<em>\1</em>", s)
    s = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r'<a href="\2" rel="noopener">\1</a>', s)

    def mention(m):
        i = pid(m.group(1))
        t = titres.get(i)
        return f'<a data-article="{i}">{html.escape(t)}</a>' if t else "la fiche source"

    return re.sub(r"&lt;mention-page url=\"([^\"]+)\"\s*/&gt;", mention, s)


def note_html(texte, titres):
    """Convertit le texte d'une page Notion (titres, paragraphes, listes, encadrés, tableaux)."""
    if not texte:
        return ""
    out, liste, i = [], False, 0
    lignes = texte.split("\n")

    def fin_liste():
        nonlocal liste
        if liste:
            out.append("</ul>")
            liste = False

    while i < len(lignes):
        l = lignes[i]
        s = l.strip()
        if s.startswith("<callout"):
            fin_liste()
            corps = []
            i += 1
            while i < len(lignes) and lignes[i].strip() != "</callout>":
                corps.append(lignes[i].strip())
                i += 1
            out.append('<aside class="avertissement">' + _inline(" ".join(corps), titres) + "</aside>")
        elif s.startswith("<table"):
            fin_liste()
            rangs, rang = [], None
            i += 1
            while i < len(lignes) and lignes[i].strip() != "</table>":
                c = lignes[i].strip()
                if c == "<tr>":
                    rang = []
                elif c == "</tr>":
                    rangs.append(rang)
                elif c.startswith("<td"):
                    rang.append(re.sub(r"^<td[^>]*>|</td>$", "", c))
                i += 1
            t = ["<div class=\"tableau\"><table>"]
            for k, rg in enumerate(rangs):
                b = "th" if k == 0 else "td"
                t.append("<tr>" + "".join(f"<{b}>{_inline(c, titres)}</{b}>" for c in rg) + "</tr>")
            out.append("".join(t) + "</table></div>")
        elif re.match(r"#{1,3} ", s):
            fin_liste()
            n = min(len(s.split(" ")[0]) + 1, 4)
            out.append(f"<h{n}>{_inline(s.split(' ', 1)[1], titres)}</h{n}>")
        elif s.startswith("- "):
            if not liste:
                out.append("<ul>")
                liste = True
            out.append(f"<li>{_inline(s[2:], titres)}</li>")
        elif s:
            fin_liste()
            out.append(f"<p>{_inline(s, titres)}</p>")
        i += 1
    fin_liste()
    return "\n".join(out)


# ----------------------------------------------------------- normalisation
def construire(raw):
    kb = {}
    communes = []
    code_de = {}
    for r in raw["communes"]:
        c = {
            "code": txt(r.get("Code Insee")),
            "nom": txt(r.get("Commune")),
            "dep": txt(r.get("Département")),
            "epci": txt(r.get("Intercommunalité")),
            "pop": int(r["Population"]) if r.get("Population") is not None else None,
            "cp": txt(r.get("Codes postaux")),
            "lat": r.get("Latitude"),
            "lon": r.get("Longitude"),
            "nomCorse": txt(r.get("Nom corse")),
            "pron": txt(r.get("Prononciation")),
        }
        code_de[pid(r["url"])] = c["code"]
        communes.append(c)
    communes.sort(key=lambda c: c["code"])
    par_nom = {norm(c["nom"]): c["code"] for c in communes}

    def codes(v):
        return [code_de[i] for i in rel(v) if i in code_de]

    kb["communes"] = communes

    kb["faits"] = [
        {
            "id": pid(r["url"]),
            "titre": txt(r.get("Événement")),
            "date": date(r, "Date"),
            "dateFin": date(r, "Date", True),
            "precision": txt(r.get("Précision")),
            "type": txt(r.get("Type")),
            "rubrique": txt(r.get("Rubrique")),
            "fiabilite": txt(r.get("Fiabilité")),
            "jalon": oui(r.get("Jalon majeur")),
            "communes": codes(r.get("Commune")),
            "dossiers": rel(r.get("Dossier")),
            "personnes": rel(r.get("Protagonistes")),
            "sources": rel(r.get("Sources")),
            "sourceHorsBase": txt(r.get("Source hors base")),
        }
        for r in raw["chrono"]
    ]

    kb["agenda"] = [
        {
            "id": pid(r["url"]),
            "titre": txt(r.get("Événement")),
            "date": (r.get("date:Date:start") or "")[:16],
            "dateFin": (r.get("date:Date:end") or "")[:16],
            "type": txt(r.get("Type")),
            "rubrique": txt(r.get("Rubrique")),
            "certitude": txt(r.get("Certitude")),
            "couverture": txt(r.get("Couverture")),
            "communes": codes(r.get("Commune")),
            "lieu": txt(r.get("Lieu précis")),
            "origine": txt(r.get("Origine de l'information")),
            "lien": txt(r.get("Lien")),
            "aPreparer": txt(r.get("À préparer")),
            "dossiers": rel(r.get("Dossier")),
            "personnes": rel(r.get("Personnes et organisations")),
        }
        for r in raw["agenda"]
    ]

    kb["roles"] = [
        {
            "id": pid(r["url"]),
            "titre": txt(r.get("Intitulé")),
            "categorie": txt(r.get("Catégorie")),
            "statut": txt(r.get("Statut procédural")),
            "mandat": txt(r.get("Mandat ou fonction")),
            "instance": txt(r.get("Juridiction ou collectivité")),
            "debut": date(r, "Période"),
            "fin": date(r, "Période", True),
            "actuel": oui(r.get("Statut actuel")),
            "definitif": txt(r.get("Décision définitive")),
            "chefs": txt(r.get("Chefs ou peine")),
            "antenne": txt(r.get("Formulation pour l'antenne")),
            "fiabilite": txt(r.get("Fiabilité")),
            "verifieLe": date(r, "Vérifié le"),
            "sourceHorsBase": txt(r.get("Source hors base")),
            "personnes": rel(r.get("Personne")),
            "dossiers": rel(r.get("Dossier")),
            "communes": codes(r.get("Commune")),
            "sources": rel(r.get("Sources")),
        }
        for r in raw["roles"]
    ]

    kb["personnes"] = sorted(
        (
            {
                "id": pid(r["url"]),
                "nom": txt(r.get("Nom")),
                "nature": txt(r.get("Nature")),
                "qualite": multi(r.get("Qualité")),
                "fonction": txt(r.get("Fonction actuelle")),
                "rattachement": txt(r.get("Rattachement")),
                "reperes": txt(r.get("Repères biographiques")),
                "variantes": txt(r.get("Variantes et erreurs fréquentes")),
                "pron": txt(r.get("Prononciation")),
                "verifieLe": date(r, "Fiche vérifiée le"),
            }
            for r in raw["repertoire"]
        ),
        key=lambda p: norm(p["nom"]),
    )

    kb["dossiers"] = sorted(
        (
            {
                "id": pid(r["url"]),
                "titre": txt(r.get("Dossier")),
                "type": txt(r.get("Type")),
                "rubrique": txt(r.get("Rubrique")),
                "veille": txt(r.get("Veille")),
                "priorite": txt(r.get("Priorité")),
                "resume": txt(r.get("En une phrase")),
                "motsCles": txt(r.get("Mots-clés et variantes")),
                "echeance": date(r, "Prochaine échéance"),
                "natureEcheance": txt(r.get("Nature de l'échéance")),
                "debut": date(r, "Période couverte"),
                "fin": date(r, "Période couverte", True),
                "archivesImages": txt(r.get("Archives images")),
                "personnes": rel(r.get("Protagonistes")),
            }
            for r in raw["dossiers"]
        ),
        key=lambda d: norm(d["titre"]),
    )

    articles = []
    for r in raw["articles"]:
        lieux = multi(r.get("Lieux"))
        cc = codes(r.get("Communes"))
        for l in lieux:  # un lieu qui porte le nom exact d'une commune vaut rattachement
            c = par_nom.get(norm(l))
            if c and c not in cc:
                cc.append(c)
        articles.append(
            {
                "id": pid(r["url"]),
                "ref": txt(r.get("Réf.")),
                "titre": txt(r.get("Titre")),
                "source": txt(r.get("Source")),
                "typeSource": txt(r.get("Type de source")),
                "date": date(r, "Date de parution"),
                "saisi": txt(r.get("Saisi le"))[:10],
                "lien": txt(r.get("Lien")),
                "retenir": txt(r.get("À retenir")),
                "auteur": txt(r.get("Auteur")),
                "genre": txt(r.get("Genre")),
                "rubrique": txt(r.get("Rubrique")),
                "nature": txt(r.get("Nature de l'information")),
                "interet": txt(r.get("Intérêt")),
                "traitement": txt(r.get("Traitement")),
                "lieux": lieux,
                "communes": cc,
                "dossiers": rel(r.get("Dossiers")),
                "personnes": rel(r.get("Personnes et organisations")),
            }
        )
    articles.sort(key=lambda a: (a["date"] or "0000", a["saisi"]), reverse=True)
    kb["articles"] = articles
    titres = {a["id"]: a["titre"] for a in articles}

    kb["notes"] = [
        {
            "id": pid(r["url"]),
            "titre": txt(r.get("Titre")),
            "type": txt(r.get("Type")),
            "etat": txt(r.get("État")),
            "arreteAu": date(r, "Arrêtée au"),
            "aRendreLe": date(r, "À rendre le"),
            "demandeur": txt(r.get("Demandeur")),
            "destination": txt(r.get("Destination")),
            "dossiers": rel(r.get("Dossier")),
            "sources": rel(r.get("Sources mobilisées")),
            "documents": rel(r.get("Documents mobilisés")),
            "diffusion": txt(r.get("Diffusion")) or "Interne",
            "html": note_html(r.get("__contenu") or "", titres),
        }
        for r in raw["productions"]
        if txt(r.get("Type")) != "Modèle"
    ]
    kb["notes"].sort(key=lambda n: n["arreteAu"], reverse=True)

    # Documents de référence : études et documents officiels, publics par nature
    kb["documents"] = sorted(
        (
            {
                "id": pid(r["url"]),
                "titre": txt(r.get("Titre")),
                "producteur": txt(r.get("Producteur")),
                "type": txt(r.get("Type")),
                "collection": txt(r.get("Collection")),
                "numero": txt(r.get("Numéro")),
                "date": date(r, "Date de publication"),
                "themes": multi(r.get("Thèmes")),
                "resume": txt(r.get("Résumé")),
                "chiffres": txt(r.get("Chiffres clés")),
                "statut": txt(r.get("Statut")),
                "lien": txt(r.get("Lien")),
                "dossiers": rel(r.get("Dossiers")),
                "verifieLe": date(r, "Vérifié le"),
            }
            for r in raw.get("documents", [])
        ),
        key=lambda d: d["date"] or "0000",
        reverse=True,
    )
    return kb


# ---------------------------------------------------------------- profils
JUDICIAIRE = re.compile(
    r"mis(e|es)? en examen|condamn|gard[ée]e? à vue|prévenu|accusé|enquête|interpell|assassin|meurtre|"
    r"homicide|tué|abattu|présumé|réclusion|incarcér|détenu|détention|blanchiment|extorsion|mafi|"
    r"criminel|criminalité|procès|parquet|perquisition|mandat d'arrêt|relax|acquitt|violences",
    re.I,
)
RUBRIQUES_EXCLUES = {"Justice", "Faits divers"}
TYPES_FAITS_EXCLUS = {"Enquête / interpellation", "Mise en examen", "Procès / audience", "Décision de justice", "Décès"}
TYPES_DOSSIERS_EXCLUS = {"Affaire judiciaire", "Procès"}
QUALITES_PUBLIQUES = {"Élu", "Ancien élu", "Haut fonctionnaire"}
QUALITES_EXCLUES = {"Partie au procès", "Partie civile"}

# Liste blanche du profil public : pour chaque base, les champs conservés.
CHAMPS_PUBLICS = {
    "communes": None,  # tous les champs : données publiques
    "faits": ["id", "titre", "date", "dateFin", "precision", "type", "rubrique", "fiabilite", "jalon",
              "communes", "dossiers", "personnes", "sources"],
    "agenda": ["id", "titre", "date", "dateFin", "type", "rubrique", "certitude", "communes", "lieu",
               "lien", "dossiers", "personnes"],
    "roles": ["id", "titre", "categorie", "mandat", "instance", "debut", "fin", "actuel", "antenne",
              "fiabilite", "verifieLe", "personnes", "dossiers", "communes", "sources"],
    "personnes": ["id", "nom", "nature", "qualite", "fonction", "rattachement", "pron", "verifieLe"],
    "dossiers": ["id", "titre", "type", "rubrique", "resume", "debut", "fin", "personnes"],
    "articles": ["id", "titre", "source", "typeSource", "date", "lien", "genre", "rubrique", "lieux",
                 "communes", "dossiers", "personnes"],
    # notes : seules celles marquées « Publiable » dans Notion, qui ne reposent que sur des sources publiques
    "notes": ["id", "titre", "type", "etat", "arreteAu", "dossiers", "sources", "documents", "html"],
    "drones": ["code", "titre", "date", "lieu", "duree"],
    "documents": None,  # documents officiels publiés : tous les champs
}


def propre(*textes):
    return not JUDICIAIRE.search(" ".join(textes))


def profil_public(kb):
    garde = {
        "communes": lambda c: True,
        "faits": lambda f: f["rubrique"] not in RUBRIQUES_EXCLUES and f["type"] not in TYPES_FAITS_EXCLUS
        and propre(f["titre"]),
        "agenda": lambda e: e["rubrique"] not in RUBRIQUES_EXCLUES and propre(e["titre"]),
        "roles": lambda r: r["categorie"] in ("Mandat électif", "Fonction") and propre(r["titre"], r["antenne"]),
        "personnes": lambda p: propre(p["fonction"], p["rattachement"])
        and not (set(p["qualite"]) & QUALITES_EXCLUES)
        and (p["nature"] != "Personne" or bool(set(p["qualite"]) & QUALITES_PUBLIQUES)),
        "dossiers": lambda d: d["rubrique"] not in RUBRIQUES_EXCLUES and d["type"] not in TYPES_DOSSIERS_EXCLUS
        and propre(d["titre"], d["resume"]),
        "articles": lambda a: a["rubrique"] not in RUBRIQUES_EXCLUES and propre(a["titre"]),
        "notes": lambda n: n.get("diffusion") == "Publiable",
        "drones": lambda d: True,
        "documents": lambda d: True,
    }
    out = {}
    for base, lignes in kb.items():
        champs = CHAMPS_PUBLICS[base]
        out[base] = [
            (dict(l) if champs is None else {k: l[k] for k in champs if k in l}) for l in lignes if garde[base](l)
        ]
    # Les relations ne doivent pointer que vers des fiches conservées.
    ids = {b: {l["id"] for l in out[b]} for b in ("faits", "agenda", "roles", "personnes", "dossiers", "articles")}
    cibles = {"dossiers": "dossiers", "personnes": "personnes", "sources": "articles"}
    for lignes in out.values():
        for l in lignes:
            for champ, base in cibles.items():
                if champ in l:
                    l[champ] = [i for i in l[champ] if i in ids[base]]
    # Un rôle sans personne publiée n'a plus de sens.
    out["roles"] = [r for r in out["roles"] if r["personnes"]]
    return out


# -------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw", default=os.path.join(RACINE, "prive", "raw.json"))
    ap.add_argument("--profil", choices=["public", "complet"], required=True)
    ap.add_argument("--sortie", default=os.path.join(RACINE, "data"))
    ap.add_argument("--date", default="", help="date de l'export, AAAA-MM-JJ (défaut : aujourd'hui)")
    a = ap.parse_args()

    raw = json.load(open(a.raw, encoding="utf-8"))
    kb = construire(raw)

    src = os.path.join(RACINE, "sources")
    drones = json.load(open(os.path.join(src, "drones.json"), encoding="utf-8"))
    refs = os.path.join(RACINE, "prive", "drones_refs.json")
    if a.profil == "complet" and os.path.exists(refs):
        for d, r in zip(drones, json.load(open(refs, encoding="utf-8"))):
            d["ref"] = r
    kb["drones"] = sorted(drones, key=lambda d: d["date"], reverse=True)
    maires = json.load(open(os.path.join(src, "maires_sortants_mars_2026.json"), encoding="utf-8"))
    for c in kb["communes"]:
        c["maireSortant2026"] = maires.get(c["code"], "")

    brut = {b: len(v) for b, v in kb.items()}
    if a.profil == "public":
        kb = profil_public(kb)

    # Contrôle : aucune relation ne doit pointer dans le vide.
    ids = {b: {l["id"] for l in kb[b]} for b in ("personnes", "dossiers", "articles")}
    vides = 0
    for b, lignes in kb.items():
        for l in lignes:
            for champ, base in (("dossiers", "dossiers"), ("personnes", "personnes"), ("sources", "articles")):
                manq = [i for i in l.get(champ, []) if i not in ids[base]]
                if manq:
                    vides += len(manq)
                    l[champ] = [i for i in l[champ] if i in ids[base]]
    if vides:
        print(f"attention : {vides} relation(s) pointaient vers une fiche absente et ont été retirées", file=sys.stderr)

    meta = {
        "profil": a.profil,
        "exporteLe": a.date or datetime.date.today().isoformat(),
        "compteurs": {b: len(v) for b, v in kb.items()},
        "compteursBase": brut,
    }
    data = {"meta": meta, **kb}

    os.makedirs(a.sortie, exist_ok=True)
    js = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(a.sortie, "kb.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    with open(os.path.join(a.sortie, "kb.js"), "w", encoding="utf-8") as f:
        f.write("window.KB_DATA=" + js + ";\n")
    geo = {
        "communes": json.load(open(os.path.join(src, "communes.geojson"), encoding="utf-8")),
        "epci": json.load(open(os.path.join(src, "epci.geojson"), encoding="utf-8")),
    }
    with open(os.path.join(a.sortie, "geo.js"), "w", encoding="utf-8") as f:
        f.write("window.KB_GEO=" + json.dumps(geo, ensure_ascii=False, separators=(",", ":")) + ";\n")

    print(f"profil {a.profil} — export du {meta['exporteLe']}")
    for b in kb:
        print(f"  {b:10s} {len(kb[b]):5d} sur {brut[b]:5d}")


if __name__ == "__main__":
    main()
