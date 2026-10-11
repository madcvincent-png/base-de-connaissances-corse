#!/usr/bin/env python3
"""Veille RSS vers la base Notion « Articles — revue de presse ».

Chaque passage :
  1. lit les dossiers en veille dans Notion, avec leurs mots-clés ;
  2. lit les flux déclarés dans veille/sources.json ;
  3. garde les articles récents qui touchent au moins un dossier en veille ;
  4. les écrit dans Notion en « À dépouiller », avec la date de parution du flux,
     les dossiers et les communes reconnus, sauf s'ils y sont déjà (même lien).

    NOTION_TOKEN=... python3 scripts/veille.py            # passage réel
    python3 scripts/veille.py --essai                     # aucune écriture

Le dépôt est public, donc les journaux d'exécution aussi : le script n'y écrit que
des compteurs, jamais un titre d'article ni un nom de dossier.
"""
import argparse
import datetime as dt
import html
import json
import os
import re
import sys
import time
import unicodedata
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from zoneinfo import ZoneInfo

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARIS = ZoneInfo("Europe/Paris")

# Bases Notion (identifiants de base, pas des secrets)
BASE_ARTICLES = "8cbccb52201a45a9aff3d76cf48f6bbc"
BASE_DOSSIERS = "55cca4a4db16470ca000f14686b256fd"
BASE_COMMUNES = "9f1cc0bdede84b80ba754f8b5e61ca8c"

SOURCES_NOTION = {
    "Corse-Matin", "France 3 Corse ViaStella", "ICI RCFM", "Corse Net Infos", "Alta Frequenza", "Le Monde",
    "Le Figaro", "Libération", "Le Parisien", "Mediapart", "AFP", "Franceinfo", "Arritti", "Autre",
}
TYPES_SOURCE = {
    "Presse quotidienne régionale", "Presse nationale", "Agence", "Audiovisuel", "Site d'information",
    "Presse d'opinion", "Document officiel / communiqué",
}

# Noms de lieux larges : ils ne suffisent jamais seuls à rattacher un article.
LIEUX_LARGES = {"corse", "corsica", "haute-corse", "corse-du-sud", "marseille", "paris", "nice", "toulon",
                "balagne", "cap corse", "castagniccia", "plaine orientale", "extreme-sud", "valinco", "niolu",
                "fium'orbu", "fiumorbu"}


# ======================================================================= texte
def norm(s):
    """Minuscules, sans accents ; apostrophes et ponctuation réduites à des espaces,
    pour que « d'Orsoni » contienne « orsoni »."""
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return " " + s.strip() + " "


def texte_brut(s):
    s = re.sub(r"<[^>]+>", " ", s or "")
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


# ================================================================== mots-clés
def lire_mots_cles(champ):
    """« Orsoni ; Vero (Véro) ; Guy Orsoni (fils) : attention à l'homonymie » -> variantes utilisables.

    Une parenthèse d'un seul mot à majuscule est une variante (« Véro ») ; les autres sont des
    annotations (« fils », « coquille », « frère, mort en 1983 ») et sont écartées. Ce qui suit
    « : » est un commentaire.
    """
    sortie = []
    for brut in re.split(r"[;\n]", champ or ""):
        t = brut.split(" : ")[0].strip()
        variantes = []
        m = re.match(r"^(.*?)\s*\(([^)]*)\)\s*(.*)$", t)
        if m:
            t = (m.group(1) + " " + m.group(3)).strip()
            p = m.group(2).strip()
            if re.fullmatch(r"[A-ZÀ-Ý][\w'’-]+", p):
                variantes.append(p)
        t = t.strip(" «»\"“”'").strip()
        for v in [t] + variantes:
            if len(v) >= 3 and v not in sortie:
                sortie.append(v)
    return sortie


def classer(terme, communes):
    """fort : nom propre ou sigle propre au dossier ; faible : lieu, ou nom commun."""
    if re.fullmatch(r"[A-Z0-9]{2,8}", terme):
        return "sigle"
    n = norm(terme).strip()
    if n in communes or n in LIEUX_LARGES:
        return "lieu"
    if any(m[:1].isupper() for m in re.split(r"[\s'’-]+", terme) if m):
        return "fort"
    return "faible"


