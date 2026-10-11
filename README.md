# Base de connaissances Corse

Maquette d'une base de connaissances sur la Corse, alimentée par la veille de la documentation de France 3 Corse ViaStella. Le site consulte les données exportées de Notion : communes, chronologie, agenda, dossiers, répertoire, articles, images drone.

Le site est statique (HTML, CSS, JavaScript, sans étape de compilation). Il s'ouvre depuis un serveur local ou un hébergement statique.

## Contenu

- `index.html` : carte thématique (faits, articles, agenda, drones), filtrée par rubrique et par période
- `communes.html`, `commune.html` : liste des 360 communes, fiche de chaque commune
- `chronologie.html`, `agenda.html`, `dossiers.html`, `dossier.html`
- `repertoire.html`, `personne.html` : personnes et organisations
- `articles.html`, `notes.html`, `note.html`, `drones.html`
- `a-propos.html` : méthode, limites et ce qui est vérifié
- `assets/kb.js` : socle commun (en-tête, recherche, utilitaires)
- `assets/pages.js` : rendu des pages de consultation
- `assets/carte.js` : carte thématique
- `assets/kb.css` : mise en forme
- `data/kb.json`, `data/kb.js`, `data/geo.js` : données produites par le build (ne pas modifier à la main)
- `sources/` : contours des communes et intercommunalités, archives drone, maires sortants de mars 2026
- `scripts/build_data.py` : fabrique les données à partir de l'export Notion
- `scripts/build_pages.py` : écrit les pages HTML
- `vendor/leaflet/` : Leaflet 1.9, copie locale
- `archive/municipales-2026/` : ancien site des municipales, conservé pour mémoire

## Reconstruire

```bash
# 1. Données (export brut Notion dans prive/raw.json, non versionné)
python3 scripts/build_data.py --raw prive/raw.json --profil public

# 2. Pages HTML
python3 scripts/build_pages.py

# 3. Consulter
python3 -m http.server 8000   # puis http://localhost:8000
```

## Deux profils, une règle

- `--profil complet` : tout ce que contient la base, justice et faits divers compris. **Ne jamais le déposer sur un hébergement public.**
- `--profil public` : liste blanche. Justice, faits divers, rôles procéduraux et notes internes sont écartés. Un champ ajouté dans Notion n'apparaît dans aucun profil tant qu'il n'est pas nommé dans `CHAMPS_PUBLICS`.

Le profil affiché est indiqué en bas de chaque page. Le dossier `prive/` est exclu du dépôt par `.gitignore`.

## Limites connues

- L'export brut `prive/raw.json` a été produit à partir du connecteur Notion. Le script d'export automatique n'est pas encore écrit (`scripts/export_notion.py` est référencé par `build_data.py` mais n'existe pas). Tant qu'il manque, la mise à jour est manuelle.
- Les fonds IGN (Plan IGN v2) demandent un accès Internet. Sans lui, la carte reste utilisable sur fond gris.
- Les données ne sont pas toutes vérifiées. La page « Méthode et limites » indique, base par base, ce qui l'est et ce qui ne l'est pas.
- Un décompte sur carte montre ce qui a été saisi dans la base, pas ce qui s'est produit.

## Publication

Le dépôt est public. Avant toute mise en ligne sur GitHub Pages, il faut une décision explicite de publication et vérifier que seul le profil `public` est déposé.
