/* global L, JSZip, toGeoJSON */

const DATA = {
  kmzCandidates: ["data/Drones.kmz", "data/drones.kmz"]
};

const state = {
  q: "",
  year: "",
  mat: "",
  filtersHidden: false,
  items: [],          // { id, name, date, lieux, duree, mat, desc, year, latlng }
  markers: new Map(), // id -> marker
  layer: null
};

function $(id){ return document.getElementById(id); }

function norm(s){
  return (s || "")
    .toString()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseYear(dateStr){
  const m = (dateStr || "").match(/(19\d{2}|20\d{2})/);
  return m ? m[1] : "";
}

function buildIgnLayer(map){
  const template =
    "https://data.geopf.fr/wmts?" +
    "SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0" +
    "&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/jpeg" +
    "&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}";

  const ign = L.tileLayer(template, {
    minZoom: 0,
    maxZoom: 19,
    tileSize: 256,
    attribution: "© IGN – Plan IGN v2"
  });

  const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap"
  });

  let errs = 0;
  ign.on("tileerror", () => {
    errs++;
    if (errs >= 6 && map.hasLayer(ign)){
      map.removeLayer(ign);
      if (!map.hasLayer(osm)) osm.addTo(map);
      $("mapHint").hidden = false;
    }
  });

  ign.addTo(map);
  return { ign, osm };
}

async function fetchFirstAvailable(urls){
  let lastErr = null;
  for (const url of urls){
    try{
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return { url, buf: await res.arrayBuffer() };
    }catch(e){
      lastErr = e;
    }
  }
  throw lastErr || new Error("Impossible de charger le KMZ.");
}

async function loadKmzItems(){
  const { url, buf } = await fetchFirstAvailable(DATA.kmzCandidates);
  const zip = await JSZip.loadAsync(buf);

  const kmlName = Object.keys(zip.files).find(n => n.toLowerCase().endsWith(".kml")) || "doc.kml";
  const kmlText = await zip.file(kmlName).async("text");

  let iconUrl = null;
  const iconName = Object.keys(zip.files).find(n => n.toLowerCase().endsWith(".png") || n.toLowerCase().endsWith(".jpg"));
  if (iconName){
    const blob = await zip.file(iconName).async("blob");
    iconUrl = URL.createObjectURL(blob);
  }

  const dom = new DOMParser().parseFromString(kmlText, "text/xml");
  const geo = toGeoJSON.kml(dom);

  const items = [];
  let idx = 0;

  for (const f of (geo.features || [])){
    const geom = f.geometry;
    if (!geom) continue;

    let latlng = null;
    if (geom.type === "Point" && Array.isArray(geom.coordinates)){
      const [lon, lat] = geom.coordinates;
      if (Number.isFinite(lat) && Number.isFinite(lon)) latlng = [lat, lon];
    } else {
      continue;
    }

    const p = f.properties || {};
    const name = (p.name || p.Name || "").toString().trim() || "Sans titre";
    const desc = (p.description || p.Description || "").toString().trim();

    const date = (p["Date (diffusion)"] || p["Date"] || "").toString().trim();
    const lieux = (p["Lieux"] || p["Lieu"] || "").toString().trim();
    const duree = (p["Durée / Pages"] || p["Duree / Pages"] || p["Durée"] || "").toString().trim();
    const mat = (p["Matériel"] || p["Materiel"] || "").toString().trim();

    items.push({
      id: `d${idx++}`,
      name, desc, date, lieux, duree, mat,
      year: parseYear(date),
      latlng
    });
  }

  return { items, iconUrl, sourceUrl: url };
}

function buildOptions(items){
  const years = Array.from(new Set(items.map(x => x.year).filter(Boolean))).sort().reverse();
  const yearSel = $("year");
  for (const y of years){
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    yearSel.appendChild(opt);
  }

  const mats = new Set();
  for (const it of items){
    const s = it.mat || "";
    s.split(",").map(x => x.trim()).filter(Boolean).forEach(v => mats.add(v));
  }
  const matSel = $("mat");
  for (const m of Array.from(mats).sort((a,b)=>a.localeCompare(b, "fr", { sensitivity:"base" }))){
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    matSel.appendChild(opt);
  }
}

