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
  };
  const vide = () => ({ faits: [], articles: [], agenda: [], roles: [], notes: [], drones: [], dossiers: [], personnes: [] });
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
    const nom = m[1].trim().toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (x, a, b) => a + b.toUpperCase());
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

  function rangPersonne(p) {
    return `<div class="rang">
      <div class="quand">${esc(p.nature)}</div>
      <div class="quoi">
        <div class="intitule"><a href="${url.personne(p.id)}">${esc(p.nom)}</a></div>
        ${p.fonction ? `<div class="complement">${riche(p.fonction)}</div>` : ""}
        <div class="meta">${(p.qualite || []).map((q) => `<span class="etiq">${esc(q)}</span>`).join("")}
          ${p.rattachement ? `<span>${esc(p.rattachement)}</span>` : ""}
          ${p.pron ? `<span>Se prononce : ${esc(p.pron)}</span>` : ""}
          ${p.verifieLe ? `<span class="etiq ok">Vérifiée le ${esc(dateCourte(p.verifieLe))}</span>` : `<span class="etiq attention">Fiche non vérifiée</span>`}</div>
      </div></div>`;
  }

  function carteDossier(d) {
    const l = liens("dossier", d.id);
    return `<a class="carte-dossier" data-f="${familleDe[d.rubrique] || ""}" href="${url.dossier(d.id)}">
      <b>${esc(d.titre)}</b><span class="res">${esc(d.resume)}</span>
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

  // ------------------------------------------------------------ en-tête, pied, recherche
  const PAGES = [
    ["index.html", "Carte"],
    ["communes.html", "Communes"],
    ["chronologie.html", "Chronologie"],
    ["agenda.html", "Agenda"],
    ["dossiers.html", "Dossiers"],
    ["repertoire.html", "Répertoire"],
    ["articles.html", "Articles"],
    ["notes.html", "Notes"],
    ["drones.html", "Images drone"],
    ["a-propos.html", "Méthode"],
  ];
  function entete() {
    const ici = (location.pathname.split("/").pop() || "index.html").replace(/^$/, "index.html");
    const famille = { "commune.html": "communes.html", "personne.html": "repertoire.html", "dossier.html": "dossiers.html", "note.html": "notes.html" };
    const actif = famille[ici] || ici;
    const h = document.createElement("header");
    h.className = "entete";
    h.innerHTML = `<a class="marque" href="index.html"><img src="assets/france3corse-viastella.png" alt="France 3 Corse ViaStella"><span class="marque-titre">Base de connaissances Corse</span></a>
      <nav class="nav" aria-label="Rubriques du site">${PAGES.filter(([p]) => p !== "notes.html" || D.notes.length)
        .map(([p, t]) => `<a href="${p}"${p === actif ? ' aria-current="page"' : ""}>${t}</a>`)
        .join("")}</nav>
      <div class="recherche" role="search"><label class="sr" for="q-globale">Chercher dans toute la base</label>
        <input id="q-globale" type="search" placeholder="Chercher un nom, une commune, un dossier" autocomplete="off">
        <div class="resultats" hidden></div></div>`;
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
  }

  const contient = (texte, mots) => mots.every((m) => texte.includes(m));
  function chercher(q, max = 5) {
    const mots = norm(q).split(" ").filter(Boolean);
    if (!mots.length) return [];
    const groupes = [
      ["Communes", D.communes, (c) => `${c.nom} ${c.nomCorse} ${c.cp} ${c.code}`, (c) => [url.commune(c.code), c.nom, `${c.dep}, ${c.epci}`]],
      ["Répertoire", D.personnes, (p) => `${p.nom} ${p.variantes || ""} ${p.fonction} ${p.rattachement}`, (p) => [url.personne(p.id), p.nom, p.fonction]],
      ["Dossiers", D.dossiers, (d) => `${d.titre} ${d.motsCles || ""} ${d.resume}`, (d) => [url.dossier(d.id), d.titre, d.rubrique]],
      ["Notes", D.notes, (n) => n.titre, (n) => [url.note(n.id), n.titre, n.type]],
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
  };
  entete();
})();
