/* global L */
const DATA = {
  communes: "data/communes.geojson",
  communesMeta: "data/communes_meta.json",
  candidats: "data/candidats.json",
  epci: "data/epci.geojson"
};

const state = {
  view: "commune", // commune | candidat
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

const $ = (id) => document.getElementById(id);

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}

function normalize(s){
  return (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/’/g,"'").trim();
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
let map, communesLayer, epciLayer, labelsLayer, ignLayer, osmLayer;

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
}

function fitToCommune(commId){
  const feat = state.communesGeo.features.find(f => f.properties.id === commId);
  if (!feat) return;
  const layer = L.geoJSON(feat);
  const b = layer.getBounds().pad(0.35);
  map.fitBounds(b, {padding:[40,40], maxZoom: 11});
}

/* --- EPCI layer --- */
function renderEpci(){
  if (epciLayer) epciLayer.remove();
  epciLayer = L.geoJSON(state.epciGeo, {
    style: (feat) => {
      const epci = feat.properties.epci || "";
      return {
        color: hashColor(epci),
        weight: 3,
        opacity: 0.85,
        fillColor: hashColor(epci),
        fillOpacity: 0.18
      };
    },
    interactive: false
  }).addTo(map);
}

/* --- Communes layer --- */
function renderCommunes(){
  if (communesLayer) communesLayer.remove();

  communesLayer = L.geoJSON(state.communesGeo, {
    style: (feat) => {
      const selected = feat.properties.id === state.selectedCommuneId;
      return {
        color: selected ? "#0b57d0" : "#4b5563",
        weight: selected ? 3 : 1,
        opacity: selected ? 0.9 : 0.35,
        fillOpacity: 0
      };
    },
    onEachFeature: (feat, layer) => {
      layer.on("click", () => {
        state.selectedCommuneId = feat.properties.id;
        // push into UI selection
        $("communeSelect").value = feat.properties.id;
        state.commune = feat.properties.id;
        update();
        fitToCommune(feat.properties.id);
      });
    }
  }).addTo(map);
}

/* --- labels --- */
function updateLabels(){
  labelsLayer.clearLayers();
  const z = map.getZoom();
  const bounds = map.getBounds();

  let popMin = 0;
  if (z <= 8) popMin = 20000;
  else if (z === 9) popMin = 10000;
  else if (z === 10) popMin = 5000;
  else if (z === 11) popMin = 2000;
  else popMin = 0;

  // Eviter l'encombrement: max labels (approx)
  const maxLabels = (z <= 9) ? 30 : (z <= 11 ? 70 : 140);

  const candidates = state.communesMeta
    .filter(c => (c.habitants || 0) >= popMin)
    .filter(c => c.centroid && c.centroid[0] != null)
    .filter(c => bounds.contains([c.centroid[0], c.centroid[1]]))
    .sort((a,b) => (b.habitants||0) - (a.habitants||0))
    .slice(0, maxLabels);

  for (const c of candidates){
    const icon = L.divIcon({
      className: "comm-label",
      html: `<div class="lbl-box">${escapeHtml(c.nom)}</div>`,
      iconSize: [1,1]
    });
    L.marker([c.centroid[0], c.centroid[1]], {icon, interactive:false}).addTo(labelsLayer);
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

  return `
  <div class="card" data-commune="${escapeHtml(c.id)}">
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

    <div class="details">
      <div><span class="muted">Maire sortant :</span> ${escapeHtml(c.maire_sortant || "—")}</div>
      <div style="margin-top:8px"><span class="muted">Candidats déclarés :</span></div>
      ${candLines || `<div class="muted">—</div>`}
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

/* --- boot --- */
async function boot(){
  initMap();

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

    // options EPCIs
    rebuildEpciOptions();

    renderEpci();
    renderCommunes();
    updateLabels();
    update();

    map.on("zoomend moveend", updateLabels);

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