function matchItem(it){
  if (state.year && it.year !== state.year) return false;
  if (state.mat){
    const mats = (it.mat || "").split(",").map(x=>x.trim());
    if (!mats.includes(state.mat)) return false;
  }
  const q = norm(state.q);
  if (!q) return true;
  const hay = norm([it.name, it.lieux, it.date, it.mat, stripHtml(it.desc)].join(" "));
  return hay.includes(q);
}

function renderKpis(filteredCount, totalCount){
  $("kpiLine").textContent = `${totalCount} plan(s) drone • ${filteredCount} affiché(s)`;
  $("countPill").textContent = `${filteredCount}/${totalCount}`;
}

function escapeHtml(s){
  return (s || "").toString()
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function stripHtml(s){
  return (s || "").toString().replace(/<[^>]*>/g, " ");
}

function cardHtml(it){
  const bits = [];
  if (it.date) bits.push(it.date);
  if (it.lieux) bits.push(it.lieux);
  const sub = bits.join(" • ");
  return `
    <div class="card" data-id="${it.id}">
      <div class="card-title">${escapeHtml(it.name)}</div>
      <div class="card-sub">${escapeHtml(sub || "—")}</div>
    </div>
  `;
}

function buildPopup(it){
  const rows = [];
  if (it.date) rows.push(`<div><strong>Date :</strong> ${escapeHtml(it.date)}</div>`);
  if (it.lieux) rows.push(`<div><strong>Lieu :</strong> ${escapeHtml(it.lieux)}</div>`);
  if (it.duree) rows.push(`<div><strong>Durée :</strong> ${escapeHtml(it.duree)}</div>`);
  if (it.mat) rows.push(`<div><strong>Matériel :</strong> ${escapeHtml(it.mat)}</div>`);
  if (it.desc){
    rows.push(`<div style="margin-top:8px;">${it.desc}</div>`);
  }
  return `<div style="min-width:240px">${rows.join("")}</div>`;
}

function clearLayer(){
  if (state.layer){
    state.layer.remove();
    state.layer = null;
  }
  state.markers.clear();
}

function renderMarkers(map, iconUrl){
  clearLayer();

  const icon = iconUrl ? L.icon({
    iconUrl,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -26]
  }) : null;

  const layer = L.layerGroup();
  state.layer = layer;

  for (const it of state.items){
    const m = L.marker(it.latlng, icon ? { icon } : undefined);
    m.bindPopup(buildPopup(it), { maxWidth: 420 });
    m.bindTooltip(`<strong>${escapeHtml(it.name)}</strong>`, { sticky: true, direction: "top", opacity: 0.95 });
    m.on("click", () => selectItem(it.id, map));
    state.markers.set(it.id, m);
    layer.addLayer(m);
  }
  layer.addTo(map);
}

function applyFilters(map){
  const filtered = state.items.filter(matchItem);

  $("results").innerHTML =
    filtered.map(cardHtml).join("") ||
    `<div class="muted" style="padding:12px">Aucun résultat.</div>`;

  for (const it of state.items){
    const m = state.markers.get(it.id);
    if (!m) continue;
    if (filtered.includes(it)){
      if (!state.layer.hasLayer(m)) state.layer.addLayer(m);
    } else {
      if (state.layer.hasLayer(m)) state.layer.removeLayer(m);
    }
  }

  renderKpis(filtered.length, state.items.length);
}

function selectItem(id, map){
  const it = state.items.find(x => x.id === id);
  if (!it) return;
  const m = state.markers.get(id);
  if (!m) return;

  map.flyTo(it.latlng, Math.max(map.getZoom(), 12), { animate: true, duration: 0.6 });
  m.openPopup();
}

function setupListClicks(map){
  $("results").addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (!card) return;
    selectItem(card.getAttribute("data-id"), map);
  });
}

