/* global L */
const STATE = {
  mode: "commune", // commune | candidat
  dept: "Tous",
  epci: "Tous",
  commune: "Tous",
  query: "",
  selectedCommune: null, // insee
};

function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function toFrNum(n){
  if(n === null || n === undefined) return "—";
  try { return Number(n).toLocaleString("fr-FR"); } catch { return String(n); }
}

function uniq(arr){
  return Array.from(new Set(arr.filter(x => x !== null && x !== undefined && String(x).trim() !== "")));
}

function norm(s){
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/’/g,"'")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}

function buildOption(value, label){
  const o = document.createElement("option");
  o.value = value;
  o.textContent = label;
  return o;
}

function parseQuery(){
  const u = new URL(window.location.href);
  const commune = u.searchParams.get("commune");
  if(commune) STATE.selectedCommune = commune;
}

async function loadData(){
  const [communesMeta, communesGeo, candidats] = await Promise.all([
    fetch("./data/communes_meta.json").then(r=>r.json()),
    fetch("./data/communes.geojson").then(r=>r.json()),
    fetch("./data/candidats.json").then(r=>r.json()),
  ]);
  return {communesMeta, communesGeo, candidats};
}

function initMap(communesGeo){
  // Base map: Plan IGN v2 (WMTS raster) – template per IGN (services web "découverte")
  const map = L.map("map", { zoomControl: true }).setView([42.12, 9.05], 8);

  const planIgn = L.tileLayer(
    "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0" +
      "&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png" +
      "&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
    {
      minZoom: 0,
      maxZoom: 20,
      maxNativeZoom: 19,
      tileSize: 256,
      attribution: "Plan IGN v2 © IGN",
    }
  ).addTo(map);

  const defaultStyle = {
    color: "#174ea6",
    weight: 1,
    opacity: 0.55,
    fillColor: "#1a73e8",
    fillOpacity: 0.10,
  };

  const highlightStyle = {
    color: "#111827",
    weight: 2,
    opacity: 0.9,
    fillColor: "#1a73e8",
    fillOpacity: 0.18,
  };

  let selectedLayer = null;
  const geoLayer = L.geoJSON(communesGeo, {
    style: () => defaultStyle,
    onEachFeature: (feature, layer) => {
      layer.on("click", () => {
        selectCommune(feature.properties.insee, { openCard: true, zoom: true, fromMap: true });
      });
    },
  }).addTo(map);

  function setFilteredSet(inseeSet){
    geoLayer.setStyle((feature) => {
      const ok = inseeSet.has(feature.properties.insee);
      return ok ? defaultStyle : { ...defaultStyle, opacity: 0.15, fillOpacity: 0.03 };
    });
  }

  function setSelected(insee){
    if(selectedLayer) selectedLayer.setStyle(defaultStyle);
    selectedLayer = null;
    geoLayer.eachLayer(layer=>{
      const f = layer.feature;
      if(f && f.properties && f.properties.insee === insee){
        selectedLayer = layer;
      }
    });
    if(selectedLayer) selectedLayer.setStyle(highlightStyle);
  }

  function fitToInsee(insee){
    let bounds = null;
    geoLayer.eachLayer(layer=>{
      const f = layer.feature;
      if(f && f.properties && f.properties.insee === insee){
        bounds = layer.getBounds();
      }
    });
    if(bounds) map.fitBounds(bounds.pad(0.15));
  }

  return { map, geoLayer, setFilteredSet, setSelected, fitToInsee };
}

let COMMUNES = [];
let CANDIDATS = [];
let MAP = null;

const el = {
  btnVueCommune: document.getElementById("btnVueCommune"),
  btnVueCandidat: document.getElementById("btnVueCandidat"),
  deptSelect: document.getElementById("deptSelect"),
  epciSelect: document.getElementById("epciSelect"),
  communeSelect: document.getElementById("communeSelect"),
  communeFilterRow: document.getElementById("communeFilterRow"),
  searchBox: document.getElementById("searchBox"),
  suggestions: document.getElementById("suggestions"),
  list: document.getElementById("list"),
  statsText: document.getElementById("statsText"),
  statsPill: document.getElementById("statsPill"),
};

