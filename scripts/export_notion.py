"""Exporte les bases Notion de la base de connaissances vers prive/raw.json.

C'est le maillon qui manquait pour reconstruire le site sans intervention : avec
NOTION_TOKEN, GitHub Actions peut lire Notion, refaire data/kb.js (profil public
seulement) et republier. Le fichier produit garde le format attendu par
scripts/build_data.py : une liste de lignes par base, chaque propriété aplatie
comme dans l'export d'origine (dates en « date:Nom:start », relations en liste
JSON d'adresses, cases à cocher en __YES__ / __NO__).

Usage : NOTION_TOKEN=... python scripts/export_notion.py [--sortie prive/raw.json]

L'intégration Notion qui porte le jeton doit être connectée aux neuf bases
(menu ••• de chaque base > Connexions). raw.json contient les données internes :
il n'est jamais versionné ni publié.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

import requests

RACINE = Path(__file__).resolve().parent.parent
API = "https://api.notion.com/v1"
VERSION = "2025-09-03"
PAGE = "https://app.notion.com/p/"

# Clé dans raw.json -> source de données Notion
BASES = {
    "articles": "ef257b4b-ca95-4028-af45-50a284dd3657",
    "chrono": "1530597d-f522-4ecd-ae84-a1ec8e67d979",
    "repertoire": "8567ee22-7711-43fd-868f-c755373243c5",
    "communes": "8f56188b-fc50-4a85-b3d3-b3c29befd082",
    "dossiers": "6b87695e-9661-49d6-bfff-b47c7963825a",
    "productions": "ae710f67-a146-476e-ba6e-a98c59f0c755",
    "agenda": "0d5b1c1f-d53a-4f9f-94b3-e7ec00bdce16",
    "roles": "8fe1d801-feeb-451a-989d-7b526d1c2d33",
    "documents": "6d16cbf6-e35e-47be-a126-4bbb8a51afbf",
}
# Bases dont on exporte aussi le contenu des pages (le texte des notes)
AVEC_CONTENU = {"productions"}


# ------------------------------------------------------------------ API
class Notion:
    def __init__(self, jeton):
        self.h = {"Authorization": f"Bearer {jeton}", "Notion-Version": VERSION, "Content-Type": "application/json"}

    def appel(self, methode, chemin, corps=None):
        for essai in range(6):
            r = requests.request(methode, API + chemin, headers=self.h, json=corps, timeout=60)
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(float(r.headers.get("Retry-After", 2 ** essai)))
                continue
            r.raise_for_status()
            time.sleep(0.34)  # environ trois requêtes par seconde, la limite de l'API
            return r.json()
        r.raise_for_status()

    def pages(self, source):
        curseur = None
        while True:
            corps = {"page_size": 100, **({"start_cursor": curseur} if curseur else {})}
            rep = self.appel("POST", f"/data_sources/{source}/query", corps)
            yield from rep["results"]
            if not rep.get("has_more"):
                return
            curseur = rep["next_cursor"]

    def enfants(self, bloc):
        curseur = None
        while True:
            q = f"?page_size=100" + (f"&start_cursor={curseur}" if curseur else "")
            rep = self.appel("GET", f"/blocks/{bloc}/children{q}")
            yield from rep["results"]
            if not rep.get("has_more"):
                return
            curseur = rep["next_cursor"]


# ------------------------------------------------------------------ propriétés
def adresse(id_):
    return PAGE + id_.replace("-", "")


def texte_riche(morceaux, markdown=True):
    """Texte d'une liste rich_text ; les liens deviennent [texte](adresse), les mentions de page des balises."""
    out = []
    for m in morceaux or []:
        t = m.get("plain_text", "")
        if not markdown:
            out.append(t)
            continue
        if m.get("type") == "mention" and m.get("mention", {}).get("type") == "page":
            out.append(f'<mention-page url="{adresse(m["mention"]["page"]["id"])}"/>')
            continue
        a = m.get("annotations") or {}
        if a.get("bold"):
            t = f"**{t}**"
        elif a.get("italic"):
            t = f"*{t}*"
        lien = m.get("href") or ((m.get("text") or {}).get("link") or {}).get("url")
        if lien and not t.startswith("<mention"):
            t = f"[{t}]({lien})"
        out.append(t)
    return "".join(out)