class Dossier:
    def __init__(self, pid, titre, mots, rubrique, priorite, communes):
        self.id, self.titre, self.rubrique, self.priorite = pid, titre, rubrique, priorite
        self.termes = [(t, classer(t, communes), norm(t)) for t in lire_mots_cles(mots)]

    def correspond(self, texte_original, texte_norm):
        """Renvoie les termes trouvés si le seuil est atteint, sinon une liste vide.

        Seuil : un terme fort ou un sigle ; ou deux termes faibles distincts dont au moins un
        n'est pas un lieu.
        """
        trouves = []
        for t, genre, n in self.termes:
            if genre == "sigle":
                ok = re.search(r"(?<![A-Za-z0-9])" + re.escape(t) + r"(?![A-Za-z0-9])", texte_original)
            else:
                ok = n.strip() and n in texte_norm
            if ok:
                trouves.append((t, genre))
        forts = [t for t, g in trouves if g in ("fort", "sigle")]
        faibles = [t for t, g in trouves if g in ("faible", "lieu")]
        if forts or (len(set(faibles)) >= 2 and any(g == "faible" for _, g in trouves)):
            return trouves
        return []


def communes_citees(titre, communes_noms):
    """Communes nommées dans le titre (avec majuscule, cinq lettres au moins)."""
    vues = []
    for nom, pid in communes_noms:
        if len(nom) >= 5 and re.search(r"(?<![\wÀ-ÿ-])" + re.escape(nom) + r"(?![\wÀ-ÿ-])", titre):
            vues.append(pid)
    return vues


# ====================================================================== flux
def lien_propre(url):
    """Retire les paramètres de suivi et l'ancre, pour reconnaître un même article."""
    if not url:
        return ""
    p = urlsplit(url.strip())
    q = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True) if not k.lower().startswith(("utm_", "xtor", "at_"))]
    return urlunsplit((p.scheme, p.netloc, p.path, urlencode(q), ""))


def date_entree(e):
    for cle in ("published_parsed", "updated_parsed"):
        t = e.get(cle)
        if t:
            return dt.datetime(*t[:6], tzinfo=dt.timezone.utc)
    return None


def lire_flux(source, contenu=None):
    """Lit un flux (ou un contenu déjà téléchargé, pour les tests) et renvoie des entrées simples."""
    import feedparser

    d = feedparser.parse(contenu if contenu is not None else source["url"],
                         agent="VeilleCorse/1.0 (+https://github.com/madcvincent-png/base-de-connaissances-corse)")
    if d.bozo and not d.entries:
        raise ValueError(f"flux illisible : {type(d.bozo_exception).__name__}")
    sortie = []
    for e in d.entries:
        titre = texte_brut(e.get("title"))
        if not titre:
            continue
        nom_source = source["source"]
        # Google Actualités et agrégateurs : la source réelle est dans l'entrée.
        if source.get("agregateur") and e.get("source", {}).get("title"):
            reel = e["source"]["title"].strip()
            nom_source = reel if reel in SOURCES_NOTION else "Autre"
        sortie.append({
            "titre": titre,
            "lien": lien_propre(e.get("link")),
            "chapeau": texte_brut(e.get("summary"))[:1900],
            "auteur": texte_brut(e.get("author"))[:200],
            "date": date_entree(e),
            "source": nom_source,
            "type": source.get("type"),
        })
    return sortie


