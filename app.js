/* global L */
const DATA = {
  communes: "data/communes.geojson",
  communesMeta: "data/communes_meta.json",
  candidats: "data/candidats.json",
  epci: "data/epci.geojson"
};

const state = {
  view: "commune", // commune | candidat
  hasAutoFit: false,
  lastFittedEpci: "",
  dept: "",
  epci: "",
  commune: "",
  q: "",
  communesMeta: [],
  communesGeo: null,
  epciGeo: null,
  candidats: [],
  selectedCommuneId: null
};

/* --- Responsive panel (mobile) --- */
const mqMobile = window.matchMedia("(max-width: 900px)");
function setMobileMode(){
  if (mqMobile.matches){
    // default: collapsed to favor map
    if (!document.body.classList.contains("mobile-ready")){
      document.body.classList.add("mobile-ready","panel-collapsed");
    }
  } else {
    document.body.classList.remove("mobile-ready","panel-collapsed","panel-open");
  }
}
function ensurePanelToggle(){
  if (document.getElementById("panelToggle")) return;
  const btn = document.createElement("button");
  btn.id = "panelToggle";
  btn.type = "button";
  btn.className = "panel-toggle";
  btn.setAttribute("aria-label","Afficher/Masquer le panneau");
  btn.textContent = "Liste";
  document.body.appendChild(btn);

  btn.addEventListener("click", () => {
    const collapsed = document.body.classList.toggle("panel-collapsed");
    document.body.classList.toggle("panel-open", !collapsed);
    if (!collapsed){
      document.body.classList.remove("filters-hidden");
    }
    btn.textContent = collapsed ? "Liste" : "Carte";
    window.setTimeout(() => { try{ map && map.invalidateSize(true); }catch(e){} }, 260);
  });

  const mapEl = document.getElementById("map");
  if (mapEl){
    mapEl.addEventListener("click", () => {
      if (mqMobile.matches && !document.body.classList.contains("panel-collapsed")){
        document.body.classList.add("panel-collapsed");
        document.body.classList.remove("panel-open");
        btn.textContent = "Liste";
        window.setTimeout(() => { try{ map && map.invalidateSize(true); }catch(e){} }, 260);
      }
    });
  }
}


/* --- Desktop sidebar toggle --- */
function ensureDesktopSidebarToggle(){
  const topbar = document.querySelector(".topbar");
  if (!topbar) return;
  if (document.getElementById("sidebarToggle")) return;

  const btn = document.createElement("button");
  btn.id = "sidebarToggle";
  btn.type = "button";
  btn.className = "sidebar-toggle";
  btn.setAttribute("aria-label","Afficher/Masquer le panneau");
  btn.textContent = "Masquer";
  topbar.appendChild(btn);

  const applyLabel = () => {
    btn.textContent = document.body.classList.contains("sidebar-collapsed") ? "Afficher" : "Masquer";
  };
  applyLabel();

  btn.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-collapsed");
    applyLabel();
    window.setTimeout(() => { try{ map && map.invalidateSize(true); }catch(e){} }, 260);
  });

  window.addEventListener("resize", applyLabel);
}



const $ = (id) => document.getElementById(id);

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}

function normalize(s){
  return (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/’/g,"'").trim();
}