function setMode(mode){
  STATE.mode = mode;
  el.btnVueCommune.classList.toggle("active", mode==="commune");
  el.btnVueCandidat.classList.toggle("active", mode==="candidat");
  el.communeFilterRow.style.display = (mode==="candidat") ? "block" : "none";
  // reset commune filter when leaving candidate mode
  if(mode==="commune"){
    STATE.commune = "Tous";
    el.communeSelect.value = "Tous";
  }
  refreshFilters();
  render();
}

function buildFilters(){
  // Département
  el.deptSelect.innerHTML = "";
  el.deptSelect.appendChild(buildOption("Tous","Tous"));
  const depts = uniq(COMMUNES.map(c=>c.dept)).sort((a,b)=>a.localeCompare(b,"fr"));
  depts.forEach(d=> el.deptSelect.appendChild(buildOption(d,d)));

  // initial EPCI + commune
  refreshFilters();
}

function refreshFilters(){
  // EPCI depends on dept
  const dept = STATE.dept;
  const communesInDept = COMMUNES.filter(c => dept==="Tous" ? true : c.dept===dept);

  const epcis = uniq(communesInDept.map(c=>c.epci)).sort((a,b)=>a.localeCompare(b,"fr"));
  el.epciSelect.innerHTML = "";
  el.epciSelect.appendChild(buildOption("Tous","Tous"));
  epcis.forEach(e=> el.epciSelect.appendChild(buildOption(e,e)));

  // If current epci not available, reset
  if(STATE.epci !== "Tous" && !epcis.includes(STATE.epci)){
    STATE.epci = "Tous";
    el.epciSelect.value = "Tous";
  } else {
    el.epciSelect.value = STATE.epci;
  }

  // Commune dropdown only for candidate mode
  if(STATE.mode === "candidat"){
    const epci = STATE.epci;
    const communesInZone = communesInDept.filter(c => epci==="Tous" ? true : c.epci===epci);
    const sorted = [...communesInZone].sort((a,b)=> (b.habitants||0)-(a.habitants||0) || a.name.localeCompare(b.name,"fr"));
    el.communeSelect.innerHTML = "";
    el.communeSelect.appendChild(buildOption("Tous","Toutes les communes"));
    sorted.forEach(c => el.communeSelect.appendChild(buildOption(c.insee, `${c.name} (${toFrNum(c.habitants)})`)));

    if(STATE.commune !== "Tous" && !communesInZone.some(c=>c.insee===STATE.commune)){
      STATE.commune = "Tous";
      el.communeSelect.value = "Tous";
    } else {
      el.communeSelect.value = STATE.commune;
    }
  }

  // Autocomplete suggestions (communes + candidats)
  buildSuggestions();
}

function buildSuggestions(){
  const q = norm(STATE.query);
  el.suggestions.innerHTML = "";
  const options = [];

  // Communes always included
  const communeLabels = COMMUNES.map(c=>({ value: c.name, label: c.name, type:"commune" }));
  // Candidats: include "Nom (Commune)"
  const candLabels = CANDIDATS.map(c=>({ value: `${c.name} (${c.commune})`, label: `${c.name} (${c.commune})`, type:"candidat" }));

  const combined = [...communeLabels, ...candLabels];
  combined.slice(0, 2000).forEach(item => {
    if(!q || norm(item.value).includes(q)){
      const o = document.createElement("option");
      o.value = item.value;
      el.suggestions.appendChild(o);
    }
  });
}