# ==================================================================== Notion
class Notion:
    def __init__(self, jeton):
        import requests

        self.s = requests.Session()
        self.s.headers.update({"Authorization": f"Bearer {jeton}", "Notion-Version": "2022-06-28",
                               "Content-Type": "application/json"})

    def _appel(self, methode, chemin, corps=None):
        for essai in range(5):
            r = self.s.request(methode, "https://api.notion.com/v1/" + chemin, json=corps, timeout=30)
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(float(r.headers.get("Retry-After", 2 ** essai)))
                continue
            if r.status_code >= 400:
                # Le message d'erreur Notion ne contient pas de données de la base.
                raise RuntimeError(f"Notion {r.status_code} : {r.json().get('code', '')} {r.json().get('message', '')[:200]}")
            time.sleep(0.35)  # moins de trois requêtes par seconde
            return r.json()
        raise RuntimeError("Notion : trop de tentatives")

    def lignes(self, base, filtre=None):
        corps, curseur = {"page_size": 100}, None
        if filtre:
            corps["filter"] = filtre
        while True:
            if curseur:
                corps["start_cursor"] = curseur
            r = self._appel("POST", f"databases/{base}/query", corps)
            yield from r["results"]
            if not r.get("has_more"):
                return
            curseur = r["next_cursor"]

    def existe(self, lien):
        r = self._appel("POST", f"databases/{BASE_ARTICLES}/query",
                        {"page_size": 1, "filter": {"property": "Lien", "url": {"equals": lien}}})
        return bool(r["results"])

    def creer(self, proprietes):
        return self._appel("POST", "pages", {"parent": {"database_id": BASE_ARTICLES}, "properties": proprietes})


def texte_prop(p):
    if not p:
        return ""
    cle = p["type"]
    if cle in ("title", "rich_text"):
        return "".join(x.get("plain_text", "") for x in p[cle])
    if cle == "select":
        return (p["select"] or {}).get("name", "")
    return ""


def charger_communes(notion):
    noms = []
    for l in notion.lignes(BASE_COMMUNES):
        nom = texte_prop(l["properties"].get("Commune"))
        if nom:
            noms.append((nom, l["id"]))
    return noms


def charger_dossiers(notion, niveaux, communes_norm):
    filtre = {"or": [{"property": "Veille", "select": {"equals": n}} for n in niveaux]}
    out = []
    for l in notion.lignes(BASE_DOSSIERS, filtre):
        p = l["properties"]
        out.append(Dossier(l["id"], texte_prop(p.get("Dossier")), texte_prop(p.get("Mots-clés et variantes")),
                           texte_prop(p.get("Rubrique")), texte_prop(p.get("Priorité")), communes_norm))
    return out


def proprietes_article(a, dossiers, communes):
    rt = lambda s: [{"text": {"content": s[:1900]}}] if s else []
    p = {
        "Titre": {"title": rt(a["titre"])},
        "Lien": {"url": a["lien"] or None},
        "Source": {"select": {"name": a["source"]}},
        "Traitement": {"select": {"name": "À dépouiller"}},
        "Chapeau": {"rich_text": rt(a["chapeau"])},
        "Dossiers": {"relation": [{"id": d.id} for d in dossiers]},
    }
    if a.get("type"):
        p["Type de source"] = {"select": {"name": a["type"]}}
    if a.get("auteur"):
        p["Auteur"] = {"rich_text": rt(a["auteur"])}
    if a.get("date"):
        p["Date de parution"] = {"date": {"start": a["date"].astimezone(PARIS).date().isoformat()}}
    rubriques = [d.rubrique for d in sorted(dossiers, key=lambda d: {"Haute": 0, "Moyenne": 1}.get(d.priorite, 2)) if d.rubrique]
    if rubriques:
        p["Rubrique"] = {"select": {"name": rubriques[0]}}
    if communes:
        p["Communes"] = {"relation": [{"id": c} for c in communes]}
    return p


