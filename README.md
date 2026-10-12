# Base de connaissances Corse

Maquette d'une base de connaissances sur la Corse, alimentée par la veille de la documentation de France 3 Corse ViaStella. Le site consulte les données exportées de Notion (dossiers, faits datés, répertoire, articles, documents de référence, notes) et des données publiques (élus, installations classées, équipements, monuments).

Le site est statique (HTML, CSS, JavaScript, sans étape de compilation côté navigateur). Il s'ouvre depuis un serveur local ou un hébergement statique.

## Pages

| Menu | Pages |
|---|---|
| Accueil (`index.html`) | échéances, derniers faits datés, chiffres clés sourcés, état de la base, dossiers récents |
| Territoire | `carte.html`, `communes.html` et `commune.html`, `elus.html` (hémicycle de l'Assemblée de Corse), `sites.html` (installations et patrimoine) |
| Actualité | `dossiers.html` et `dossier.html`, `chronologie.html`, `agenda.html`, `articles.html` |
| Documentation | `repertoire.html` et `personne.html`, `documents.html`, `notes.html` et `note.html`, `drones.html`, `a-propos.html` (méthode, règles, glossaire) |

## Fichiers

- `assets/kb.js` : socle commun (en-tête et menus, recherche, glossaire, carrousel, explorateur à facettes, rendus des fiches)
- `assets/pages.js` : rendu des pages ; `assets/carte.js` : carte ; `assets/kb.css` : mise en forme
- `data/kb.js` (et `kb.json`) : données Notion, produites par `scripts/build_data.py` — ne pas modifier à la main
- `data/ouvertes.js` : élus (RNE), installations (Géorisques), équipements et monuments (Wikidata), produit par `scripts/build_ouvertes.py`
- `data/images.js` : photos et logos Wikimedia Commons, produit par `scripts/build_images.py`
- `data/assemblee.js` : groupes politiques de l'Assemblée de Corse, **saisis à la main** d'après isula.corsica (date de relevé dans le fichier)
- `data/geo.js` : contours des communes et intercommunalités (IGN)
- `vendor/leaflet/` : Leaflet 1.9, copie locale ; `archive/municipales-2026/` : ancien site, conservé pour mémoire

## Chaîne de production

| Étape | Script | Où | Fréquence |
|---|---|---|---|
| Export des bases Notion vers `prive/raw.json` | `scripts/export_notion.py` | Actions (`export.yml`) ou poste local | chaque jour à 4 h 47 UTC, si le secret `NOTION_TOKEN` existe |
| Données du site | `scripts/build_data.py --profil public` | idem | après chaque export |
| Pages HTML | `scripts/build_pages.py` | idem | après chaque export |
| Données ouvertes | `scripts/build_ouvertes.py` | Actions (`ouvertes.yml`) | le 1er de chaque mois |
| Exécutifs municipaux vers Notion | `scripts/notion_communes.py` | Actions (`ouvertes.yml`) | idem, si `NOTION_TOKEN` existe |
| Photos | `scripts/build_images.py` | Actions (`images.yml`) | à la demande |
| Tests | `tests/` | Actions (`tests.yml`) | à chaque envoi |

En local :

```bash
NOTION_TOKEN=... python3 scripts/export_notion.py          # écrit prive/raw.json
python3 scripts/build_data.py --profil public
python3 scripts/build_pages.py
python3 -m http.server 8000                                 # puis http://localhost:8000
```

Le jeton est celui d'une intégration Notion connectée aux neuf bases (menu ••• de chaque base > Connexions).

## Deux profils, une règle

- `--profil complet` : tout ce que contient la base, justice et faits divers compris. **Ne jamais le déposer sur un hébergement public.** Les Actions ne le construisent jamais.
- `--profil public` : liste blanche. Les articles de presse sont tous publiés, justice et faits divers compris (le journal a choisi de publier ; la fiche ne reprend que titre, source, date et lien). Restent écartés : dossiers, faits et agenda des rubriques Justice et Faits divers, affaires judiciaires, rôles procéduraux, personnes sans qualité publique et notes internes. Un champ ajouté dans Notion n'apparaît dans aucun profil tant qu'il n'est pas nommé dans `CHAMPS_PUBLICS`.

Règles éditoriales appliquées au build :

- l'état de traitement des articles reste public : un titre jamais lu est affiché « Titre seul, non lu » ;
- une note n'est publiée que si elle est marquée « Publiable » **et** à l'état « Livrée » (relue par une seconde personne) ;
- aucune consigne d'expression orale (prononciation, formulation, lancement) n'est reprise : les champs correspondants ne sont pas exportés et les sections de notes qui en traitent sont retirées.

## Tests

```bash
npm install --no-save axe-core@4.10.2
pip install pytest playwright && python -m playwright install chromium
python -m pytest -q tests/
```

`tests/test_export_notion.py` vérifie que le convertisseur Notion produit ce que lit `build_data.py`. `tests/test_site.py` charge chaque page en largeur ordinateur et téléphone : aucune erreur JavaScript, du contenu, pas de défilement horizontal, aucun défaut d'accessibilité grave ou critique (axe-core).

## Limites connues

- Le contenu est rendu dans le navigateur : sans JavaScript, la page affiche un message, et les fiches ne sont pas indexées par les moteurs de recherche.
- Chaque page charge l'ensemble des données (environ 200 Ko compressés).
- Les fonds IGN demandent un accès Internet ; sans lui, la carte reste utilisable sur fond gris.
- Les groupes de l'Assemblée de Corse sont à mettre à jour à la main.
- Les données ne sont pas toutes vérifiées : la page « Méthode et limites » dit, base par base, ce qui l'est.

## Publication

Le dépôt est public. Avant toute mise en ligne sur GitHub Pages, il faut une décision explicite de publication et vérifier que seul le profil `public` est déposé.