function epciShortName(epci){
  const s = (epci || "").trim();
  const n = normalize(s);
  if (n.includes("ajaccio")) return "CAPA";
  if (n.includes("bastia")) return "CAB";
  return s
    .replace(/^Communauté\s+d['’]agglomération\s+du\s+/i, "")
    .replace(/^Communauté\s+d['’]agglomération\s+de\s+/i, "")
    .replace(/^Communauté\s+de\s+communes\s+du\s+/i, "")
    .replace(/^Communauté\s+de\s+communes\s+de\s+/i, "")
    .replace(/^Communauté\s+de\s+communes\s+des\s+/i, "")
    .replace(/^Communauté\s+de\s+communes\s+d['’]\s*/i, "")
    .trim();
}

function hashColor(str){
  const s = normalize(str);
  let h = 0;
  for (let i=0;i<s.length;i++) h = ((h<<5)-h) + s.charCodeAt(i), h|=0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 65% 55%)`;
}

async function loadJson(url){
  const r = await fetch(url, {cache:"no-cache"});
  if (!r.ok) throw new Error(`fetch ${url} -> ${r.status}`);
  return r.json();
}

function splitCandidates(s){
  if (!s) return [];
  return String(s).split(",").map(x => x.trim()).filter(Boolean);
}

/* --- MAP --- */
let map, communesLayer, epciLayer, labelsLayer, epciLabelsLayer, ignLayer, osmLayer;
// Index pour surbrillance EPCI au survol
let epciLayerIndex = new Map();
let hoveredCommuneLayer = null;
let hoveredEpciKey = "";

function makeIgnLayer(){
  // Template GetTile WMTS (si l'URL évolue côté IGN, c'est ici que ça se modifie)
  // Doc officielle GetTile: https://data.geopf.fr/wmts?... (voir docs Géoplateforme IGN)
  const template = "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0"
    + "&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/jpeg"
    + "&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}";

  const layer = L.tileLayer(template, {
    minZoom: 0,
    maxZoom: 19,
    tileSize: 256,
    attribution: "© IGN – Plan IGN v2"
  });

  // fallback automatique si le fond ne répond pas
  let errs = 0;
  layer.on("tileerror", () => {
    errs++;
    if (errs >= 6 && map.hasLayer(layer)){
      map.removeLayer(layer);
      if (!map.hasLayer(osmLayer)) osmLayer.addTo(map);
      $("mapHint").hidden = false;
    }
  });

  return layer;
}

function initMap(){
  map = L.map("map", { zoomControl: true }).setView([42.15, 9.05], 9);

  osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap"
  });

  ignLayer = makeIgnLayer();
  ignLayer.addTo(map);

  labelsLayer = L.layerGroup().addTo(map);
  epciLabelsLayer = L.layerGroup().addTo(map);
}

function fitToCommune(commId){
  // Zoom à l'échelle de l'EPCI (une seule fois, ensuite l'utilisateur navigue)
  const feat = state.communesGeo.features.find(f => f.properties.id === commId);
  if (!feat) return;
  const epci = feat.properties.epci || "";
  if (state.hasAutoFit) return;

  const epciFeat = state.epciGeo && state.epciGeo.features
    ? state.epciGeo.features.find(f => normalize(f.properties.epci || "") === normalize(epci))
    : null;

  const layer = epciFeat ? L.geoJSON(epciFeat) : L.geoJSON(feat);
  const b = layer.getBounds().pad(0.28);
  map.flyToBounds(b, {padding:[40,40], maxZoom: 10, duration: 0.8});
  state.hasAutoFit = true;
  state.lastFittedEpci = epci;
}

function communeTooltipHtml(p){
  const nom = p.nom || "";
  const dept = p.departement || "";
  const epci = p.epci || "";
  const epciShort = epciShortName(epci);
  const hab = (p.habitants != null && p.habitants !== "") ? Number(p.habitants) : null;
  const habTxt = (hab && !Number.isNaN(hab)) ? `${hab.toLocaleString("fr-FR")} hab.` : "";
  const nb = (p.nb_listes != null && p.nb_listes !== "") ? Number(p.nb_listes) : null;
  const nbTxt = (nb && !Number.isNaN(nb)) ? `${nb} liste${nb>1?"s":""}` : "";
  const line2 = [dept, habTxt].filter(Boolean).join(" • ");
  const line3 = [epciShort, nbTxt].filter(Boolean).join(" • ");
  return `
    <div class="comm-tip">
      <div class="t1">${escapeHtml(nom)}</div>
      ${line2 ? `<div class="t2">${escapeHtml(line2)}</div>` : ""}
      ${line3 ? `<div class="t3">${escapeHtml(line3)}</div>` : ""}
    </div>
  `;
}

function clearHover(){
  if (hoveredCommuneLayer){
    try{
      const f = hoveredCommuneLayer.feature;
      hoveredCommuneLayer.setStyle(communeStyle(f));
    }catch(e){}
    hoveredCommuneLayer = null;
  }
  if (hoveredEpciKey){
    const l = epciLayerIndex.get(hoveredEpciKey);
    if (l){
      const epci = l.feature?.properties?.epci || "";
      l.setStyle(epciStyle({properties:{epci}}));
    }
    hoveredEpciKey = "";
  }
}

function epciStyle(feat){
  const epci = feat.properties.epci || "";
  return {
    color: hashColor(epci),
    weight: 3,
    opacity: 0.95,
    fillColor: hashColor(epci),
    fillOpacity: 0.42
  };
}

function communeStyle(feat){
  const selected = feat.properties.id === state.selectedCommuneId;
  return {
    color: selected ? "#0b57d0" : "#4b5563",
    weight: selected ? 3 : 1,
    opacity: selected ? 0.9 : 0.35,
    fillOpacity: 0
  };
}

function hoverCommune(layer){
  clearHover();
  hoveredCommuneLayer = layer;
  try{
    layer.setStyle({ color:"#0b57d0", weight:3, opacity:0.95 });
    if (layer.bringToFront) layer.bringToFront();
  }catch(e){}

  const epciKey = normalize(layer.feature?.properties?.epci || "");
  const epciLayer = epciLayerIndex.get(epciKey);
  if (epciLayer){
    hoveredEpciKey = epciKey;
    try{
      epciLayer.setStyle({ weight:5, opacity:1, fillOpacity:0.12 });
      if (epciLayer.bringToFront) epciLayer.bringToFront();
    }catch(e){}
  }
}


/* --- EPCI layer --- */
function renderEpci(){
  if (epciLayer) epciLayer.remove();
  epciLayerIndex = new Map();
  epciLayer = L.geoJSON(state.epciGeo, {
    style: epciStyle,
    interactive: false,
    onEachFeature: (feat, layer) => {
      const key = normalize(feat.properties.epci || "");
      if (key) epciLayerIndex.set(key, layer);
    }
  }).addTo(map);
}

/* --- Communes layer --- */
function renderCommunes(){
  if (communesLayer) communesLayer.remove();

  communesLayer = L.geoJSON(state.communesGeo, {
    style: communeStyle,
    onEachFeature: (feat, layer) => {
      // Survol : contour commune + EPCI + infobulle
      layer.bindTooltip(communeTooltipHtml(feat.properties), {
        sticky: true,
        direction: "top",
        className: "comm-tooltip",
        opacity: 0.98
      });
      layer.on("mouseover", () => hoverCommune(layer));
      layer.on("mouseout", () => clearHover());

      layer.on("click", () => {
        clearHover();
        state.selectedCommuneId = feat.properties.id;
        // push into UI selection
        $("communeSelect").value = feat.properties.id;
        state.commune = feat.properties.id;
        update();
        fitToCommune(feat.properties.id);
        if (!mqMobile.matches && document.body.classList.contains('sidebar-collapsed')){
          document.body.classList.remove('sidebar-collapsed');
          const sb=document.getElementById('sidebarToggle'); if(sb) sb.textContent='Masquer';
          window.setTimeout(() => { try{ map && map.invalidateSize(true);}catch(e){} }, 260);
        }
        window.setTimeout(() => {
          const el = document.querySelector(`.card[data-commune='${feat.properties.id}']`);
          if (el) el.scrollIntoView({behavior:'smooth', block:'start'});
        }, 80);
        if (mqMobile.matches){
        document.body.classList.remove("panel-collapsed");
        document.body.classList.add("panel-open");
        const btn=document.getElementById("panelToggle"); if(btn) btn.textContent="Carte";
        window.setTimeout(() => { try{ map && map.invalidateSize(true);}catch(e){} }, 260);
        }
      });
      
    }
  }).addTo(map);
}

/* --- labels --- */
function updateLabels(){
  labelsLayer.clearLayers();
  const z = map.getZoom();
  const bounds = map.getBounds();

  const majorAll = ["ajaccio","bastia","porto-vecchio","calvi","corte"];
  const majorVery = new Set(["ajaccio","bastia"]); // ultra dézoom : seulement les 2 pôles

  if (z <= 7){
    const majors = state.communesMeta
      .filter(c => majorVery.has(normalize(c.nom)))
      .filter(c => c.centroid && c.centroid[0] != null)
      .filter(c => bounds.contains([c.centroid[0], c.centroid[1]]));
    for (const c of majors){
      const icon = L.divIcon({
        className: "comm-label major",
        html: `<div class="lbl-box">${escapeHtml(c.nom)}</div>`,
        iconSize: [1,1]
      });
      L.marker([c.centroid[0], c.centroid[1]], {icon, interactive:false}).addTo(labelsLayer);
    }
    return;
  }

  if (z === 8){
    const majors = state.communesMeta
      .filter(c => majorAll.includes(normalize(c.nom)))
      .filter(c => c.centroid && c.centroid[0] != null)
      .filter(c => bounds.contains([c.centroid[0], c.centroid[1]]));
    for (const c of majors){
      const icon = L.divIcon({
        className: "comm-label major",
        html: `<div class="lbl-box">${escapeHtml(c.nom)}</div>`,
        iconSize: [1,1]
      });
      L.marker([c.centroid[0], c.centroid[1]], {icon, interactive:false}).addTo(labelsLayer);
    }
    return;
  }

  // Strates (plus on zoome, plus on affiche)
  let popMin = 0;
  if (z === 9) popMin = 15000;
  else if (z === 10) popMin = 8000;
  else if (z === 11) popMin = 4000;
  else if (z === 12) popMin = 1500;
  else popMin = 0;

  const maxLabels = (z <= 9) ? 26 : (z === 10 ? 40 : (z === 11 ? 70 : (z === 12 ? 110 : 170)));

  const candidates = state.communesMeta
    .filter(c => (c.habitants || 0) >= popMin)
    .filter(c => c.centroid && c.centroid[0] != null)
    .filter(c => bounds.contains([c.centroid[0], c.centroid[1]]))
    .sort((a,b) => (b.habitants||0) - (a.habitants||0))
    .slice(0, maxLabels);

  for (const c of candidates){
    const isMajor = majorAll.includes(normalize(c.nom));
    const icon = L.divIcon({
      className: `comm-label ${isMajor ? "major" : ""}`,
      html: `<div class="lbl-box">${escapeHtml(c.nom)}</div>`,
      iconSize: [1,1]
    });
    L.marker([c.centroid[0], c.centroid[1]], {icon, interactive:false}).addTo(labelsLayer);
  }
}

function updateEpciLabels(){
  epciLabelsLayer.clearLayers();
  const z = map.getZoom();
  // EPCI visibles surtout à l'échelle "Corse"
  if (z > 9) return;

  const bounds = map.getBounds();
  const onlyMajor = (z <= 7); // très dézoomé : seulement CAPA + CAB

  for (const f of (state.epciGeo?.features || [])){
    const epci = f.properties.epci || "";
    const short = epciShortName(epci);

    if (onlyMajor && !["CAPA","CAB"].includes(short)) continue;

    const layer = L.geoJSON(f);
    const c = layer.getBounds().getCenter();
    if (!bounds.contains(c)) continue;

    const color = hashColor(epci);
    const icon = L.divIcon({
      className: `epci-label ${onlyMajor ? "major" : ""}`,
      html: `<div class="epci-box" style="border-color:${color};color:${color}">${escapeHtml(short)}</div>`,
      iconSize: [1,1]
    });
    L.marker(c, {icon, interactive:false}).addTo(epciLabelsLayer);
  }
}


/* --- UI + Filters --- */

function rebuildEpciOptions(){
  const epciSel = $("epciSelect");
  const current = epciSel.value;
  const epcis = new Set();
  for (const c of state.communesMeta){
    if (state.dept && c.departement !== state.dept) continue;
    if (c.epci) epcis.add(c.epci);
  }
  const list = Array.from(epcis).sort((a,b)=>a.localeCompare(b,"fr"));
  epciSel.innerHTML = `<option value="">Toutes</option>` + list.map(e => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join("");
  if (list.includes(current)) epciSel.value = current;
}

function rebuildCommuneOptions(){
  const sel = $("communeSelect");
  const current = sel.value;
  const communes = state.communesMeta.filter(c => {
    if (state.dept && c.departement !== state.dept) return false;
    if (state.epci && c.epci !== state.epci) return false;
    return true;
  }).sort((a,b)=> (b.habitants||0)-(a.habitants||0));

  sel.innerHTML = `<option value="">Toutes</option>` + communes.map(c => `<option value="${c.id}">${escapeHtml(c.nom)}</option>`).join("");
  if (communes.some(c=>c.id===current)) sel.value = current;
}


function ensureResetButton(){
  const panelHeader = document.querySelector(".panel-header");
  if (!panelHeader) return;
  if (document.getElementById("resetBtn")) return;

  const btn = document.createElement("button");
  btn.id = "resetBtn";
  btn.type = "button";
  btn.className = "reset-btn";
  btn.textContent = "Réinitialiser";
  btn.style.display = "none";
  panelHeader.appendChild(btn);

  const isActive = () => {
    return !!(state.dept || state.epci || state.commune || (state.q && state.q.trim()));
  };
  const updateVisibility = () => {
    btn.style.display = isActive() ? "inline-flex" : "none";
  };
  updateVisibility();

  btn.addEventListener("click", () => {
    state.dept = "";
    state.epci = "";
    state.commune = "";
    state.q = "";
    state.selectedCommuneId = null;
    state.hasAutoFit = false;
    state.lastFittedEpci = "";
    $("deptSelect").value = "";
    $("epciSelect").value = "";
    $("communeSelect").value = "";
    $("searchInput").value = "";
    document.body.classList.remove("filters-hidden");
    update();
  });

  state._updateResetVisibility = updateVisibility;
}

function applyFunnel(){
  // entonnoir: dept -> epci -> commune (uniquement en vue candidat)
  rebuildEpciOptions();
  if (state.view === "candidat"){
    $("communeLabel").style.display = "";
    $("communeSelect").style.display = "";
    rebuildCommuneOptions();
  } else {
    $("communeLabel").style.display = "none";
    $("communeSelect").style.display = "none";
    state.commune = "";
    $("communeSelect").value = "";
  }
}

function makeAutocomplete(q){
  const box = $("autocomplete");
  const query = normalize(q);
  if (!query){
    box.hidden = true;
    box.innerHTML = "";
    return;
  }

  const items = [];

  // communes
  for (const c of state.communesMeta){
    if (normalize(c.nom).includes(query)){
      items.push({type:"commune", label:c.nom, sub:`Commune • ${c.departement}`, id:c.id});
    }
  }
  // candidats
  for (const cand of state.candidats){
    if (normalize(cand.name).includes(query)){
      const com = cand.commune || cand.maire_sortant_de || "";
      items.push({type:"candidat", label:cand.name, sub:`Candidat • ${com}`, id:cand.id, communeName: com});
    }
  }

  const top = items.slice(0, 10);
  if (!top.length){
    box.hidden = true;
    box.innerHTML = "";
    return;
  }

  box.innerHTML = top.map(it => `
    <div class="ac-item" data-type="${it.type}" data-id="${it.id}" data-label="${escapeHtml(it.label)}" data-commune="${escapeHtml(it.communeName||"")}">
      <strong>${escapeHtml(it.label)}</strong>
      <small>${escapeHtml(it.sub)}</small>
    </div>
  `).join("");
  box.hidden = false;

  box.querySelectorAll(".ac-item").forEach(el => {
    el.addEventListener("click", () => {
      const type = el.getAttribute("data-type");
      const id = el.getAttribute("data-id");
      const label = el.getAttribute("data-label") || "";
      $("searchInput").value = label;
      box.hidden = true;

      if (type === "commune"){
        state.view = "commune";
        setViewButtons();
        state.q = "";
        state.commune = id;
        $("deptSelect").value = "";
        state.dept = "";
        $("epciSelect").value = "";
        state.epci = "";
        update();
        fitToCommune(id);
      } else {
        // candidat -> ouvrir fiche candidat
        window.location.href = `candidat.html?id=${encodeURIComponent(id)}`;
      }
    });
  });
}

function setViewButtons(){
  $("btnViewCommune").classList.toggle("active", state.view==="commune");
  $("btnViewCandidat").classList.toggle("active", state.view==="candidat");
  // reset filters that are not relevant
  applyFunnel();
}

/* --- Rendering lists --- */
function candidateBadges({isMaireSortant, isCandidat}){
  const ms = (isMaireSortant === "oui") ? "oui" : (isMaireSortant === "non" ? "non" : "?");
  const ca = (isCandidat === "oui") ? "oui" : (isCandidat === "non" ? "non" : "?");

  const msClass = (ms==="oui") ? "dark" : "light";
  const caClass = (ca==="oui") ? "dark" : (ca==="non" ? "light" : "light");

  return `
    <div class="badges">
      <span class="badge ${msClass}">Maire sortant : ${ms}</span>
      <span class="badge ${caClass}">Candidat : ${ca}</span>
    </div>`;
}

function renderCommuneCard(c){
  const expanded = (c.id === state.selectedCommuneId);
  const candNames = splitCandidates(c.candidats);
  const candLines = candNames.map(n => {
    const cand = state.candidats.find(x =>
      normalize(x.name) === normalize(n) &&
      normalize((x.commune || x.maire_sortant_de || "")) === normalize(c.nom)
    );
    if (cand){
      return `<div>• <a href="candidat.html?id=${encodeURIComponent(cand.id)}" class="cand-link" onclick="event.stopPropagation()">${escapeHtml(n)}</a></div>`;
    }
    return `<div>• ${escapeHtml(n)}</div>`;
  }).join("");

  const img = c.photo_asset ? c.photo_asset : "";
  const imgRemote = c.photo_url || "";
  const imgHtml = (img || imgRemote) ? `
    <img class="thumb" src="${escapeHtml(img)}" alt="${escapeHtml(c.nom)}"
         onerror="this.onerror=null; ${imgRemote ? `this.src='${escapeHtml(imgRemote)}';` : "this.classList.add('hidden');"}">`
    : `<div class="thumb"></div>`;

  const ficheUrl = `commune.html?id=${encodeURIComponent(c.id)}`;

  return `
  <div class="card commune-card ${expanded ? "expanded" : ""}" data-commune="${escapeHtml(c.id)}" aria-expanded="${expanded}">
    <div class="comm-head">
      ${imgHtml}
      <div>
        <div class="card-title">${escapeHtml(c.nom)}</div>
        <div class="card-sub">${escapeHtml(c.departement)} • ${escapeHtml(c.epci || "")}</div>
      </div>
    </div>

    <div class="badges">
      <span class="badge">Habitants : ${c.habitants ?? "—"}</span>
      <span class="badge">Listes : ${c.nb_listes ?? "—"}</span>
    </div>

    <div class="comm-details" ${expanded ? "" : "hidden"}>
      <div class="details">
        <div><span class="muted">Maire sortant :</span> ${escapeHtml(c.maire_sortant || "—")}</div>
        <div style="margin-top:8px"><span class="muted">Candidats déclarés :</span></div>
        ${candLines || `<div class="muted">—</div>`}
        <div style="margin-top:10px">
          <a class="comm-link" href="${ficheUrl}">Ouvrir la fiche commune</a>
        </div>
      </div>
    </div>
  </div>`;
}

function renderCandidateCard(cand){
  const com = cand.commune || cand.maire_sortant_de || "—";
  const img = cand.photo_asset || "";
  const imgRemote = cand.photo_url || "";
  const imgHtml = (img || imgRemote) ? `
    <img class="thumb" src="${escapeHtml(img)}" alt="${escapeHtml(cand.name)}"
         onerror="this.onerror=null; ${imgRemote ? `this.src='${escapeHtml(imgRemote)}';` : "this.classList.add('hidden');"}">`
    : `<div class="thumb"></div>`;

  const ms = cand.maire_sortant_de ? "oui" : "non";
  // on ne sait pas toujours s'il est candidat si l'info manque -> "?"
  const isCandidat = (cand.commune ? "oui" : (cand.maire_sortant_de ? "oui" : "?"));
  return `
  <div class="card" data-cand="${escapeHtml(cand.id)}">
    <div class="comm-head">
      ${imgHtml}
      <div>
        <div class="card-title">${escapeHtml(cand.name)}</div>
        <div class="card-sub">${escapeHtml(com)}</div>
      </div>
    </div>
    ${candidateBadges({isMaireSortant: ms, isCandidat})}
    <div class="details">
      ${cand.articles ? `<div><span class="muted">Articles :</span> ${escapeHtml(cand.articles)}</div>` : `<div class="muted">—</div>`}
      <div style="margin-top:10px">
        <a href="candidat.html?id=${encodeURIComponent(cand.id)}">Voir la fiche</a>
      </div>
    </div>
  </div>`;
}

function updateKPI(listCommunes, listCands){
  const x = listCommunes.length;
  const y = listCands.length;
  $("kpiLine").textContent = (state.view==="candidat")
    ? `${x} communes • ${y} candidats et maires sortants affichés`
    : `${x} communes • ${y} candidats affichés`;
}

/* --- Core update --- */
function update(){
  // update map styles
  renderCommunes();
  updateLabels();

  // apply filters
  const listCommunes = state.communesMeta.filter(c => {
    if (state.dept && c.departement !== state.dept) return false;
    if (state.epci && c.epci !== state.epci) return false;
    if (state.view === "candidat" && state.commune && c.id !== state.commune) return false;
    // search filter (commune name)
    if (state.q){
      const q = normalize(state.q);
      // if query matches commune or one candidate
      const matchComm = normalize(c.nom).includes(q);
      const matchCand = normalize(c.candidats).includes(q);
      if (!matchComm && !matchCand) return false;
    }
    return true;
  });

  // Candidate list filtered (for KPI + view)
  const communeNames = new Set(listCommunes.map(c => normalize(c.nom)));
  const listCands = state.candidats.filter(cd => {
    const com = normalize(cd.commune || cd.maire_sortant_de || "");
    if (state.dept){
      // derive dept via commune match (approx)
      const comObj = state.communesMeta.find(x => normalize(x.nom) === com);
      if (!comObj || comObj.departement !== state.dept) return false;
    }
    if (state.epci){
      const comObj = state.communesMeta.find(x => normalize(x.nom) === com);
      if (!comObj || comObj.epci !== state.epci) return false;
    }
    if (state.view === "candidat" && state.commune){
      const comObj = state.communesMeta.find(x => normalize(x.nom) === com);
      if (!comObj || comObj.id !== state.commune) return false;
    }
    if (state.view === "commune"){
      // in commune view, keep candidates attached to filtered communes only
      if (com && !communeNames.has(com)) return false;
    }
    if (state.q){
      const q = normalize(state.q);
      if (!normalize(cd.name).includes(q) && !com.includes(q)) return false;
    }
    return true;
  });

  updateKPI(listCommunes, listCands);
  if (typeof state._updateResetVisibility === 'function') state._updateResetVisibility();

  // sort & render list
  const listEl = $("list");
  if (state.view === "commune"){
    const html = listCommunes
      .sort((a,b)=> (b.habitants||0)-(a.habitants||0))
      .map(renderCommuneCard).join("");
    listEl.innerHTML = html || `<div class="muted">Aucun résultat.</div>`;
    // expand/click behaviour
    listEl.querySelectorAll(".card[data-commune]").forEach(card => {
      card.addEventListener("click", () => {
        const id = card.getAttribute("data-commune");
        state.selectedCommuneId = id;
        state.commune = id;
        $("communeSelect").value = id;
        renderCommunes();
        fitToCommune(id);
        if (mqMobile.matches){
          document.body.classList.remove("panel-collapsed");
          document.body.classList.add("panel-open");
          const btn=document.getElementById("panelToggle"); if(btn) btn.textContent="Carte";
          window.setTimeout(() => { try{ map && map.invalidateSize(true);}catch(e){} }, 260);
        }
      });

    });
  } else {
    // view candidat: group by commune habitants desc, maire sortant first (approx), then alpha
    const comPop = new Map(state.communesMeta.map(c => [normalize(c.nom), c.habitants||0]));
    const comId = new Map(state.communesMeta.map(c => [normalize(c.nom), c.id]));
    const sorted = listCands.slice().sort((a,b)=> {
      const ca = normalize(a.commune || a.maire_sortant_de || "");
      const cb = normalize(b.commune || b.maire_sortant_de || "");
      const pa = comPop.get(ca) || 0;
      const pb = comPop.get(cb) || 0;
      if (pb !== pa) return pb - pa;
      const msa = a.maire_sortant_de ? 0 : 1;
      const msb = b.maire_sortant_de ? 0 : 1;
      if (msa !== msb) return msa - msb;
      // alpha by commune then name
      const cc = (a.commune || a.maire_sortant_de || "").localeCompare((b.commune || b.maire_sortant_de || ""), "fr");
      if (cc !== 0) return cc;
      return a.name.localeCompare(b.name, "fr");
    });

    listEl.innerHTML = sorted.map(renderCandidateCard).join("") || `<div class="muted">Aucun résultat.</div>`;

    // clicking candidate card -> fiche
    listEl.querySelectorAll(".card[data-cand]").forEach(card => {
      card.addEventListener("click", (e) => {
        e.preventDefault();
        const id = card.getAttribute("data-cand");
        window.location.href = `candidat.html?id=${encodeURIComponent(id)}`;
      });
    });
  }

  // funnel options update (avoid stale)
  applyFunnel();
}


/* --- Hide filters header on scroll down (sidebar list) --- */
let lastListScrollTop = 0;

function setupPanelSwipe(){
  const header = document.querySelector(".panel-header");
  if (!header) return;
  let startY = null;
  let startX = null;
  header.addEventListener("touchstart", (e) => {
    if (!mqMobile.matches) return;
    const t = e.touches[0];
    startY = t.clientY;
    startX = t.clientX;
  }, {passive:true});

  header.addEventListener("touchend", (e) => {
    if (!mqMobile.matches) return;
    if (startY == null) return;
    const t = e.changedTouches[0];
    const dy = t.clientY - startY;
    const dx = t.clientX - startX;
    startY = null; startX = null;
    if (Math.abs(dx) > Math.abs(dy)) return;
    const btn = document.getElementById("panelToggle");
    if (!btn) return;

    if (dy < -40){
      document.body.classList.remove("panel-collapsed");
      document.body.classList.add("panel-open");
      btn.textContent = "Carte";
      window.setTimeout(() => { try{ map && map.invalidateSize(true);}catch(e){} }, 260);
    } else if (dy > 50){
      document.body.classList.add("panel-collapsed");
      document.body.classList.remove("panel-open");
      btn.textContent = "Liste";
      window.setTimeout(() => { try{ map && map.invalidateSize(true);}catch(e){} }, 260);
    }
  }, {passive:true});
}

function setupHeaderAutoHide(){
  const panel = document.querySelector(".panel");
  const panelHeader = document.querySelector(".panel-header");
  const listEl = document.getElementById("list");
  if (!panel || !panelHeader || !listEl) return;

  // Petit bouton de rappel (quand les filtres sont masqués)
  let reveal = document.getElementById("filtersRevealBtn");
  if (!reveal){
    reveal = document.createElement("button");
    reveal.id = "filtersRevealBtn";
    reveal.type = "button";
    reveal.className = "filters-reveal";
    reveal.setAttribute("aria-label","Réafficher la recherche et les filtres");
    reveal.innerHTML = "🔎&nbsp;Filtres";
    panel.insertBefore(reveal, panelHeader);
    reveal.addEventListener("click", () => {
      document.body.classList.remove("filters-hidden");
      try{
        const si = document.getElementById("searchInput");
        if (si) si.focus({preventScroll:true});
      }catch(e){}
    });
  }

  function updateHeaderH(){
    const h = panelHeader.getBoundingClientRect().height;
    document.documentElement.style.setProperty("--filtersH", `${Math.round(h)}px`);
  }
  updateHeaderH();
  window.addEventListener("resize", updateHeaderH);

  listEl.addEventListener("scroll", () => {
    const st = listEl.scrollTop;
    const goingDown = st > lastListScrollTop;
    lastListScrollTop = st;

    if (st < 30){
      document.body.classList.remove("filters-hidden");
      return;
    }
    if (goingDown){
      document.body.classList.add("filters-hidden");
    } else {
      document.body.classList.remove("filters-hidden");
    }
  }, {passive:true});
}


/* --- boot --- */
async function boot(){
  initMap();

  setMobileMode();
  ensurePanelToggle();
  ensureDesktopSidebarToggle();
  ensureResetButton();
  setupHeaderAutoHide();
  setupPanelSwipe();
  mqMobile.addEventListener("change", () => {
    setMobileMode();
    const btn = document.getElementById("panelToggle");
    if (btn){
      btn.textContent = document.body.classList.contains("panel-collapsed") ? "Liste" : "Carte";
      window.setTimeout(() => { try{ map && map.invalidateSize(true); }catch(e){} }, 260);
    }
  });

  try{
    const [meta, communesGeo, epciGeo, candidats] = await Promise.all([
      loadJson(DATA.communesMeta),
      loadJson(DATA.communes),
      loadJson(DATA.epci),
      loadJson(DATA.candidats)
    ]);
    state.communesMeta = meta;
    state.communesGeo = communesGeo;
    state.epciGeo = epciGeo;
    state.candidats = candidats;

    // pré-sélection via URL
    const url = new URL(window.location.href);
    const commIdParam = url.searchParams.get("communeId") || "";
    if (commIdParam){
      state.selectedCommuneId = commIdParam;
      state.commune = commIdParam;
    }

    // options EPCIs
    rebuildEpciOptions();

    renderEpci();
    renderCommunes();
    updateLabels();
    updateEpciLabels();
    update();

    map.on("zoomend moveend", () => { updateLabels(); updateEpciLabels(); });

  } catch(err){
    console.error(err);
    $("list").innerHTML = `<div class="muted">Erreur de chargement des données.</div>`;
  }

  // events
  $("btnViewCommune").addEventListener("click", () => { state.view="commune"; setViewButtons(); update(); });
  $("btnViewCandidat").addEventListener("click", () => { state.view="candidat"; setViewButtons(); update(); });

  $("deptSelect").addEventListener("change", (e) => { state.dept = e.target.value; state.epci=""; $("epciSelect").value=""; state.commune=""; $("communeSelect").value=""; update(); });
  $("epciSelect").addEventListener("change", (e) => { state.epci = e.target.value; state.commune=""; $("communeSelect").value=""; update(); });
  $("communeSelect").addEventListener("change", (e) => { state.commune = e.target.value; state.selectedCommuneId = state.commune || null; update(); if (state.commune) fitToCommune(state.commune); });

  $("searchInput").addEventListener("input", (e) => { state.q = e.target.value; makeAutocomplete(e.target.value); update(); });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrap")) {
      $("autocomplete").hidden = true;
    }
  });
}

boot();
