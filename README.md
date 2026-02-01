# Municipales Corse 2026 – carte interactive (Leaflet + Plan IGN v2)

## Contenu
- `index.html` : page principale (carte + volet latéral)
- `candidat.html` : fiche candidat (page dédiée)
- `app.js` : logique (filtres, liste, interactions carte)
- `styles.css` : style (inspiré MyMaps)
- `data/communes.geojson` : polygones des communes (GeoJSON)
- `data/communes_meta.json` : infos communes (habitants, EPCI, maire sortant, candidats…)
- `data/candidats.json` : candidats (liens vers fiches)
- `assets/france3corse-viastella.png` : logo

## Mise en ligne sur GitHub Pages
1. Copier **tous** les fichiers/dossiers à la racine du dépôt (ou dans `/docs` si ton Pages pointe sur `/docs`).
2. Commit + push.
3. Vérifier dans **Settings → Pages** la source (branch + dossier).
4. L’URL de ton site correspond à l’URL GitHub Pages habituelle.

## Notes
- Fond de carte: WMTS Plan IGN v2 via `data.geopf.fr`.
- Ne pas supprimer l’attribution en bas à droite (obligation d’usage).
