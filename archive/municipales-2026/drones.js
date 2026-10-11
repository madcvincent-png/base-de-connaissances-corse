/* Drones — chargement GeoJSON (centroïdes communes uniquement)
   NOTE: ce fichier ne place que les entrées dont le champ Lieux/Titre correspond à une commune corse.
   Pour placer 100% des points, il faut un CSV avec Latitude/Longitude OU un géocodage (BAN/Nominatim).
*/

/* global L */
const MAP_CENTER = [42.2, 9.0];
const MAP_ZOOM = 9;

function buildIgnLayer(map){
  const ignUrl =
    "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0" +
    "&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/jpeg" +
    "&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}";

  const ign = L.tileLayer(ignUrl, { minZoom:0, maxZoom:19, tileSize:256, attribution:"© IGN – Plan IGN v2" });
  const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom:19, attribution:"© OpenStreetMap" });

  let errs = 0;
  ign.on("tileerror", () => {
    errs++;
    if (errs >= 6 && map.hasLayer(ign)){
      map.removeLayer(ign);
      if (!map.hasLayer(osm)) osm.addTo(map);
      const hint = document.getElementById("mapHint");
      if (hint) hint.hidden = false;
    }
  });

  ign.addTo(map);
  return { ign, osm };
}

function esc(s){
  return (s ?? "").toString().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

function popupHtml(p){
  const lines = [];
  if (p["Titre"]) lines.push(`<div style="font-weight:800">${esc(p["Titre"])}</div>`);
  if (p["Date (diffusion)"]) lines.push(`<div><strong>Date :</strong> ${esc(p["Date (diffusion)"])}</div>`);
  if (p["Lieux"]) lines.push(`<div><strong>Lieu :</strong> ${esc(p["Lieux"])}</div>`);
  if (p["Durée / Pages"]) lines.push(`<div><strong>Durée :</strong> ${esc(p["Durée / Pages"])}</div>`);
  if (p["Matériel"]) lines.push(`<div><strong>Fichier :</strong> ${esc(p["Matériel"])}</div>`);
  if (p["Commune_match"]) lines.push(`<div style="margin-top:6px;color:#5b6473">Point placé au centroïde de : <strong>${esc(p["Commune_match"])}</strong></div>`);
  return `<div style="min-width:240px">${lines.join("")}</div>`;
}

async function boot(){
  const map = L.map("map", { zoomControl:true }).setView(MAP_CENTER, MAP_ZOOM);
  buildIgnLayer(map);

  const res = await fetch("data/drones_points_centroid_communes.geojson", { cache:"no-store" });
  if (!res.ok) throw new Error(`Erreur chargement GeoJSON: ${res.status}`);
  const gj = await res.json();

  const layer = L.geoJSON(gj, {
    pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius:6, weight:2, fillOpacity:0.7 }),
    onEachFeature: (f, l) => {
      l.bindPopup(popupHtml(f.properties), { maxWidth:420 });
      const title = f.properties?.Titre || f.properties?.Lieux || "Point drone";
      l.bindTooltip(`<strong>${esc(title)}</strong>`, { sticky:true, direction:"top", opacity:0.95 });
    }
  }).addTo(map);

  if (layer.getBounds().isValid()){
    map.fitBounds(layer.getBounds(), { padding:[40,40] });
  }
}

boot().catch(err => {
  console.error(err);
  const box = document.getElementById("loadError");
  if (box){
    box.hidden = false;
    box.textContent = "Impossible de charger les points drones. Vérifie le fichier data/drones_points_centroid_communes.geojson et son chemin.";
  } else {
    alert("Impossible de charger les points drones (voir console).");
  }
});