function getFilteredCommunes(){
  const dept = STATE.dept;
  const epci = STATE.epci;
  const q = norm(STATE.query);

  return COMMUNES.filter(c=>{
    if(dept !== "Tous" && c.dept !== dept) return false;
    if(epci !== "Tous" && c.epci !== epci) return false;
    if(!q) return true;
    // match commune name OR any candidate name inside commune
    if(norm(c.name).includes(q)) return true;
    if((c.candidats||[]).some(x => norm(x.name).includes(q))) return true;
    return false;
  }).sort((a,b)=>{
    return (b.habitants||0)-(a.habitants||0) || a.name.localeCompare(b.name,"fr");
  });
}

function getFilteredCandidats(){
  const dept = STATE.dept;
  const epci = STATE.epci;
  const commune = STATE.commune;
  const q = norm(STATE.query);

  let base = CANDIDATS.filter(c=>{
    if(dept !== "Tous" && c.dept !== dept) return false;
    if(epci !== "Tous" && c.epci !== epci) return false;
    if(commune !== "Tous" && c.commune_insee !== commune) return false;
    if(!q) return true;
    if(norm(c.name).includes(q)) return true;
    if(norm(c.commune).includes(q)) return true;
    return false;
  });

  // sort by commune habitants desc, then maire sortant first, then alpha name
  base.sort((a,b)=>{
    const ha = a.habitants_commune || 0;
    const hb = b.habitants_commune || 0;
    if(hb !== ha) return hb - ha;
    if((b.is_maire_sortant?1:0) !== (a.is_maire_sortant?1:0)) return (b.is_maire_sortant?1:0) - (a.is_maire_sortant?1:0);
    // by commune name then candidate name
    const cc = a.commune.localeCompare(b.commune,"fr");
    if(cc !== 0) return cc;
    return a.name.localeCompare(b.name,"fr");
  });

  return base;
}

function renderStats(filteredCommunes, filteredCandidats){
  if(STATE.mode === "commune"){
    const nbCommunes = filteredCommunes.length;
    const nbCands = filteredCommunes.reduce((acc,c)=>acc + (c.candidats ? c.candidats.length : 0),0);
    el.statsText.textContent = `${nbCommunes} commune${nbCommunes>1?"s":""} • ${nbCands} candidat${nbCands>1?"s":""}`;
    el.statsPill.textContent = "Vue commune";
  } else {
    const nbCands = filteredCandidats.length;
    const nbCommunes = new Set(filteredCandidats.map(c=>c.commune_insee)).size;
    el.statsText.textContent = `${nbCommunes} commune${nbCommunes>1?"s":""} • ${nbCands} candidat${nbCands>1?"s":""}`;
    el.statsPill.textContent = "Vue candidats";
  }
}

