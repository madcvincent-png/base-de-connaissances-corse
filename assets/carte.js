/* Carte thématique : une couche (faits, articles, agenda, images drone), filtrée par rubrique et par période,
   comptée par commune. Le fond de carte est facultatif : sans lui, la page fonctionne hors connexion. */
(function () {
  "use strict";
  const K = window.KB, D = K.D, G = window.KB_GEO, L = window.L;
  const $ = (s) => document.querySelector(s);

  const COUCHES = {
    faits: { nom: "Faits datés", legende: "Faits datés recensés dans la base, par commune", aucun: "Aucun fait daté", un: "fait daté", plusieurs: "faits datés", lignes: D.faits, rendu: (x) => K.rangFait(x, { sansLieu: false }) },
    articles: { nom: "Articles", legende: "Articles recensés dans la base, par commune", aucun: "Aucun article", un: "article", plusieurs: "articles", lignes: D.articles, rendu: (x) => K.rangArticle(x) },
    agenda: { nom: "Agenda", legende: "Événements inscrits à l'agenda, par commune", aucun: "Aucun événement", un: "événement", plusieurs: "événements", lignes: D.agenda, rendu: (x) => K.rangAgenda(x), croissant: true },
    drones: { nom: "Drones", legende: "Séquences drone archivées, par commune", aucun: "Aucune séquence", un: "séquence", plusieurs: "séquences", lignes: D.drones, rendu: (x) => K.rangDrone(x), sansRubrique: true },
  };
  const SEUILS = [1, 2, 4, 8, 16];
  const LIBELLES = ["1", "2–3", "4–7", "8–15", "16 et +"];
  const TEINTES = ["--r1", "--r2", "--r3", "--r4", "--r5"].map((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim());
  const classe = (n) => (n < 1 ? -1 : SEUILS.filter((s) => n >= s).length - 1);
  const VILLES = ["2A004", "2B033", "2B096", "2A247", "2B050", "2A272", "2A041", "2B134", "2A249", "2B123"];

  const etat = {
    couche: COUCHES[K.param("couche")] ? K.param("couche") : "faits",
    rub: K.param("rub") ? K.param("rub").split("|") : [],
    de: K.param("de"),
    a: K.param("a"),
    commune: K.param("commune"),
  };
  const codesDe = (x) => x.communes || (x.code ? [x.code] : []);

  // ------------------------------------------------------------ carte
  const carte = L.map("carte", { zoomSnap: 0.25, zoomControl: true, attributionControl: true, minZoom: 7.5, maxZoom: 14 });
  carte.attributionControl.setPrefix("").addAttribution("Contours : IGN, Admin Express");
  const fond = L.tileLayer(
    "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
    { attribution: "Fond : © IGN, Plan IGN v2", maxZoom: 14 }
  );
  fond.addTo(carte);
  let comptes = new Map();
  const style = (f) => {
    const n = comptes.get(f.properties.code) || 0, c = classe(n), choisie = f.properties.code === etat.commune;
    return {
      fillColor: c < 0 ? "#ffffff" : TEINTES[c],
      fillOpacity: carte.hasLayer(fond) ? (c < 0 ? 0.08 : 0.72) : 1,
      color: choisie ? "#202020" : "#8fa0ad",
      weight: choisie ? 3 : 0.6,
    };
  };
  const polygones = L.geoJSON(G.communes, {
    style,
    onEachFeature(f, couche) {
      couche.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        choisir(f.properties.code === etat.commune ? "" : f.properties.code);
      });
      couche.on("mouseover", () => couche.setStyle({ weight: 2.5, color: "#202020" }));
      couche.on("mouseout", () => polygones.resetStyle(couche));
      couche.bindTooltip(() => infobulle(f.properties.code), { sticky: true, className: "info", direction: "top", offset: [0, -6] });
    },
  }).addTo(carte);
  const epci = L.geoJSON(G.epci, { style: { fill: false, color: "#47535f", weight: 1.6, dashArray: "5 4" }, interactive: false });
  const bulles = L.layerGroup().addTo(carte);
  const noms = L.layerGroup().addTo(carte);
  const limites = polygones.getBounds();
  carte.fitBounds(limites, { padding: [16, 16] });
  carte.setMaxBounds(limites.pad(0.5));
  carte.on("click", () => choisir(""));

  function infobulle(code) {
    const c = K.I.commune.get(code), n = comptes.get(code) || 0, co = COUCHES[etat.couche];
    return `<b>${K.esc(c.nom)}</b><small>${n ? K.pluriel(n, co.un, co.plusieurs) : co.aucun}</small>`;
  }

  // ------------------------------------------------------------ filtres
  function filtrees() {
    const co = COUCHES[etat.couche];
    return co.lignes.filter((x) => {
      if (!co.sansRubrique && etat.rub.length && !etat.rub.includes(x.rubrique)) return false;
      const an = (x.date || "").slice(0, 4);
      if ((etat.de || etat.a) && !an) return false;
      if (etat.de && an < etat.de) return false;
      if (etat.a && an > etat.a) return false;
      return true;
    });
  }

  function dessinerFiltres() {
    const co = COUCHES[etat.couche];
    $("#couches").innerHTML = Object.entries(COUCHES)
      .filter(([, c]) => c.lignes.length)
      .map(([k, c]) => `<button type="button" data-couche="${k}" aria-pressed="${k === etat.couche}">${c.nom}</button>`)
      .join("");
    const presentes = new Map();
    co.lignes.forEach((x) => x.rubrique && presentes.set(x.rubrique, (presentes.get(x.rubrique) || 0) + 1));
    etat.rub = etat.rub.filter((r) => presentes.has(r));
    $("#rubriques").hidden = !!co.sansRubrique;
    $("#rubriques").innerHTML = K.RUBRIQUES.filter((r) => presentes.has(r))
      .map((r) => `<button type="button" class="pastille" data-f="${K.familleDe[r]}" data-rub="${K.esc(r)}" aria-pressed="${etat.rub.includes(r)}">${K.esc(r)} <i>${presentes.get(r)}</i></button>`)
      .join("");
    const annees = [...new Set(co.lignes.map((x) => (x.date || "").slice(0, 4)).filter(Boolean))].sort();
    const options = (choix, vide) => `<option value="">${vide}</option>` + annees.map((a) => `<option${a === choix ? " selected" : ""}>${a}</option>`).join("");
    if (!annees.includes(etat.de)) etat.de = "";
    if (!annees.includes(etat.a)) etat.a = "";
    $("#de").innerHTML = options(etat.de, "Du début");
    $("#a").innerHTML = options(etat.a, "Jusqu'à aujourd'hui");
  }

  // ------------------------------------------------------------ rendu
  function dessiner() {
    const co = COUCHES[etat.couche], lignes = filtrees();
    comptes = new Map();
    let localises = 0;
    lignes.forEach((x) => {
      const cs = codesDe(x);
      if (cs.length) localises++;
      cs.forEach((c) => comptes.set(c, (comptes.get(c) || 0) + 1));
    });
    polygones.setStyle(style);
    bulles.clearLayers();
    noms.clearLayers();
    comptes.forEach((n, code) => {
      const c = K.I.commune.get(code);
      if (!c) return;
      const t = n > 99 ? 30 : n > 9 ? 26 : 22;
      L.marker([c.lat, c.lon], {
        icon: L.divIcon({ className: "", html: `<div class="bulle${code === etat.commune ? " choisie" : ""}" style="width:${t}px;height:${t}px">${n}</div>`, iconSize: [t, t] }),
        interactive: false,
        keyboard: false,
      }).addTo(bulles);
    });
    VILLES.forEach((code) => {
      const c = K.I.commune.get(code);
      if (c) L.marker([c.lat, c.lon], { icon: L.divIcon({ className: "nom-ville", html: K.esc(c.nom), iconSize: [0, 0], iconAnchor: [-15, 7] }), interactive: false, keyboard: false }).addTo(noms);
    });

    const filtre = etat.rub.length || etat.de || etat.a;
    const sansDate = (etat.de || etat.a) ? co.lignes.filter((x) => !x.date).length : 0;
    $("#etat").innerHTML = `<span><b>${K.pluriel(lignes.length, co.un, co.plusieurs)}</b>, dont ${localises} rattaché${localises > 1 ? "s" : ""} à une commune (${K.pluriel(comptes.size, "commune")})${
      sansDate ? `. ${K.pluriel(sansDate, "fiche non datée écartée", "fiches non datées écartées")}` : ""
    }</span>${filtre ? `<button type="button" id="raz">Tout réafficher</button>` : ""}`;
    $("#legende").innerHTML = `<b>${K.esc(co.legende)}</b>
      <ol>${LIBELLES.map((l, i) => `<li><span style="background:${TEINTES[i]}"></span>${l}</li>`).join("")}</ol>
      <p>Ce décompte montre ce qui a été saisi dans la base, pas ce qui s'est produit. ${lignes.length - localises} ${lignes.length - localises > 1 ? "fiches ne sont" : "fiche n'est"} pas rattachée${lignes.length - localises > 1 ? "s" : ""} à une commune.</p>`;

    const c = etat.commune && K.I.commune.get(etat.commune);
    $("#commune").hidden = !c;
    if (c)
      $("#commune").innerHTML = `<h2>${K.esc(c.nom)}</h2><p>${K.esc(c.dep)}, ${K.esc(c.epci)}${c.pop != null ? `, ${c.pop.toLocaleString("fr-FR")} habitants` : ""}</p>
        <a class="bouton" href="${K.url.commune(c.code)}">Ouvrir la fiche commune</a> <button type="button" class="bouton second" id="deselection">Revenir à toute la Corse</button>`;
    const visibles = (c ? lignes.filter((x) => codesDe(x).includes(c.code)) : lignes).slice().sort(co.croissant ? K.parDateCroissante : K.parDate);
    const el = $("#liste");
    if (!visibles.length)
      el.innerHTML = `<div class="vide">${c ? `${co.aucun} à ${K.esc(c.nom)} avec ces filtres.` : `${co.aucun} avec ces filtres.`}</div>`;
    else K.listeRepliable(el, visibles, co.rendu, 25);
    K.etatUrl({ couche: etat.couche === "faits" ? "" : etat.couche, rub: etat.rub, de: etat.de, a: etat.a, commune: etat.commune });
  }

  function choisir(code) {
    etat.commune = code;
    dessiner();
    if (code && window.matchMedia("(max-width: 980px)").matches) $("#commune").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ------------------------------------------------------------ événements
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.couche) {
      etat.couche = b.dataset.couche;
      dessinerFiltres();
      dessiner();
    } else if (b.dataset.rub) {
      const r = b.dataset.rub;
      etat.rub = etat.rub.includes(r) ? etat.rub.filter((x) => x !== r) : [...etat.rub, r];
      b.setAttribute("aria-pressed", etat.rub.includes(r));
      dessiner();
    } else if (b.id === "raz") {
      etat.rub = [];
      etat.de = etat.a = "";
      dessinerFiltres();
      dessiner();
    } else if (b.id === "deselection") choisir("");
  });
  $("#de").addEventListener("change", (e) => {
    etat.de = e.target.value;
    if (etat.a && etat.de > etat.a) etat.a = $("#a").value = "";
    dessiner();
  });
  $("#a").addEventListener("change", (e) => {
    etat.a = e.target.value;
    if (etat.de && etat.de > etat.a && etat.a) etat.de = $("#de").value = "";
    dessiner();
  });
  $("#fond").addEventListener("change", (e) => {
    e.target.checked ? fond.addTo(carte).bringToBack() : fond.remove();
    polygones.setStyle(style);
  });
  $("#epci").addEventListener("change", (e) => (e.target.checked ? epci.addTo(carte) : epci.remove()));
  window.addEventListener("resize", () => carte.invalidateSize());

  // ------------------------------------------------------------ volet : tirette et carte seule
  const pageCarte = $(".carte-page"), tirette = $("#tirette"), plein = $("#plein");
  const LARGEUR_MIN = 300, LARGEUR_MAX = 680;
  const lire = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible : réglage non retenu */ } };
  const recaler = () => setTimeout(() => carte.invalidateSize({ pan: false }), 230);
  const largeur = Number(lire("kb-volet")) || 0;
  if (largeur >= LARGEUR_MIN && largeur <= LARGEUR_MAX) pageCarte.style.setProperty("--volet", largeur + "px");
  const replier = (ferme) => {
    pageCarte.classList.toggle("volet-ferme", ferme);
    tirette.setAttribute("aria-expanded", String(!ferme));
    recaler();
  };
  const carteSeule = (oui) => {
    document.body.classList.toggle("carte-seule", oui);
    plein.setAttribute("aria-pressed", String(oui));
    plein.textContent = oui ? "Revenir au volet" : "Carte seule";
    recaler();
  };
  plein.addEventListener("click", () => carteSeule(!document.body.classList.contains("carte-seule")));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("carte-seule")) carteSeule(false);
  });
  // Glisser la tirette règle la largeur du volet ; un clic sans glisser le replie ou le déplie.
  let depart = null;
  tirette.addEventListener("pointerdown", (e) => {
    if (window.matchMedia("(max-width: 980px)").matches) return;
    depart = { x: e.clientX, l: $(".volet").getBoundingClientRect().width, bouge: false };
    tirette.setPointerCapture(e.pointerId);
  });
  tirette.addEventListener("pointermove", (e) => {
    if (!depart) return;
    const dx = e.clientX - depart.x;
    if (Math.abs(dx) < 4 && !depart.bouge) return;
    depart.bouge = true;
    pageCarte.classList.add("glisse");
    if (pageCarte.classList.contains("volet-ferme")) replier(false);
    const l = Math.min(LARGEUR_MAX, Math.max(LARGEUR_MIN, depart.l + dx));
    pageCarte.style.setProperty("--volet", l + "px");
    carte.invalidateSize({ pan: false });
  });
  tirette.addEventListener("pointerup", () => {
    if (!depart) return;
    if (depart.bouge) ecrire("kb-volet", parseInt(getComputedStyle(pageCarte).getPropertyValue("--volet"), 10) || "");
    else replier(!pageCarte.classList.contains("volet-ferme"));
    pageCarte.classList.remove("glisse");
    depart = null;
  });
  tirette.addEventListener("keydown", (e) => {
    // Au clavier : flèches pour la largeur, Entrée ou Espace pour replier
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const l = Math.min(LARGEUR_MAX, Math.max(LARGEUR_MIN, $(".volet").getBoundingClientRect().width + (e.key === "ArrowRight" ? 30 : -30)));
    pageCarte.style.setProperty("--volet", l + "px");
    ecrire("kb-volet", l);
    recaler();
  });
  tirette.addEventListener("click", (e) => { if (e.detail === 0) replier(!pageCarte.classList.contains("volet-ferme")); }); // Entrée ou Espace

  dessinerFiltres();
  dessiner();
  if (etat.commune) {
    polygones.eachLayer((l) => l.feature.properties.code === etat.commune && carte.fitBounds(l.getBounds().pad(2.5)));
  }
})();