def aplatir(page):
    """Une page de l'API -> une ligne au format de raw.json."""
    ligne = {"url": adresse(page["id"])}
    for nom, p in page["properties"].items():
        t = p["type"]
        v = p.get(t)
        if t in ("title", "rich_text"):
            ligne[nom] = texte_riche(v, markdown=(t == "rich_text"))
        elif t in ("select", "status"):
            ligne[nom] = v["name"] if v else None
        elif t == "multi_select":
            ligne[nom] = json.dumps([o["name"] for o in v or []], ensure_ascii=False)
        elif t == "relation":
            ligne[nom] = json.dumps([adresse(r["id"]) for r in v or []])
        elif t == "date":
            if v and v.get("start"):
                ligne[f"date:{nom}:start"] = v["start"]
                if v.get("end"):
                    ligne[f"date:{nom}:end"] = v["end"]
                ligne[f"date:{nom}:is_datetime"] = 1 if "T" in v["start"] else 0
            else:
                ligne[f"date:{nom}:is_datetime"] = 0
        elif t == "checkbox":
            ligne[nom] = "__YES__" if v else "__NO__"
        elif t in ("number", "url", "email", "phone_number"):
            ligne[nom] = v
        elif t in ("created_time", "last_edited_time"):
            ligne[nom] = v
        elif t == "people":
            ligne[nom] = json.dumps([x.get("name", "") for x in v or []], ensure_ascii=False)
        elif t == "place" and isinstance(v, dict):
            for cle, cible in (("name", "name"), ("lat", "latitude"), ("lon", "longitude"), ("latitude", "latitude"), ("longitude", "longitude")):
                if v.get(cle) is not None:
                    ligne[f"place:{nom}:{cible}"] = v[cle]
        # rollup, formule, fichiers : non utilisés par le site
    return ligne


# ------------------------------------------------------------------ contenu des pages
def blocs_en_texte(notion, blocs):
    """Convertit les blocs d'une page dans le sous-ensemble lu par build_data.note_html."""
    lignes = []
    for b in blocs:
        t = b["type"]
        c = b.get(t, {})
        rt = texte_riche(c.get("rich_text"))
        if t in ("heading_1", "heading_2", "heading_3"):
            lignes.append("#" * int(t[-1]) + " " + rt)
        elif t in ("paragraph", "quote"):
            if rt.strip():
                lignes.append(rt)
        elif t in ("bulleted_list_item", "numbered_list_item", "to_do"):
            lignes.append("- " + rt)
        elif t == "callout":
            lignes += ['<callout>', "\t" + rt, "</callout>"]
        elif t == "table":
            lignes.append('<table header-row="true">')
            for rang in notion.enfants(b["id"]):
                cellules = rang.get("table_row", {}).get("cells", [])
                lignes.append("<tr>")
                lignes += [f"<td>{texte_riche(cel)}</td>" for cel in cellules]
                lignes.append("</tr>")
            lignes.append("</table>")
    return "\n".join(lignes)


def lire_blocs(notion, page_id):
    return list(notion.enfants(page_id))


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--sortie", default=str(RACINE / "prive" / "raw.json"))
    args = ap.parse_args()
    jeton = os.environ.get("NOTION_TOKEN")
    if not jeton:
        sys.exit("NOTION_TOKEN absent : export impossible.")
    notion = Notion(jeton)
    raw = {}
    for cle, source in BASES.items():
        pages = list(notion.pages(source))
        raw[cle] = [aplatir(p) for p in pages]
        if cle in AVEC_CONTENU:
            for p, ligne in zip(pages, raw[cle]):
                ligne["__contenu"] = blocs_en_texte(notion, lire_blocs(notion, p["id"]))
        print(f"{cle:12} {len(raw[cle]):5} fiches")
    sortie = Path(args.sortie)
    sortie.parent.mkdir(parents=True, exist_ok=True)
    sortie.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
    print(f"Export écrit dans {sortie}")


if __name__ == "__main__":
    main()