function setupAutocomplete(){
  const ac = $("ac");
  const q = $("q");

  function close(){ ac.hidden = true; ac.innerHTML = ""; }
  function open(items){
    if (!items.length){ close(); return; }
    ac.hidden = false;
    ac.innerHTML = items.map(it => {
      const label = it.lieux ? `${escapeHtml(it.name)} <small>${escapeHtml(it.lieux)}</small>` : escapeHtml(it.name);
      return `<div class="ac-item" data-id="${it.id}">${label}</div>`;
    }).join("");
  }

  q.addEventListener("input", () => {
    state.q = q.value.trim();
    const nq = norm(state.q);
    if (nq.length < 2){ close(); applyFilters(window.__map); return; }

    const picks = state.items
      .filter(it => norm(it.name + " " + it.lieux + " " + it.date).includes(nq))
      .slice(0, 8);

    open(picks);
    applyFilters(window.__map);
  });

  document.addEventListener("click", (e) => {
    if (!ac.contains(e.target) && e.target !== q) close();
  });

  ac.addEventListener("click", (e) => {
    const item = e.target.closest(".ac-item");
    if (!item) return;
    const id = item.getAttribute("data-id");
    const it = state.items.find(x => x.id === id);
    if (it){
      q.value = it.name;
      state.q = it.name;
      close();
      applyFilters(window.__map);
      selectItem(id, window.__map);
    }
  });
}

function setupFilters(map){
  const year = $("year");
  const mat = $("mat");

  year.addEventListener("change", () => { state.year = year.value; applyFilters(map); });
  mat.addEventListener("change", () => { state.mat = mat.value; applyFilters(map); });

  $("btnReset").addEventListener("click", () => {
    state.q = ""; state.year = ""; state.mat = "";
    $("q").value = ""; year.value = ""; mat.value = "";
    applyFilters(map);
  });

  $("btnFilters").addEventListener("click", () => {
    state.filtersHidden = !state.filtersHidden;
    document.body.classList.toggle("filters-hidden", state.filtersHidden);
    $("btnFilters").textContent = state.filtersHidden ? "Afficher filtres" : "Masquer filtres";
    $("btnFilters").setAttribute("aria-expanded", String(!state.filtersHidden));
  });

  const list = $("results");
  list.addEventListener("scroll", () => {
    if (list.scrollTop > 40 && !state.filtersHidden){
      state.filtersHidden = true;
      document.body.classList.add("filters-hidden");
      $("btnFilters").textContent = "Afficher filtres";
      $("btnFilters").setAttribute("aria-expanded", "false");
    }
  });
}

function applyFiltersHiddenCss(){
  const style = document.createElement("style");
  style.textContent = `
    body.filters-hidden .panel-header label,
    body.filters-hidden .panel-header .search-wrap,
    body.filters-hidden .panel-header select{
      display:none !important;
    }
    body.filters-hidden .panel-header{padding-bottom:8px;}
  `;
  document.head.appendChild(style);
}

async function boot(){
  applyFiltersHiddenCss();

  const map = L.map("map", { zoomControl: true }).setView([42.2, 9.0], 9);
  window.__map = map;
  buildIgnLayer(map);

  try{
    const { items, iconUrl, sourceUrl } = await loadKmzItems();
    state.items = items;

    buildOptions(items);
    renderMarkers(map, iconUrl);

    const ll = items.map(x => x.latlng);
    if (ll.length){
      map.fitBounds(L.latLngBounds(ll), { padding: [40,40] });
    }

    $("loadError").hidden = true;
    $("loadError").textContent = "";

    renderKpis(items.length, items.length);
    setupListClicks(map);
    setupAutocomplete();
    setupFilters(map);
    applyFilters(map);

    console.log("[DRONES] KMZ chargé depuis", sourceUrl, "items:", items.length);
  }catch(err){
    console.error(err);
    $("loadError").hidden = false;
    $("loadError").textContent =
      "Erreur de chargement des données (KMZ). Vérifie que le fichier est bien présent dans /data sous le nom “Drones.kmz” et qu’il est bien commité sur GitHub. " +
      "Détail : " + (err?.message || err);
    $("kpiLine").textContent = "Impossible de charger les données.";
    $("countPill").textContent = "0";
  }
}

boot();