function render(){
  const filteredCommunes = getFilteredCommunes();
  const filteredCandidats = getFilteredCandidats();
  renderStats(filteredCommunes, filteredCandidats);

  // Map filter styling
  if(MAP){
    MAP.setFilteredSet(new Set(filteredCommunes.map(c=>c.insee)));
    if(STATE.selectedCommune){
      MAP.setSelected(STATE.selectedCommune);
    }
  }

  el.list.innerHTML = "";

  if(STATE.mode === "commune"){
    if(filteredCommunes.length === 0){
      el.list.innerHTML = `<div class="empty">Aucun résultat.</div>`;
      return;
    }
    filteredCommunes.forEach(c=>{
      const card = document.createElement("div");
      card.className = "commune-card";
      card.dataset.insee = c.insee;

      const photo = c.photo ? `<img src="${esc(c.photo)}" alt="">` : "";
      const habitants = (c.habitants !== null && c.habitants !== undefined) ? `${toFrNum(c.habitants)} hab.` : "—";
      const nbListes = (c.nb_listes !== null && c.nb_listes !== undefined) ? String(c.nb_listes) : "—";
      const maire = c.maire_sortant ? esc(c.maire_sortant) : "—";
      const candLinks = (c.candidats && c.candidats.length)
        ? c.candidats.map(x => `<a href="./candidat.html?id=${encodeURIComponent(x.id)}">${esc(x.name)}</a>`).join("<br/>")
        : `<span style="color:var(--muted);">—</span>`;

      card.innerHTML = `
        <div class="commune-head">
          <div class="commune-photo">${photo}</div>
          <div class="commune-title">
            <p class="name">${esc(c.name)}</p>
            <div class="meta">
              <span>${esc(c.dept || "")}</span>
              <span>•</span>
              <span>${habitants}</span>
            </div>
            <div class="badges">
              <span class="badge">${esc(c.epci || "—")}</span>
            </div>
          </div>
        </div>
        <div class="commune-body">
          <div class="kv">
            <div class="k">Maire sortant</div><div class="v">${maire}</div>
            <div class="k">Nombre de listes</div><div class="v">${esc(nbListes)}</div>
          </div>
          <div class="cand-list">
            <div style="font-weight:700;margin-bottom:6px;">Candidats déclarés</div>
            ${candLinks}
          </div>
        </div>
      `;

      // open state if selected
      if(STATE.selectedCommune === c.insee){
        card.classList.add("open");
      }

      card.querySelector(".commune-head").addEventListener("click", ()=>{
        const already = card.classList.contains("open");
        document.querySelectorAll(".commune-card.open").forEach(x=>x.classList.remove("open"));
        if(!already){
          card.classList.add("open");
          selectCommune(c.insee, { openCard: true, zoom: true, fromMap: false });
        }else{
          // collapse but keep selection
          card.classList.remove("open");
        }
      });

      el.list.appendChild(card);
    });
  } else {
    if(filteredCandidats.length === 0){
      el.list.innerHTML = `<div class="empty">Aucun résultat.</div>`;
      return;
    }

    // Group by commune_insee
    const byCommune = new Map();
    filteredCandidats.forEach(c=>{
      if(!byCommune.has(c.commune_insee)) byCommune.set(c.commune_insee, []);
      byCommune.get(c.commune_insee).push(c);
    });

    // sort communes by habitants desc
    const entries = Array.from(byCommune.entries()).map(([insee, cands])=>{
      const commune = COMMUNES.find(x=>x.insee===insee);
      const hab = commune ? (commune.habitants || 0) : 0;
      return { insee, cands, hab, communeName: commune ? commune.name : "" };
    }).sort((a,b)=> b.hab - a.hab || a.communeName.localeCompare(b.communeName,"fr"));

    entries.forEach(entry=>{
      const commune = COMMUNES.find(x=>x.insee===entry.insee);
      const card = document.createElement("div");
      card.className = "commune-card open";
      card.dataset.insee = entry.insee;

      const habitants = commune ? `${toFrNum(commune.habitants)} hab.` : "—";

      const candHtml = entry.cands.map(c=>{
        const badgeM = c.is_maire_sortant ? `<span class="badge blue-dark">Maire sortant : oui</span>` : `<span class="badge blue">Maire sortant : non</span>`;
        const badgeC = `<span class="badge blue-dark">Candidat : oui</span>`;
        return `
          <div style="border:1px solid var(--line);border-radius:12px;padding:10px;margin-top:8px;">
            <div style="font-weight:800;font-size:14px;line-height:1.2;">${esc(c.name)}</div>
            <div class="badges" style="margin-top:6px;">
              ${badgeM}
              ${badgeC}
            </div>
            <div style="margin-top:8px;">
              <a href="./candidat.html?id=${encodeURIComponent(c.id)}" class="badge">Ouvrir la fiche</a>
            </div>
          </div>
        `;
      }).join("");

      card.innerHTML = `
        <div class="commune-head">
          <div class="commune-title">
            <p class="name">${esc(commune ? commune.name : entry.communeName)}</p>
            <div class="meta">
              <span>${esc(commune ? commune.dept : "")}</span>
              <span>•</span>
              <span>${habitants}</span>
            </div>
          </div>
        </div>
        <div class="commune-body" style="display:block;">
          ${candHtml}
        </div>
      `;

      card.querySelector(".commune-head").addEventListener("click", ()=>{
        selectCommune(entry.insee, { openCard: false, zoom: true, fromMap: false });
      });

      el.list.appendChild(card);
    });
  }
}

