"""Reporte l'exécutif municipal (Répertoire national des élus) dans la base
Notion « Communes de Corse ».

Lit data/ouvertes/elus.json (produit par build_ouvertes.py) et met à jour,
pour chaque fiche commune repérée par son code Insee, les champs :
  Maire (RNE), Maire depuis, Adjoints (RNE), Conseillers municipaux,
  Élus relevés le.

Ne touche à aucun autre champ. Une fiche n'est réécrite que si une valeur
change, pour ne pas polluer l'historique des pages.

Usage : NOTION_TOKEN=... python scripts/notion_communes.py [--essai]
  --essai : affiche ce qui serait modifié sans rien écrire.

L'intégration Notion qui porte le jeton doit avoir accès à la base
« Communes de Corse » (menu ••• de la base > Connexions).
"""
import json
import os
import sys
import time
from pathlib import Path

import requests

RACINE = Path(__file__).resolve().parent.parent
SOURCE_COMMUNES = "8f56188b-fc50-4a85-b3d3-b3c29befd082"
API = "https://api.notion.com/v1"
VERSION = "2025-09-03"


def entetes():
    jeton = os.environ.get("NOTION_TOKEN")
    if not jeton:
        sys.exit("NOTION_TOKEN absent : rien à faire.")
    return {
        "Authorization": f"Bearer {jeton}",
        "Notion-Version": VERSION,
        "Content-Type": "application/json",
    }


def appel(methode, chemin, corps=None, h=None):
    for essai in range(5):
        r = requests.request(methode, API + chemin, headers=h, json=corps, timeout=60)
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(float(r.headers.get("Retry-After", 2 ** essai)))
            continue
        r.raise_for_status()
        return r.json()
    r.raise_for_status()


def texte(prop):
    if not prop:
        return ""
    morceaux = prop.get("rich_text") or prop.get("title") or []
    return "".join(m.get("plain_text", "") for m in morceaux)


def fiches(h):
    """Toutes les pages de la base, indexées par code Insee."""
    res, curseur = {}, None
    while True:
        corps = {"page_size": 100}
        if curseur:
            corps["start_cursor"] = curseur
        page = appel("POST", f"/data_sources/{SOURCE_COMMUNES}/query", corps, h)
        for p in page["results"]:
            code = texte(p["properties"].get("Code Insee"))
            if code:
                res[code] = p
        if not page.get("has_more"):
            return res
        curseur = page["next_cursor"]


def nom_complet(e):
    return f"{e['prenom']} {e['nom']}".strip()


def valeurs(elus, effectif):
    maire = next((e for e in elus if e["fonction"] == "Maire"), None)
    adjoints = [e for e in elus if "adjoint" in e["fonction"].lower()]
    return {
        "Maire (RNE)": nom_complet(maire) if maire else "",
        "Maire depuis": (maire or {}).get("debutFonction") or (maire or {}).get("debutMandat") or "",
        "Adjoints (RNE)": " ; ".join(f"{nom_complet(a)} ({a['fonction']})" for a in adjoints),
        "Conseillers municipaux": effectif,
    }


def actuelles(p):
    pr = p["properties"]
    date = (pr.get("Maire depuis") or {}).get("date") or {}
    return {
        "Maire (RNE)": texte(pr.get("Maire (RNE)")),
        "Maire depuis": date.get("start") or "",
        "Adjoints (RNE)": texte(pr.get("Adjoints (RNE)")),
        "Conseillers municipaux": (pr.get("Conseillers municipaux") or {}).get("number"),
    }


def proprietes(v, releve):
    rt = lambda s: {"rich_text": [{"text": {"content": s[:2000]}}] if s else []}
    return {
        "Maire (RNE)": rt(v["Maire (RNE)"]),
        "Maire depuis": {"date": {"start": v["Maire depuis"]} if v["Maire depuis"] else None},
        "Adjoints (RNE)": rt(v["Adjoints (RNE)"]),
        "Conseillers municipaux": {"number": v["Conseillers municipaux"]},
        "Élus relevés le": {"date": {"start": releve}},
    }


def main():
    essai = "--essai" in sys.argv
    donnees = json.loads((RACINE / "data/ouvertes/elus.json").read_text("utf-8"))
    releve = donnees.get("miseAJour") or time.strftime("%Y-%m-%d")
    h = entetes()
    pages = fiches(h)
    print(f"{len(pages)} fiches communes dans Notion")
    modifiees = absentes = 0
    for code, elus in sorted(donnees["communes"].items()):
        p = pages.get(code)
        if not p:
            absentes += 1
            continue
        v = valeurs(elus, donnees["effectifs"].get(code))
        if v == actuelles(p):
            continue
        modifiees += 1
        if essai:
            print(code, v["Maire (RNE)"])
            continue
        appel("PATCH", f"/pages/{p['id']}", {"properties": proprietes(v, releve)}, h)
        time.sleep(0.35)  # l'API Notion limite à ~3 requêtes par seconde
    print(f"{modifiees} fiches {'à modifier' if essai else 'modifiées'}, {absentes} codes sans fiche")


if __name__ == "__main__":
    main()
