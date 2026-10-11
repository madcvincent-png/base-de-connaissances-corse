/* Base de connaissances Corse — socle commun à toutes les pages.
   Les données viennent de data/kb.js (window.KB_DATA), produit par scripts/build_data.py. */
(function () {
  "use strict";
  const D = window.KB_DATA;
  if (!D) {
    document.body.innerHTML = '<p style="padding:2rem">Les données sont introuvables : le fichier data/kb.js manque.</p>';
    return;
  }

  // ------------------------------------------------------------ outils
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[’']/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  /** Texte saisi dans Notion : on échappe tout, puis on rétablit les liens [texte](adresse). */
  const riche = (s) =>
    esc(s).replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener" target="_blank">$1</a>');
  const param = (n) => new URLSearchParams(location.search).get(n) || "";
  const pluriel = (n, un, plusieurs) => `${n.toLocaleString("fr-FR")} ${n > 1 ? plusieurs || un + "s" : un}`;

  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  function dateFr(iso, precision) {
    if (!iso) return "";
    const [a, m, j] = iso.slice(0, 10).split("-").map(Number);
    if (precision === "Année") return String(a);
    if (precision === "Mois") return `${MOIS[m - 1]} ${a}`;
    const txt = `${j === 1 ? "1er" : j} ${MOIS[m - 1]} ${a}`;
    return precision === "Approximative" ? `vers le ${txt}` : txt;
  }
  const dateCourte = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
  const aujourdHui = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const joursAvant = (iso) => Math.round((new Date(iso.slice(0, 10)) - new Date(aujourdHui())) / 86400000);

  // ------------------------------------------------------------ rubriques
  const FAMILLES = {
    publique: { nom: "Vie publique", rubriques: ["Politique", "Institutions"] },
    justice: { nom: "Justice et faits divers", rubriques: ["Justice", "Faits divers"] },
    economie: { nom: "Économie et social", rubriques: ["Économie", "Social", "Agriculture", "Transports"] },
    societe: { nom: "Société et culture", rubriques: ["Société", "Santé", "Éducation", "Culture", "Langue corse", "Sports"] },
    environnement: { nom: "Environnement", rubriques: ["Environnement"] },
  };
  const RUBRIQUES = Object.values(FAMILLES).flatMap((f) => f.rubriques);
  const familleDe = {};
  Object.entries(FAMILLES).forEach(([k, f]) => f.rubriques.forEach((r) => (familleDe[r] = k)));
  const rub = (r) => (r ? `<span class="rub" data-f="${familleDe[r] || ""}">${esc(r)}</span>` : "");

  // ------------------------------------------------------------ index
  const parId = (liste, cle = "id") => new Map(liste.map((x) => [x[cle], x]));
  const I = {
    commune: parId(D.communes, "code"),
    personne: parId(D.personnes),
    dossier: parId(D.dossiers),
    article: parId(D.articles),
    fait: parId(D.faits),
    note: parId(D.notes),
    role: parId(D.roles),
    agenda: parId(D.agenda),
    document: parId(D.documents || []),
  };
  D.documents = D.documents || [];
  const notesDuDocument = new Map();
  D.notes.forEach((n) => (n.documents || []).forEach((d) => (notesDuDocument.get(d) || notesDuDocument.set(d, []).get(d)).push(n)));
  const vide = () => ({ faits: [], articles: [], agenda: [], roles: [], notes: [], drones: [], dossiers: [], personnes: [], documents: [] });
  const R = { dossier: new Map(), personne: new Map(), commune: new Map(), article: new Map() };
  const lie = (carte, cle, champ, objet) => {
    if (!carte.has(cle)) carte.set(cle, vide());
    carte.get(cle)[champ].push(objet);
  };
  const BASES = [
    ["faits", D.faits],
    ["articles", D.articles],
    ["agenda", D.agenda],
    ["roles", D.roles],
    ["notes", D.notes],
    ["documents", D.documents],
  ];
  for (const [champ, lignes] of BASES) {
    for (const l of lignes) {
      (l.dossiers || []).forEach((d) => lie(R.dossier, d, champ, l));
      (l.personnes || []).forEach((p) => lie(R.personne, p, champ, l));
      (l.communes || []).forEach((c) => lie(R.commune, c, champ, l));
      (l.sources || []).forEach((a) => lie(R.article, a, champ, l));
    }
  }
  D.drones.forEach((d) => lie(R.commune, d.code, "drones", d));
  // protagonistes d'un dossier : ceux que la fiche du dossier désigne
  D.dossiers.forEach((d) => (d.personnes || []).forEach((p) => lie(R.personne, p, "dossiers", d)));
  const liens = (type, cle) => R[type].get(cle) || vide();

  const parDate = (a, b) => (b.date || "").localeCompare(a.date || "");
  const parDateCroissante = (a, b) => (a.date || "9999").localeCompare(b.date || "9999");

  // ------------------------------------------------------------ adresses
  const url = {
    commune: (c) => `commune.html?code=${encodeURIComponent(c)}`,
    personne: (i) => `personne.html?id=${i}`,
    dossier: (i) => `dossier.html?id=${i}`,
    note: (i) => `note.html?id=${i}`,
  };
  const lienCommune = (c) => {
    const o = I.commune.get(c);
    return o ? `<a href="${url.commune(c)}">${esc(o.nom)}</a>` : "";
  };
  const lienPersonne = (i) => {
    const o = I.personne.get(i);
    return o ? `<a href="${url.personne(i)}">${esc(nomAffiche(o))}</a>` : "";
  };
  const lienDossier = (i) => {
    const o = I.dossier.get(i);
    return o ? `<a href="${url.dossier(i)}">${esc(o.titre)}</a>` : "";
  };
  /** « SIMEONI Gilles » dans la base, « Gilles Simeoni » à l'écran. */
  function nomAffiche(p) {
    if (p.nature !== "Personne") return p.nom;
    const m = p.nom.match(/^((?:[A-ZÀ-ÖØ-Þ'’\-]{2,}\s?)+)\s+(.+)$/);
    if (!m) return p.nom;
    const nom = m[1].trim().toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (x, a, b) => a + b.toUpperCase())
      .replace(/^(?:(De|Du|Des)(?=\s)|D['’](?=\p{L}))/u, (x) => x.toLowerCase())
      .replace(/(?<=\s)D(?=['’]\p{L})/gu, "d") // « Colonna d'Istria »
      .replace(/(?<=\s)(Di|Da|Della|Delle|De|Du)(?=\s)/gu, (x) => x.toLowerCase()); // « Pozzo di Borgo » // « de La Foata », « d'Ornano », mais « Deconstanza »
    return `${m[2]} ${nom}`;
  }

  // ------------------------------------------------------------ rangs de liste
  const etiqFiabilite = (f) =>
    !f ? "" : f === "Recoupé" ? `<span class="etiq ok">Recoupé</span>` : `<span class="etiq attention">${esc(f)}</span>`;

  function rangFait(f, opt = {}) {
    const lieux = (f.communes || []).map(lienCommune).filter(Boolean).join(", ");
    const dos = opt.sansDossier ? "" : (f.dossiers || []).map(lienDossier).filter(Boolean).join(" ; ");
    const gens = (f.personnes || []).map(lienPersonne).filter(Boolean).join(", ");
    const src = (f.sources || [])
      .map((i) => I.article.get(i))
      .filter(Boolean)
      .map((a) => (a.lien ? `<a href="${esc(a.lien)}" target="_blank" rel="noopener">${esc(a.source)}</a>` : esc(a.source)));
    return `<div class="rang${f.jalon ? " jalon" : ""}">
      <div class="quand">${esc(dateFr(f.date, f.precision))}${f.dateFin ? `<br><span class="discret">au ${esc(dateFr(f.dateFin))}</span>` : ""}</div>
      <div class="quoi">
        <div class="intitule">${esc(f.titre)}</div>
        ${f.sourceHorsBase ? `<div class="complement">${riche(f.sourceHorsBase)}</div>` : ""}
        <div class="meta">${rub(f.rubrique)}${f.type ? `<span class="etiq">${esc(f.type)}</span>` : ""}${etiqFiabilite(f.fiabilite)}
          ${lieux ? `<span>${lieux}</span>` : opt.sansLieu ? "" : `<span>Non localisé</span>`}
          ${gens ? `<span>${gens}</span>` : ""}${dos ? `<span>${dos}</span>` : ""}
          ${src.length ? `<span>Source${src.length > 1 ? "s" : ""} : ${[...new Set(src)].join(", ")}</span>` : ""}</div>
      </div></div>`;
  }

  function rangArticle(a, opt = {}) {
    const dos = opt.sansDossier ? "" : (a.dossiers || []).map(lienDossier).filter(Boolean).join(" ; ");
    const titre = a.lien ? `<a href="${esc(a.lien)}" target="_blank" rel="noopener">${esc(a.titre)}</a>` : esc(a.titre);
    return `<div class="rang${a.date ? "" : " sans-date"}">
      <div class="quand">${a.date ? esc(dateFr(a.date)) : "Parution non datée"}</div>
      <div class="quoi">
        <div class="intitule">${titre}</div>
        ${a.retenir ? `<div class="complement">${riche(a.retenir)}</div>` : ""}
        <div class="meta"><b>${esc(a.source)}</b>${a.auteur ? `<span>${esc(a.auteur)}</span>` : ""}${rub(a.rubrique)}
          ${a.genre ? `<span class="etiq">${esc(a.genre)}</span>` : ""}
          ${a.traitement === "À dépouiller" ? `<span class="etiq attention">Titre seul, non dépouillé</span>` : ""}
          ${a.traitement === "Vérifié" ? `<span class="etiq ok">Vérifié</span>` : ""}
          ${(a.lieux || []).length ? `<span>${a.lieux.map(esc).join(", ")}</span>` : ""}${dos ? `<span>${dos}</span>` : ""}</div>
      </div></div>`;
  }

  function rangAgenda(e, opt = {}) {
    const j = e.date ? joursAvant(e.date) : null;
    const delai = j == null ? "" : j === 0 ? "aujourd'hui" : j === 1 ? "demain" : j > 0 ? `dans ${j} jours` : `il y a ${-j} jours`;
    const lieux = [(e.communes || []).map(lienCommune).filter(Boolean).join(", "), esc(e.lieu)].filter(Boolean).join(" — ");
    const heure = e.date && e.date.length > 10 ? ` à ${e.date.slice(11, 16).replace(":", " h ")}` : "";
    return `<div class="rang">
      <div class="quand">${esc(dateFr(e.date))}${esc(heure)}<br><span class="discret">${esc(delai)}</span></div>
      <div class="quoi">
        <div class="intitule">${e.lien ? `<a href="${esc(e.lien)}" target="_blank" rel="noopener">${esc(e.titre)}</a>` : esc(e.titre)}</div>
        ${e.aPreparer ? `<div class="complement"><b>À préparer :</b> ${riche(e.aPreparer)}</div>` : ""}
        ${e.origine ? `<div class="complement discret">${riche(e.origine)}</div>` : ""}
        <div class="meta">${rub(e.rubrique)}${e.type ? `<span class="etiq">${esc(e.type)}</span>` : ""}
          ${e.certitude ? `<span class="etiq ${e.certitude === "Confirmé" ? "ok" : "attention"}">${esc(e.certitude)}</span>` : ""}
          ${e.couverture ? `<span class="etiq">${esc(e.couverture)}</span>` : ""}
          ${lieux ? `<span>${lieux}</span>` : ""}
          ${opt.sansDossier ? "" : `<span>${(e.dossiers || []).map(lienDossier).filter(Boolean).join(" ; ")}</span>`}</div>
      </div></div>`;
  }

  function rangRole(r, opt = {}) {
    const judiciaire = r.categorie === "Procédure judiciaire";
    const periode = r.debut ? (r.fin ? `${dateFr(r.debut)} – ${dateFr(r.fin)}` : `depuis le ${dateFr(r.debut)}`) : "";
    const qui = opt.sansPersonne ? "" : (r.personnes || []).map(lienPersonne).filter(Boolean).join(", ");
    const intitule = judiciaire ? r.statut || r.titre : r.mandat || r.titre;
    return `<div class="rang">
      <div class="quand">${r.actuel ? "En cours" : "Passé"}<br><span class="discret">${esc(periode)}</span></div>
      <div class="quoi">
        <div class="intitule">${qui ? qui + " — " : ""}${esc(intitule)}</div>
        ${r.chefs ? `<div class="complement">${riche(r.chefs)}</div>` : ""}
        ${r.antenne ? `<p class="antenne"><b>Formulation pour l'antenne</b>${esc(r.antenne)}</p>` : ""}
        <div class="meta"><span class="etiq${judiciaire ? " alerte" : ""}">${esc(r.categorie)}</span>
          ${r.definitif && r.definitif.startsWith("Non") ? `<span class="etiq alerte">Décision non définitive : présomption d'innocence</span>` : ""}
          ${etiqFiabilite(r.fiabilite)}${r.instance ? `<span>${esc(r.instance)}</span>` : ""}
          ${(r.communes || []).map(lienCommune).filter(Boolean).join(", ")}
          ${opt.sansDossier ? "" : (r.dossiers || []).map(lienDossier).filter(Boolean).join(" ; ")}
          ${r.verifieLe ? `<span>Vérifié le ${esc(dateCourte(r.verifieLe))}</span>` : `<span>Non vérifié</span>`}</div>
      </div></div>`;
  }

  // ------------------------------------------------------------ images (Wikimedia Commons)
  // data/images.js est produit par scripts/build_images.py ; sans lui, le site affiche des initiales.
  const IMG = window.KB_IMG || { communes: {}, fiches: {} };
  const image = (type, id) => (type === "commune" ? IMG.communes : IMG.fiches)[id] || null;
  const NATURES = { Personne: "personne", "Parti / mouvement": "parti", "Club / association": "club", Entreprise: "entreprise", Institution: "institution", Organisation: "organisation" };
  function initiales(p) {
    const n = nomAffiche(p).replace(/\(.*?\)/g, "").trim();
    const mots = n.split(/[\s\-']+/).filter((w) => /^\p{Lu}/u.test(w));
    return (mots.length > 1 ? mots[0][0] + mots[mots.length - 1][0] : n.slice(0, 2)).toUpperCase();
  }
  /** Photo ou logo d'une fiche du répertoire ; à défaut, ses initiales sur une pastille de couleur. */
  function vignette(p, taille = "m") {
    const im = image("fiche", p.id), n = NATURES[p.nature] || "organisation";
    return im
      ? `<img class="vignette ${taille} ${n === "personne" ? "" : "logo"}" src="${esc(im.src)}" alt="" loading="lazy" decoding="async">`
      : `<span class="vignette ${taille} initiales" data-n="${n}" aria-hidden="true">${esc(initiales(p))}</span>`;
  }
  function credit(im) {
    if (!im) return "";
    return `<figcaption class="credit">${im.auteur ? esc(im.auteur) + ", " : ""}${im.page ? `<a href="${esc(im.page)}" target="_blank" rel="noopener">${esc(im.licence || "licence libre")}</a>` : esc(im.licence || "")}, Wikimedia Commons${
      im.aValider ? `<br><span class="a-valider">Rapprochement automatique avec Wikidata, à vérifier</span>` : ""}</figcaption>`;
  }

  // ------------------------------------------------------------ données ouvertes (data/ouvertes.js)
  // Produit par scripts/build_ouvertes.py dans GitHub Actions : Répertoire national des élus,
  // Géorisques, Wikidata. Facultatif : sans lui, les blocs correspondants ne s'affichent pas.
  const O = window.KB_OUV || {};
  const ELUS = O.elus || { communes: {}, effectifs: {}, institutions: {} };
  const SITES = O.sites || [];
  const LIEUX = O.lieux || [];
  const OUV_PERS = O.personnes || {};
  const sitesDe = new Map(), lieuxDe = new Map();
  SITES.forEach((x) => (sitesDe.get(x.commune) || sitesDe.set(x.commune, []).get(x.commune)).push(x));
  LIEUX.forEach((x) => (lieuxDe.get(x.commune) || lieuxDe.set(x.commune, []).get(x.commune)).push(x));
  /** « Ca Du Pays Ajaccien » (graphie du RNE) -> « CA du Pays Ajaccien ». */
  const epciNom = (x) => String(x || "").trim().replace(/^(Ca|Cc|Cu)\b/, (m) => m.toUpperCase())
    .replace(/(?<=\s)(?:(De|Du|Des|La|Le|Les|Et)(?=\s)|(D'|L')(?=\p{L}))/gu, (m) => m.toLowerCase());
  /** « 2ème adjoint au Maire » -> « 2e adjoint au maire ». */
  const fonctionRne = (f) => String(f || "").replace(/(\d+)\s*(?:ème|eme|Ème)/g, "$1e").replace(/(\d+)\s*(?:ère|Ère|ere)/g, "$1re").replace(/au Maire\b/, "au maire");
  /** Un élu du RNE (« SBRAGGIA », « Stéphane ») a-t-il une fiche dans le répertoire ? */
  const indexNoms = new Map(D.personnes.filter((p) => p.nature === "Personne").map((p) => [norm(p.nom), p]));
  const ficheElu = (e) => indexNoms.get(norm(`${e.nom} ${e.prenom}`)) || null;
  const nomElu = (e) => {
    const p = ficheElu(e);
    const n = nomAffiche({ nature: "Personne", nom: `${e.nom} ${e.prenom}` });
    return p ? `<a href="${url.personne(p.id)}">${esc(n)}</a>` : esc(n);
  };
  const circoDe = new Map((ELUS.institutions["Députés"] || []).map((d) => [norm(`${d.nom} ${d.prenom}`), d.circonscription]));

  const FAMILLES_SITES = {
    energie: { nom: "Énergie et hydrocarbures", categories: ["Hydrocarbures et gaz", "Site Seveso", "Centrale électrique", "Barrage", "Production d'énergie"] },
    dechets: { nom: "Déchets", categories: ["Tri et traitement de déchets", "Stockage de déchets", "Compostage et méthanisation", "Décharge"] },
    carrieres: { nom: "Carrières et matériaux", categories: ["Carrières et matériaux"] },
    transports: { nom: "Ports, aéroports, phares", categories: ["Port", "Aéroport", "Phare"] },
    publics: { nom: "Équipements publics", categories: ["Hôpital", "Prison", "Palais de justice", "Université", "Stade"] },
  };
  const familleSite = {};
  Object.entries(FAMILLES_SITES).forEach(([k, f]) => f.categories.forEach((c) => (familleSite[c] = k)));
  const etatSite = (x) => (x.etat || "").replace(/ avec titre$/, "");
  function rangSite(x, opt = {}) {
    return `<div class="rang"><div class="quand"><span class="pastille-site" data-s="${familleSite[x.categorie] || ""}"></span>${esc(x.categorie)}</div><div class="quoi">
      <div class="intitule">${x.lien ? `<a href="${esc(x.lien)}" target="_blank" rel="noopener">${esc(x.nom)}</a>` : esc(x.nom)}</div>
      <div class="meta">${x.seveso ? `<span class="etiq alerte">${esc(x.seveso)}</span>` : ""}${x.regime ? `<span class="etiq">${esc(x.regime)}</span>` : ""}
        ${etatSite(x) && etatSite(x) !== "En exploitation" ? `<span class="etiq attention">${esc(etatSite(x))}</span>` : ""}
        ${(x.autres || []).length ? `<span>Aussi : ${x.autres.map(esc).join(", ")}</span>` : ""}
        ${opt.sansLieu ? "" : `<span>${lienCommune(x.commune)}</span>`}<span class="discret">Source : ${esc(x.source)}</span></div></div></div>`;
  }
  function rangDocument(d, opt = {}) {
    const titre = d.lien ? `<a href="${esc(d.lien)}" target="_blank" rel="noopener">${esc(d.titre)}</a>` : esc(d.titre);
    const ref = [d.collection, d.numero].filter(Boolean).join(" n° ");
    return `<div class="rang"><div class="quand">${d.date ? esc(dateFr(d.date)) : "Non daté"}</div><div class="quoi">
      <div class="intitule">${titre}</div>
      ${d.resume ? `<div class="complement">${riche(d.resume)}</div>` : ""}
      ${d.chiffres ? `<div class="complement chiffres-cles"><b>Chiffres à retenir :</b> ${riche(d.chiffres)}</div>` : ""}
      <div class="meta"><b>${esc(d.producteur)}</b>${d.type ? `<span class="etiq">${esc(d.type)}</span>` : ""}${ref ? `<span>${esc(ref)}</span>` : ""}
        ${d.statut && d.statut !== "En vigueur" && d.statut !== "Publié" ? `<span class="etiq attention">${esc(d.statut)}</span>` : ""}
        ${(d.themes || []).map((t) => `<span class="etiq">${esc(t)}</span>`).join("")}
        ${opt.sansDossier ? "" : (d.dossiers || []).map(lienDossier).filter(Boolean).join(" ; ")}
        ${(notesDuDocument.get(d.id) || []).map((n) => `<a class="etiq lien-note" href="${url.note(n.id)}">Note : ${esc(n.titre.replace(/^Note de synthèse — /, "").split(" : ")[0])}</a>`).join("")}</div></div></div>`;
  }

  // ------------------------------------------------------------ frise chronologique
  /** Points placés à l'échelle du temps ; survol = titre et date. */
  function frise(faits, opt = {}) {
    const d = faits.filter((f) => f.date).sort(parDateCroissante);
    if (d.length < 2) return "";
    const t = (iso) => new Date(iso.slice(0, 10)).getTime();
    const a = t(d[0].date), b = t(d[d.length - 1].date), span = b - a || 1;
    const points = d.map((f) => `<a class="point${f.jalon ? " jalon" : ""}" style="left:${(((t(f.date) - a) / span) * 100).toFixed(2)}%" data-f="${familleDe[f.rubrique] || ""}"
        ${opt.lien ? `href="${opt.lien(f)}"` : 'tabindex="0"'} title="${esc(dateFr(f.date, f.precision))} — ${esc(f.titre)}"><span class="sr">${esc(dateFr(f.date, f.precision))} : ${esc(f.titre)}</span></a>`).join("");
    return `<div class="frise" role="group" aria-label="Frise de ${d.length} faits datés"><div class="frise-axe">${points}</div>
      <div class="frise-bornes"><span>${esc(dateFr(d[0].date, d[0].precision))}</span><span>${esc(dateFr(d[d.length - 1].date, d[d.length - 1].precision))}</span></div></div>`;
  }

  // ------------------------------------------------------------ panneau latéral (aperçu)
  let panneauRetour = null;
  function fermerPanneau() {
    const p = document.querySelector(".panneau");
    if (!p) return;
    p.classList.remove("ouvert");
    document.querySelector(".voile")?.classList.remove("ouvert");
    setTimeout(() => { p.remove(); document.querySelector(".voile")?.remove(); }, 220);
    document.body.classList.remove("sans-defilement");
    panneauRetour?.focus();
  }
  function ouvrirPanneau(contenu, titre) {
    fermerPanneau();
    panneauRetour = document.activeElement;
    const v = document.createElement("div");
    v.className = "voile";
    v.onclick = fermerPanneau;
    const p = document.createElement("aside");
    p.className = "panneau";
    p.setAttribute("role", "dialog");
    p.setAttribute("aria-modal", "true");
    p.setAttribute("aria-label", titre);
    p.innerHTML = `<button class="fermer" type="button" aria-label="Fermer l'aperçu">×</button><div class="panneau-corps">${contenu}</div>`;
    document.body.append(v, p);
    document.body.classList.add("sans-defilement");
    requestAnimationFrame(() => { v.classList.add("ouvert"); p.classList.add("ouvert"); });
    p.querySelector(".fermer").onclick = fermerPanneau;
    p.querySelector(".fermer").focus();
    return p;
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fermerPanneau(); });

  function rangPersonne(p) {
    return `<div class="rang">
      <div class="quand">${esc(p.nature)}</div>
      <div class="quoi avec-vignette">${vignette(p)}<div>
        <div class="intitule"><a href="${url.personne(p.id)}">${esc(p.nom)}</a></div>
        ${p.fonction ? `<div class="complement">${riche(p.fonction)}</div>` : ""}
        <div class="meta">${(p.qualite || []).map((q) => `<span class="etiq">${esc(q)}</span>`).join("")}
          ${p.rattachement ? `<span>${esc(p.rattachement)}</span>` : ""}
          ${p.pron ? `<span>Se prononce : ${esc(p.pron)}</span>` : ""}
          ${p.verifieLe ? `<span class="etiq ok">Vérifiée le ${esc(dateCourte(p.verifieLe))}</span>` : `<span class="etiq attention">Fiche non vérifiée</span>`}</div>
      </div></div></div>`;
  }

  function carteDossier(d) {
    const l = liens("dossier", d.id);
    const gens = (d.personnes || []).map((i) => I.personne.get(i)).filter(Boolean).slice(0, 5);
    return `<a class="carte-dossier" data-f="${familleDe[d.rubrique] || ""}" data-dossier="${d.id}" href="${url.dossier(d.id)}">
      <b>${esc(d.titre)}</b><span class="res">${esc(d.resume)}</span>
      ${gens.length ? `<span class="pile">${gens.map((p) => vignette(p, "s")).join("")}</span>` : ""}
      <span class="bas"><span>${esc(d.type)}</span><span>${pluriel(l.articles.length, "article")}</span>${
        l.faits.length ? `<span>${pluriel(l.faits.length, "fait daté", "faits datés")}</span>` : ""
      }${d.veille === "Veille active" ? `<span class="etiq plein">Veille active</span>` : ""}</span></a>`;
  }

  function rangDrone(d, opt = {}) {
    return `<div class="rang"><div class="quand">${esc(dateFr(d.date)) || "Sans date"}</div><div class="quoi">
      <div class="intitule">${esc(d.titre || d.lieu)}</div>
      <div class="meta">${opt.sansLieu ? "" : `<span>${lienCommune(d.code)}</span>`}${d.duree ? `<span>Durée ${esc(d.duree)}</span>` : ""}${
      d.ref ? `<span>Référence ${esc(d.ref)}</span>` : ""
    }</div></div></div>`;
  }

  /** Liste longue : n'affiche que les premiers rangs, le reste à la demande. */
  function listeRepliable(el, elements, rendu, pas = 12) {
    let n = pas;
    const dessine = () => {
      el.innerHTML =
        `<div class="liste">${elements.slice(0, n).map(rendu).join("")}</div>` +
        (elements.length > n ? `<button class="plus" type="button">Afficher la suite (${elements.length - n} de plus)</button>` : "");
      const b = el.querySelector(".plus");
      if (b)
        b.onclick = () => {
          n += pas * 3;
          dessine();
        };
    };
    if (!elements.length) el.innerHTML = `<div class="vide">Rien dans la base pour l'instant.</div>`;
    else dessine();
  }

  // ------------------------------------------------------------ carrousel
  /** Bande de cartes défilante : glisser, molette horizontale, boutons ou flèches du clavier. */
  function carrousel(titre, cartes, opt = {}) {
    if (!cartes.length) return "";
    const id = "car-" + Math.random().toString(36).slice(2, 8);
    return `<section class="carrousel" aria-roledescription="carrousel" aria-labelledby="${id}-t">
      <div class="carrousel-tete"><h2 id="${id}-t">${titre}${opt.compte != null ? ` <span class="compte">${opt.compte}</span>` : ""}</h2>
        ${opt.lien ? `<a class="lien-tout" href="${opt.lien[0]}">${opt.lien[1]}</a>` : ""}
        <span class="carrousel-boutons"><button type="button" class="car-bouton" data-car="-1" aria-label="Cartes précédentes" aria-controls="${id}">‹</button><button type="button" class="car-bouton" data-car="1" aria-label="Cartes suivantes" aria-controls="${id}">›</button></span></div>
      <ul class="carrousel-piste" id="${id}" tabindex="0">${cartes.map((c) => `<li class="carte-car${c.classe ? " " + c.classe : ""}"${c.f ? ` data-f="${c.f}"` : ""}>${c.html}</li>`).join("")}</ul></section>`;
  }
  function majCarrousel(piste) {
    const c = piste.closest(".carrousel");
    if (!c) return;
    const fin = piste.scrollLeft + piste.clientWidth >= piste.scrollWidth - 4;
    c.querySelector('[data-car="-1"]').disabled = piste.scrollLeft <= 4;
    c.querySelector('[data-car="1"]').disabled = fin;
    c.classList.toggle("sans-boutons", piste.scrollWidth <= piste.clientWidth + 4);
  }
  function initCarrousels(racine = document) {
    racine.querySelectorAll(".carrousel-piste").forEach((p) => {
      if (p.dataset.pret) return majCarrousel(p);
      p.dataset.pret = "1";
      p.addEventListener("scroll", () => majCarrousel(p), { passive: true });
      p.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        p.scrollBy({ left: (e.key === "ArrowRight" ? 1 : -1) * p.clientWidth * 0.85, behavior: "smooth" });
      });
      majCarrousel(p);
    });
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-car]");
    if (!b) return;
    const p = document.getElementById(b.getAttribute("aria-controls"));
    p.scrollBy({ left: Number(b.dataset.car) * p.clientWidth * 0.85, behavior: "smooth" });
  });
  window.addEventListener("resize", () => document.querySelectorAll(".carrousel-piste").forEach(majCarrousel));

  // ------------------------------------------------------------ explorateur : entonnoir + volet de filtres + résultats
  /* Une liste longue se parcourt en trois gestes : on entre par l'entonnoir (de grandes tuiles
     qui choisissent une famille, puis une sous-famille), on affine dans le volet latéral (cases
     à cocher avec leurs effectifs), on lit les filtres actifs en pastilles, chacune effaçable.
     Les effectifs d'une facette tiennent compte de tous les autres filtres, pas d'elle-même. */
  function explorateur(racine, cfg) {
    const valeursDe = (f, x) => [].concat(f.valeurs(x)).filter((v) => v !== "" && v != null);
    const etat = { q: param("q"), tri: param("tri") || (cfg.tris ? cfg.tris[0].cle : ""), p: Number(param("p")) || 1 };
    cfg.facettes.forEach((f) => (etat[f.cle] = param(f.cle) ? param(f.cle).split("|") : []));
    const libelle = (f, v) => (f.libelle ? f.libelle(v) : v);
    racine.innerHTML = `<div class="explorateur">
      ${cfg.entonnoir ? `<nav class="entonnoir" aria-label="Entrées par étapes"></nav>` : ""}
      <div class="explo-corps">
        <aside class="volet-filtres" aria-label="Filtres">
          <div class="vf-tete"><b>Affiner</b><button type="button" class="lien-bouton vf-raz">Tout effacer</button><button type="button" class="vf-fermer" aria-label="Fermer les filtres">×</button></div>
          <label class="sr" for="${cfg.id}-q">${esc(cfg.recherche.label)}</label>
          <input class="vf-q" id="${cfg.id}-q" type="search" placeholder="${esc(cfg.recherche.placeholder)}" value="${esc(etat.q)}">
          <div class="vf-facettes"></div>
          <button type="button" class="bouton vf-voir">Voir les résultats</button>
        </aside>
        <div class="vf-voile" aria-hidden="true"></div>
        <section class="explo-resultats">
          <div class="barre-resultats">
            <button type="button" class="bouton second vf-ouvrir" aria-expanded="false">Filtres<span class="vf-n"></span></button>
            <b class="explo-n" aria-live="polite"></b>
            ${cfg.tris ? `<label class="explo-tri">Classer <select>${cfg.tris.map((t) => `<option value="${t.cle}"${t.cle === etat.tri ? " selected" : ""}>${t.libelle}</option>`).join("")}</select></label>` : ""}
          </div>
          <div class="pastilles-actives"></div>
          <div class="explo-liste"></div>
        </section></div></div>`;
    const $ = (s) => racine.querySelector(s);
    const passe = (x, sauf) => cfg.facettes.every((f) => f.cle === sauf || !etat[f.cle].length || valeursDe(f, x).some((v) => etat[f.cle].includes(v)));
    const mots = () => norm(etat.q).split(" ").filter(Boolean);
    const texteOk = (x, m) => !m.length || contient(norm(cfg.recherche.texte(x)), m);
    function comptes(f, m) {
      const n = new Map();
      cfg.lignes.forEach((x) => { if (texteOk(x, m) && passe(x, f.cle)) valeursDe(f, x).forEach((v) => n.set(v, (n.get(v) || 0) + 1)); });
      return n;
    }
    function trieValeurs(f, n) {
      const v = [...new Set([...n.keys(), ...etat[f.cle]])];
      if (f.ordre) return v.sort(f.ordre);
      return v.sort((a, b) => (n.get(b) || 0) - (n.get(a) || 0) || String(a).localeCompare(String(b), "fr"));
    }
    function dessinerFacettes(m) {
      $(".vf-facettes").innerHTML = cfg.facettes.map((f) => {
        const n = comptes(f, m), vals = trieValeurs(f, n), lim = f.max || 8, ouvert = racine.querySelector(`[data-tout="${f.cle}"]`)?.dataset.ouvert === "1";
        if (!vals.length) return "";
        const montre = ouvert ? vals : vals.slice(0, lim);
        return `<fieldset class="facette"><legend>${esc(f.titre)}</legend>
          ${montre.map((v) => `<label class="case-f${n.get(v) ? "" : " vide"}"><input type="checkbox" data-f="${f.cle}" value="${esc(v)}"${etat[f.cle].includes(v) ? " checked" : ""}>
            ${f.pastille ? f.pastille(v) : ""}<span class="lib">${esc(libelle(f, v))}</span><span class="n">${n.get(v) || 0}</span></label>`).join("")}
          ${vals.length > lim ? `<button type="button" class="lien-bouton" data-tout="${f.cle}" data-ouvert="${ouvert ? 1 : 0}">${ouvert ? "Moins" : `Voir les ${vals.length}`}</button>` : ""}</fieldset>`;
      }).join("");
    }
    function dessinerEntonnoir(m) {
      if (!cfg.entonnoir) return;
      const etapes = cfg.entonnoir.map((k) => cfg.facettes.find((f) => f.cle === k));
      const prochaine = etapes.find((f) => !etat[f.cle].length);
      const fil = [`<button type="button" class="etape" data-retour="0">${esc(cfg.entonnoirRacine || "Tout")}</button>`];
      etapes.forEach((f, i) => { if (etat[f.cle].length) fil.push(`<button type="button" class="etape" data-retour="${i + 1}">${esc(etat[f.cle].map((v) => libelle(f, v)).join(", "))}</button>`); });
      let tuiles = "";
      if (prochaine) {
        const n = comptes(prochaine, m), vals = trieValeurs(prochaine, n).filter((v) => n.get(v)).slice(0, cfg.tuilesMax || 8);
        tuiles = `<p class="entonnoir-question">${esc(prochaine.question || prochaine.titre)}</p><div class="tuiles">${vals.map((v) => `<button type="button" class="tuile" data-entonnoir="${prochaine.cle}" data-v="${esc(v)}"${prochaine.famille ? ` data-f="${prochaine.famille(v)}"` : ""}>
          <span class="tuile-n">${n.get(v)}</span><span class="tuile-lib">${esc(libelle(prochaine, v))}</span>${prochaine.detail ? `<small>${esc(prochaine.detail(v))}</small>` : ""}</button>`).join("")}</div>`;
      }
      $(".entonnoir").innerHTML = `<div class="fil-entonnoir">${fil.join('<span class="sep" aria-hidden="true">›</span>')}</div>${tuiles}`;
    }
    function dessinerPastilles() {
      const p = [];
      if (etat.q) p.push(`<button type="button" class="pastille-active" data-efface="q">« ${esc(etat.q)} »<span aria-hidden="true">×</span><span class="sr">Effacer</span></button>`);
      cfg.facettes.forEach((f) => etat[f.cle].forEach((v) => p.push(`<button type="button" class="pastille-active" data-efface="${f.cle}" data-v="${esc(v)}"><small>${esc(f.titre)}</small> ${esc(libelle(f, v))}<span aria-hidden="true">×</span><span class="sr">Effacer</span></button>`)));
      $(".pastilles-actives").innerHTML = p.join("");
      const nb = p.length;
      $(".vf-n").textContent = nb ? ` (${nb})` : "";
      $(".vf-raz").hidden = !nb;
    }
    function maj(garderPage) {
      if (!garderPage) etat.p = 1;
      const m = mots();
      let r = cfg.lignes.filter((x) => texteOk(x, m) && passe(x));
      const t = cfg.tris && cfg.tris.find((x) => x.cle === etat.tri);
      if (t) r = r.slice().sort(t.f);
      $(".explo-n").textContent = cfg.compte(r.length, cfg.lignes.length);
      $(".vf-voir").textContent = `Voir ${r.length > 1 ? "les " + r.length + " résultats" : r.length ? "le résultat" : "les résultats"}`;
      dessinerFacettes(m);
      dessinerEntonnoir(m);
      dessinerPastilles();
      const el = $(".explo-liste");
      if (!r.length) el.innerHTML = `<div class="vide">${cfg.vide || "Rien ne correspond à ces filtres."}</div>`;
      else if (cfg.pagine) {
        const PAR = cfg.pagine, nb = Math.max(1, Math.ceil(r.length / PAR));
        etat.p = Math.min(etat.p, nb);
        el.innerHTML = (cfg.groupe ? groupeListe(r.slice((etat.p - 1) * PAR, etat.p * PAR)) : `<div class="liste">${r.slice((etat.p - 1) * PAR, etat.p * PAR).map(cfg.rendu).join("")}</div>`) +
          (nb > 1 ? `<div class="pagination"><button class="bouton second" data-page="-1"${etat.p <= 1 ? " disabled" : ""}>Page précédente</button><span>Page ${etat.p} sur ${nb}</span><button class="bouton second" data-page="1"${etat.p >= nb ? " disabled" : ""}>Page suivante</button></div>` : "");
      } else listeRepliable(el, r, cfg.rendu, cfg.pas || 30);
      const u = { q: etat.q, tri: cfg.tris && etat.tri !== cfg.tris[0].cle ? etat.tri : "", p: etat.p > 1 ? String(etat.p) : "" };
      cfg.facettes.forEach((f) => (u[f.cle] = etat[f.cle]));
      etatUrl(u);
      if (cfg.apres) cfg.apres(r, etat);
    }
    function groupeListe(r) {
      let cle = "", h = "";
      r.forEach((x) => { const g = cfg.groupe(x); if (g !== cle) { h += `<div class="annee">${esc(g)}</div>`; cle = g; } h += cfg.rendu(x); });
      return `<div class="liste">${h}</div>`;
    }
    let attente;
    $(".vf-q").addEventListener("input", (e) => { clearTimeout(attente); attente = setTimeout(() => { etat.q = e.target.value.trim(); maj(); }, 120); });
    racine.addEventListener("change", (e) => {
      const c = e.target.closest("input[data-f]");
      if (c) { const k = c.dataset.f; etat[k] = c.checked ? [...etat[k], c.value] : etat[k].filter((v) => v !== c.value); maj(); }
      if (e.target.closest(".explo-tri select")) { etat.tri = e.target.value; maj(); }
    });
    racine.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.entonnoir) { etat[b.dataset.entonnoir] = [b.dataset.v]; maj(); }
      else if (b.dataset.retour != null) { cfg.entonnoir.slice(Number(b.dataset.retour)).forEach((k) => (etat[k] = [])); maj(); }
      else if (b.dataset.efface) {
        if (b.dataset.efface === "q") { etat.q = ""; $(".vf-q").value = ""; } else etat[b.dataset.efface] = etat[b.dataset.efface].filter((v) => v !== b.dataset.v);
        maj();
      } else if (b.dataset.tout) { b.dataset.ouvert = b.dataset.ouvert === "1" ? "0" : "1"; dessinerFacettes(mots()); }
      else if (b.classList.contains("vf-raz")) { etat.q = ""; $(".vf-q").value = ""; cfg.facettes.forEach((f) => (etat[f.cle] = [])); maj(); }
      else if (b.dataset.page) { etat.p += Number(b.dataset.page); maj(true); racine.scrollIntoView({ block: "start" }); }
      else if (b.classList.contains("vf-ouvrir")) { racine.querySelector(".explorateur").classList.add("filtres-ouverts"); b.setAttribute("aria-expanded", "true"); $(".vf-q").focus(); }
      else if (b.classList.contains("vf-fermer") || b.classList.contains("vf-voir")) { racine.querySelector(".explorateur").classList.remove("filtres-ouverts"); $(".vf-ouvrir").setAttribute("aria-expanded", "false"); $(".vf-ouvrir").focus(); }
    });
    racine.querySelector(".vf-voile").addEventListener("click", () => racine.querySelector(".vf-fermer").click());
    maj(true);
    return { etat, maj };
  }

  // ------------------------------------------------------------ en-tête, pied, recherche
  // Le bandeau ne garde que quatre entrées ; les rubriques se rangent dans trois menus.
  const MENUS = [
    { titre: "Carte", page: "index.html" },
    { titre: "Territoire", pages: [
      ["communes.html", "Communes", "Les 360 communes, leurs élus, sites et monuments"],
      ["elus.html", "Élus", "Assemblée de Corse, parlementaires, maires"],
      ["sites.html", "Sites et patrimoine", "Installations sensibles, équipements, monuments"],
    ] },
    { titre: "Actualité", pages: [
      ["dossiers.html", "Dossiers", "Les sujets suivis, avec chronologie et protagonistes"],
      ["chronologie.html", "Chronologie", "Les faits datés, du plus récent au plus ancien"],
      ["agenda.html", "Agenda", "Échéances et rendez-vous à préparer"],
      ["articles.html", "Articles", "La revue de presse fichée"],
    ] },
    { titre: "Ressources", pages: [
      ["repertoire.html", "Répertoire", "Personnes et organisations, fonctions vérifiées"],
      ["documents.html", "Documents", "Insee, contrôles financiers, textes officiels"],
      ["notes.html", "Notes de synthèse", "Les synthèses de la documentation"],
      ["drones.html", "Images drone", "Séquences aériennes par commune"],
      ["a-propos.html", "Méthode et limites", "D'où viennent les données, ce qu'elles valent"],
    ] },
  ];
  function entete() {
    const ici = (location.pathname.split("/").pop() || "index.html").replace(/^$/, "index.html");
    const famille = { "commune.html": "communes.html", "personne.html": "repertoire.html", "dossier.html": "dossiers.html", "note.html": "notes.html" };
    const actif = famille[ici] || ici;
    const presente = ([p]) => (p !== "notes.html" || D.notes.length) && (p !== "elus.html" || O.elus) && (p !== "sites.html" || SITES.length);
    const h = document.createElement("header");
    h.className = "entete";
    h.innerHTML = `<a class="marque" href="index.html"><img src="assets/france3corse-viastella.png" alt="France 3 Corse ViaStella"><span class="marque-titre">Base de connaissances Corse</span></a>
      <nav class="nav" aria-label="Rubriques du site">${MENUS.map((m, i) => {
        if (m.page) return `<a class="nav-lien" href="${m.page}"${m.page === actif ? ' aria-current="page"' : ""}>${m.titre}</a>`;
        const pages = m.pages.filter(presente), ouvert = pages.some(([p]) => p === actif);
        return `<div class="nav-groupe${ouvert ? " courant" : ""}">
          <button type="button" class="nav-bouton" aria-expanded="false" aria-controls="menu-${i}">${m.titre}<span class="chevron" aria-hidden="true"></span></button>
          <div class="menu" id="menu-${i}" hidden>${pages.map(([p, t, d]) => `<a href="${p}"${p === actif ? ' aria-current="page"' : ""}><b>${t}</b><small>${d}</small></a>`).join("")}</div></div>`;
      }).join("")}</nav>
      <div class="recherche" role="search"><label class="sr" for="q-globale">Chercher dans toute la base</label>
        <input id="q-globale" type="search" placeholder="Chercher un nom, une commune, un dossier" autocomplete="off">
        <div class="resultats" hidden></div></div>`;
    // Menus : clic ou survol (souris), Échap pour refermer, flèches pour parcourir
    const groupes = [...h.querySelectorAll(".nav-groupe")];
    const fermerMenus = (sauf) => groupes.forEach((g) => { if (g !== sauf) { g.querySelector(".menu").hidden = true; g.querySelector(".nav-bouton").setAttribute("aria-expanded", "false"); } });
    const ouvrirMenu = (g, focus) => {
      fermerMenus(g);
      g.querySelector(".menu").hidden = false;
      g.querySelector(".nav-bouton").setAttribute("aria-expanded", "true");
      if (focus) g.querySelector(".menu a").focus();
    };
    groupes.forEach((g) => {
      const b = g.querySelector(".nav-bouton");
      b.addEventListener("click", () => (g.querySelector(".menu").hidden ? ouvrirMenu(g) : fermerMenus()));
      b.addEventListener("keydown", (e) => { if (e.key === "ArrowDown") { e.preventDefault(); ouvrirMenu(g, true); } });
      g.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse" && matchMedia("(min-width: 761px)").matches) ouvrirMenu(g); });
      g.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse" && matchMedia("(min-width: 761px)").matches) fermerMenus(); });
      g.querySelector(".menu").addEventListener("keydown", (e) => {
        const l = [...g.querySelectorAll(".menu a")], i = l.indexOf(document.activeElement);
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); l[(i + (e.key === "ArrowDown" ? 1 : -1) + l.length) % l.length].focus(); }
        if (e.key === "Escape") { fermerMenus(); b.focus(); }
      });
    });
    document.addEventListener("click", (e) => { if (!e.target.closest(".nav-groupe")) fermerMenus(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") fermerMenus(); });
    document.body.prepend(h);
    recherche(h.querySelector("#q-globale"), h.querySelector(".resultats"));
    const p = document.createElement("footer");
    p.className = "pied";
    const m = D.meta;
    p.innerHTML = `<span>Maquette de démonstration, document de travail non officiel.</span>
      <span>Données exportées de Notion le ${esc(dateFr(m.exporteLe))}.</span>
      <span>${m.profil === "public" ? "Version publiable : justice, faits divers et notes internes exclus." : "Version complète, à usage interne : ne pas publier."}</span>
      <span><a href="a-propos.html">Méthode et limites</a></span>`;
    document.body.append(p);

    // Retour en haut, sur les pages longues
    const haut = document.createElement("button");
    haut.type = "button";
    haut.className = "haut";
    haut.setAttribute("aria-label", "Revenir en haut de la page");
    haut.innerHTML = "↑";
    haut.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
    document.body.append(haut);
    const suivre = () => haut.classList.toggle("visible", window.scrollY > 700);
    window.addEventListener("scroll", suivre, { passive: true });
    suivre();

    // « / » place le curseur dans la recherche, comme sur la plupart des outils documentaires
    document.addEventListener("keydown", (e) => {
      const t = e.target;
      if (e.key !== "/" || e.ctrlKey || e.metaKey || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable) return;
      e.preventDefault();
      h.querySelector("#q-globale").focus();
    });
    h.querySelector("#q-globale").setAttribute("placeholder", "Chercher (raccourci : /)");
  }

  const contient = (texte, mots) => mots.every((m) => texte.includes(m));
  const ELUS_PLATS = Object.entries(ELUS.communes || {}).flatMap(([code, l]) => l.map((x) => ({ ...x, code })));
  function chercher(q, max = 5) {
    const mots = norm(q).split(" ").filter(Boolean);
    if (!mots.length) return [];
    const groupes = [
      ["Communes", D.communes, (c) => `${c.nom} ${c.nomCorse} ${c.cp} ${c.code}`, (c) => [url.commune(c.code), c.nom, `${c.dep}, ${c.epci}`]],
      ["Répertoire", D.personnes, (p) => `${p.nom} ${p.variantes || ""} ${p.fonction} ${p.rattachement}`, (p) => [url.personne(p.id), p.nom, p.fonction]],
      ["Dossiers", D.dossiers, (d) => `${d.titre} ${d.motsCles || ""} ${d.resume}`, (d) => [url.dossier(d.id), d.titre, d.rubrique]],
      ["Notes", D.notes, (n) => n.titre, (n) => [url.note(n.id), n.titre, n.type]],
      ["Maires et adjoints", ELUS_PLATS, (x) => `${x.nom} ${x.prenom}`, (x) => [url.commune(x.code), nomAffiche({ nature: "Personne", nom: `${x.nom} ${x.prenom}` }), `${fonctionRne(x.fonction)}, ${(I.commune.get(x.code) || {}).nom || ""}`]],
      ["Documents de référence", D.documents, (d) => `${d.titre} ${d.producteur} ${d.numero} ${(d.themes || []).join(" ")}`, (d) => [`documents.html?q=${encodeURIComponent(q)}`, d.titre, `${d.producteur}${d.date ? ", " + dateFr(d.date) : ""}`]],
      ["Sites et équipements", SITES, (x) => `${x.nom} ${x.categorie} ${(I.commune.get(x.commune) || {}).nom || ""}`, (x) => [`sites.html?q=${encodeURIComponent(q)}`, x.nom, `${x.categorie}, ${(I.commune.get(x.commune) || {}).nom || ""}`]],
      ["Faits datés", D.faits, (f) => f.titre, (f) => [`chronologie.html?q=${encodeURIComponent(q)}`, f.titre, dateFr(f.date, f.precision)]],
      ["Articles", D.articles, (a) => `${a.titre} ${a.retenir || ""}`, (a) => [`articles.html?q=${encodeURIComponent(q)}`, a.titre, `${a.source}${a.date ? ", " + dateFr(a.date) : ""}`]],
    ];
    return groupes
      .map(([titre, liste, texte, rendu]) => {
        const t = liste.filter((x) => contient(norm(texte(x)), mots));
        // un nom qui commence par la requête passe devant
        t.sort((a, b) => Number(norm(texte(b)).startsWith(mots[0])) - Number(norm(texte(a)).startsWith(mots[0])));
        return { titre, total: t.length, lignes: t.slice(0, max).map(rendu) };
      })
      .filter((g) => g.total);
  }
  function recherche(champ, boite) {
    let actif = -1;
    const fermer = () => {
      boite.hidden = true;
      actif = -1;
    };
    champ.addEventListener("input", () => {
      const q = champ.value.trim();
      if (q.length < 2) return fermer();
      const g = chercher(q);
      boite.innerHTML = g.length
        ? g
            .map(
              (x) =>
                `<h4>${x.titre} (${x.total})</h4>` +
                x.lignes.map(([h, t, s]) => `<a href="${h}">${esc(t)}<small>${esc((s || "").slice(0, 110))}</small></a>`).join("")
            )
            .join("")
        : `<div class="vide">Aucun résultat pour « ${esc(q)} ». La recherche porte sur les noms, les titres et les mots-clés, sans tenir compte des accents.</div>`;
      boite.hidden = false;
      actif = -1;
    });
    champ.addEventListener("keydown", (e) => {
      const l = [...boite.querySelectorAll("a")];
      if (e.key === "Escape") return fermer();
      if (!l.length || boite.hidden) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        actif = (actif + (e.key === "ArrowDown" ? 1 : -1) + l.length) % l.length;
        l.forEach((a, i) => a.classList.toggle("actif", i === actif));
        l[actif].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") {
        location.href = (l[actif] || l[0]).href;
      }
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".recherche")) fermer();
    });
  }

  /** Garde les filtres d'une page dans l'adresse, pour qu'un lien copié rouvre la même vue. */
  function etatUrl(etat) {
    const p = new URLSearchParams();
    Object.entries(etat).forEach(([k, v]) => {
      if (Array.isArray(v) ? v.length : v) p.set(k, Array.isArray(v) ? v.join("|") : v);
    });
    const s = p.toString();
    history.replaceState(null, "", location.pathname + (s ? "?" + s : ""));
  }

  window.KB = {
    D, I, liens, esc, norm, riche, param, pluriel, dateFr, dateCourte, aujourdHui, joursAvant,
    FAMILLES, RUBRIQUES, familleDe, rub, url, lienCommune, lienPersonne, lienDossier, nomAffiche,
    rangFait, rangArticle, rangAgenda, rangRole, rangPersonne, rangDrone, carteDossier, listeRepliable,
    parDate, parDateCroissante, contient, etatUrl, etiqFiabilite, entete,
    image, vignette, credit, frise, ouvrirPanneau, fermerPanneau, MOIS,
    O, ELUS, SITES, LIEUX, OUV_PERS, sitesDe, lieuxDe, epciNom, fonctionRne, nomElu, ficheElu, circoDe,
    FAMILLES_SITES, familleSite, etatSite, rangSite, rangDocument, carrousel, initCarrousels, explorateur, notesDuDocument,
  };
  entete();
})();