# ===================================================================== tri
def trier(articles, dossiers, communes_noms, maintenant, fenetre_h):
    """Garde les articles récents qui touchent un dossier. Renvoie (retenus, compteurs)."""
    c = {"lus": 0, "sans_date": 0, "trop_anciens": 0, "dates_futures": 0, "hors_veille": 0, "retenus": 0}
    retenus, vus = [], set()
    for a in articles:
        c["lus"] += 1
        d = a["date"]
        if d is None:
            c["sans_date"] += 1
        elif d > maintenant + dt.timedelta(hours=1):
            c["dates_futures"] += 1  # repris au passage qui suivra la date annoncée
            continue
        elif d < maintenant - dt.timedelta(hours=fenetre_h):
            c["trop_anciens"] += 1
            continue
        cle = a["lien"] or norm(a["titre"])
        if cle in vus:
            continue
        vus.add(cle)
        texte = a["titre"] + " " + a["chapeau"]
        tn = norm(texte)
        touches = [dos for dos in dossiers if dos.correspond(texte, tn)]
        if not touches:
            c["hors_veille"] += 1
            continue
        retenus.append((a, touches, communes_citees(a["titre"], communes_noms)))
        c["retenus"] += 1
    return retenus, c


# ===================================================================== main
def charger_sources(chemin):
    with open(chemin, encoding="utf-8") as f:
        sources = [s for s in json.load(f)["flux"] if s.get("actif", True)]
    for s in sources:
        if s["source"] not in SOURCES_NOTION:
            raise SystemExit(f"Source inconnue dans Notion : {s['source']} (ajoutez l'option ou utilisez « Autre »)")
        if s.get("type") and s["type"] not in TYPES_SOURCE:
            raise SystemExit(f"Type de source inconnu dans Notion : {s['type']}")
    return sources


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--sources", default=os.path.join(RACINE, "veille", "sources.json"))
    ap.add_argument("--fenetre", type=int, default=int(os.environ.get("VEILLE_FENETRE_H", 48)),
                    help="ne garder que les articles parus depuis tant d'heures (48 par défaut)")
    ap.add_argument("--niveaux", default=os.environ.get("VEILLE_NIVEAUX", "Veille active"),
                    help="niveaux de veille pris en compte, séparés par des virgules")
    ap.add_argument("--plafond", type=int, default=int(os.environ.get("VEILLE_PLAFOND", 40)),
                    help="nombre maximal d'articles écrits par passage")
    ap.add_argument("--essai", action="store_true", help="ne rien écrire dans Notion")
    a = ap.parse_args(argv)

    jeton = os.environ.get("NOTION_TOKEN")
    if not jeton:
        raise SystemExit("NOTION_TOKEN manquant : ajoutez-le dans les secrets du dépôt.")
    notion = Notion(jeton)
    sources = charger_sources(a.sources)

    communes_noms = charger_communes(notion)
    communes_norm = {norm(n).strip() for n, _ in communes_noms}
    dossiers = charger_dossiers(notion, [n.strip() for n in a.niveaux.split(",")], communes_norm)
    print(f"{len(dossiers)} dossiers en veille, {len(communes_noms)} communes, {len(sources)} flux")

    articles, en_erreur = [], 0
    for s in sources:
        try:
            lus = lire_flux(s)
            articles += lus
            print(f"  flux « {s['nom']} » : {len(lus)} entrées")
        except Exception as e:  # un flux en panne n'arrête pas la veille
            en_erreur += 1
            print(f"  flux « {s['nom']} » : erreur ({type(e).__name__})")

    maintenant = dt.datetime.now(dt.timezone.utc)
    retenus, c = trier(articles, dossiers, communes_noms, maintenant, a.fenetre)
    print("tri : " + ", ".join(f"{k.replace('_', ' ')} {v}" for k, v in c.items()))

    ecrits = deja = 0
    for art, touches, communes in retenus[: a.plafond]:
        if art["lien"] and notion.existe(art["lien"]):
            deja += 1
            continue
        if not a.essai:
            notion.creer(proprietes_article(art, touches, communes))
        ecrits += 1
    if len(retenus) > a.plafond:
        print(f"plafond atteint : {len(retenus) - a.plafond} articles reportés au prochain passage")
    print(f"{'(essai) ' if a.essai else ''}écrits {ecrits}, déjà présents {deja}, flux en erreur {en_erreur}")
    if sources and en_erreur == len(sources):
        sys.exit(1)  # tous les flux en panne : l'échec doit se voir dans GitHub


if __name__ == "__main__":
    main()
