#!/usr/bin/env python3
"""Écrit les coquilles HTML du site. Le contenu vient de data/kb.js et des scripts assets/.

    python3 scripts/build_pages.py

Chaque page porte un data-page qui indique à assets/pages.js quelle rubrique rendre.
La carte d'accueil (index.html) est gérée par assets/carte.js.
data/ouvertes.js (élus, sites, monuments) est facultatif : sans lui, les blocs correspondants disparaissent.
"""
import os

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PAGES = [
    # fichier, data-page, titre, leaflet, carte
    ("index.html", "carte", "Carte", True, True),
    ("communes.html", "communes", "Communes", False, False),
    ("commune.html", "commune", "Fiche commune", True, False),
    ("chronologie.html", "chronologie", "Chronologie", False, False),
    ("agenda.html", "agenda", "Agenda", False, False),
    ("dossiers.html", "dossiers", "Dossiers", False, False),
    ("dossier.html", "dossier", "Fiche dossier", False, False),
    ("repertoire.html", "repertoire", "Répertoire", False, False),
    ("elus.html", "elus", "Élus", False, False),
    ("sites.html", "sites", "Sites et équipements", True, False),
    ("documents.html", "documents", "Documents de référence", False, False),
    ("personne.html", "personne", "Fiche personne", False, False),
    ("articles.html", "articles", "Articles", False, False),
    ("notes.html", "notes", "Notes et synthèses", False, False),
    ("note.html", "note", "Note", False, False),
    ("drones.html", "drones", "Images drone", False, False),
    ("a-propos.html", "apropos", "Méthode et limites", False, False),
]

CARTE = """<main id="page" class="carte-page">
  <aside class="volet" id="volet" aria-label="Filtres de la carte">
    <div class="volet-haut">
      <h1>Carte thématique</h1>
      <p class="chapo">Choisissez ce qui se colore, puis affinez par rubrique et par période. Cliquez une commune pour voir ce qui lui est rattaché.</p>
      <div id="couches" class="segments" role="group" aria-label="Couche affichée"></div>
      <div id="rubriques" class="pastilles" role="group" aria-label="Rubriques"></div>
      <div class="ligne-filtres">
        <div class="champ"><label for="de">Du</label><select id="de"></select></div>
        <div class="champ"><label for="a">Au</label><select id="a"></select></div>
      </div>
    </div>
    <div id="etat" class="volet-etat" aria-live="polite"></div>
    <div id="commune" class="commune-choisie" hidden></div>
    <div id="liste" class="volet-liste"></div>
  </aside>
  <section class="zone-carte">
    <button type="button" class="tirette" id="tirette" aria-controls="volet" aria-expanded="true"
      title="Glisser pour élargir le volet, cliquer pour le replier"><span class="sr">Replier ou déplier le volet</span></button>
    <div id="carte" role="region" aria-label="Carte thématique de la Corse"></div>
    <div class="outils-carte">
      <button type="button" class="outil" id="plein" aria-pressed="false">Carte seule</button>
      <label><input id="fond" type="checkbox" checked>Fond IGN</label>
      <label><input id="epci" type="checkbox">Intercommunalités</label>
      <label><input id="sites" type="checkbox">Sites et équipements</label>
    </div>
    <div id="legende" class="legende"></div>
  </section>
</main>"""


def page(fichier, data_page, titre, leaflet, carte):
    corps = CARTE if carte else '<main id="page" class="page"></main>'
    css_leaflet = '<link rel="stylesheet" href="vendor/leaflet/leaflet.css">' if leaflet else ""
    scripts = ['<script src="data/kb.js"></script>', '<script src="data/images.js"></script>', '<script src="data/ouvertes.js"></script>',
               '<script src="data/geo.js"></script>' if (leaflet or carte) else ""]
    if leaflet or carte:
        scripts.append('<script src="vendor/leaflet/leaflet.js"></script>')
    scripts.append('<script src="assets/kb.js"></script>')
    scripts.append('<script src="assets/carte.js"></script>' if carte else '<script src="assets/pages.js"></script>')
    scripts = "\n  ".join(s for s in scripts if s)
    return f"""<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{titre} — Base de connaissances Corse</title>
  <link rel="icon" href="assets/favicon.ico">
  <link rel="stylesheet" href="assets/kb.css">
  {css_leaflet}
</head>
<body data-page="{data_page}">
  {corps}
  {scripts}
</body>
</html>
"""


def main():
    for fichier, data_page, titre, leaflet, carte in PAGES:
        with open(os.path.join(RACINE, fichier), "w", encoding="utf-8") as f:
            f.write(page(fichier, data_page, titre, leaflet, carte))
    print(f"{len(PAGES)} pages écrites.")


if __name__ == "__main__":
    main()
