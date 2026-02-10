// Carte Leaflet + chargement KMZ (via omnivore)
const map = L.map('map', { zoomControl: true }).setView([42.2, 9.0], 9);

// Fond IGN Plan v2
L.tileLayer('https://wxs.ign.fr/essentiels/geoportail/wmts?layer=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&style=normal&tilematrixset=PM&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/jpeg&TileMatrix={z}&TileRow={y}&TileCol={x}', {
  attribution: '© IGN'
}).addTo(map);

// Charger le KMZ placé dans data/Drones.kmz
omnivore.kmz('data/Drones.kmz')
  .on('ready', function() {
    map.fitBounds(this.getBounds(), { padding: [40,40] });
  })
  .on('error', function(e){
    console.error('Erreur KMZ', e);
  })
  .addTo(map);

// Tooltip léger au survol
map.on('layeradd', function(e){
  if (e.layer && e.layer.bindTooltip) {
    e.layer.bindTooltip(function(layer){
      const p = layer.feature?.properties || {};
      return `<strong>${p.name || 'Drone'}</strong><br/>${p.description || ''}`;
    }, { sticky:true, direction:'top' });
  }
});