function selectCommune(insee, opts){
  STATE.selectedCommune = insee;
  if(MAP){
    MAP.setSelected(insee);
    if(opts.zoom) MAP.fitToInsee(insee);
  }
  // open/scroll corresponding card in commune mode
  if(STATE.mode === "commune" && opts.openCard){
    document.querySelectorAll(".commune-card.open").forEach(x=>x.classList.remove("open"));
    const card = document.querySelector(`.commune-card[data-insee="${CSS.escape(insee)}"]`);
    if(card){
      card.classList.add("open");
      card.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } else {
    // still scroll to commune if present
    const card = document.querySelector(`.commune-card[data-insee="${CSS.escape(insee)}"]`);
    if(card){
      card.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}

function wireEvents(){
  el.btnVueCommune.addEventListener("click", ()=>setMode("commune"));
  el.btnVueCandidat.addEventListener("click", ()=>setMode("candidat"));

  el.deptSelect.addEventListener("change", ()=>{
    STATE.dept = el.deptSelect.value;
    // reset deeper filters
    STATE.epci = "Tous";
    STATE.commune = "Tous";
    refreshFilters();
    render();
  });

  el.epciSelect.addEventListener("change", ()=>{
    STATE.epci = el.epciSelect.value;
    STATE.commune = "Tous";
    refreshFilters();
    render();
  });

  el.communeSelect.addEventListener("change", ()=>{
    STATE.commune = el.communeSelect.value;
    render();
    if(STATE.commune !== "Tous"){
      selectCommune(STATE.commune, { openCard:false, zoom:true, fromMap:false });
    }
  });

  el.searchBox.addEventListener("input", ()=>{
    STATE.query = el.searchBox.value || "";
    buildSuggestions();
    render();
  });

  // Enter key: if matches "Nom (Commune)" exactly, open candidate view and scroll, else if matches commune, select commune
  el.searchBox.addEventListener("keydown", (e)=>{
    if(e.key !== "Enter") return;
    const v = (el.searchBox.value || "").trim();
    if(!v) return;

    // Exact candidate match pattern "Name (Commune)"
    const m = v.match(/^(.*)\s+\((.*)\)\s*$/);
    if(m){
      const name = norm(m[1]);
      const communeName = norm(m[2]);
      const cand = CANDIDATS.find(c => norm(c.name)===name && norm(c.commune)===communeName);
      if(cand){
        setMode("candidat");
        STATE.dept = cand.dept || "Tous";
        STATE.epci = cand.epci || "Tous";
        STATE.commune = cand.commune_insee || "Tous";
        el.deptSelect.value = STATE.dept;
        refreshFilters();
        render();
        // scroll to commune group
        selectCommune(cand.commune_insee, { openCard:false, zoom:true, fromMap:false });
      }
      return;
    }

    // Commune exact match
    const commune = COMMUNES.find(c => norm(c.name) === norm(v));
    if(commune){
      setMode("commune");
      selectCommune(commune.insee, { openCard:true, zoom:true, fromMap:false });
    }
  });
}

async function main(){
  parseQuery();

  const {communesMeta, communesGeo, candidats} = await loadData();
  COMMUNES = communesMeta;
  CANDIDATS = candidats;
  MAP = initMap(communesGeo);

  buildFilters();
  wireEvents();

  // initial dept select
  el.deptSelect.value = STATE.dept;

  // select from query param
  if(STATE.selectedCommune){
    // make sure selected commune visible
    setTimeout(()=> selectCommune(STATE.selectedCommune, { openCard:true, zoom:true, fromMap:false }), 200);
  }

  render();
}

main().catch(err=>{
  console.error(err);
  document.getElementById("list").innerHTML = '<div class="empty">Erreur de chargement des données.</div>';
});
