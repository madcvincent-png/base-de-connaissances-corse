/* Pages de consultation : communes, chronologie, agenda, dossiers, répertoire, articles, notes, images drone, méthode. */
(function () {
  "use strict";
  const K = window.KB, D = K.D, e = K.esc;
  const page = document.body.dataset.page;
  const main = document.getElementById("page");
  const $ = (s, r = document) => r.querySelector(s);
  const options = (valeurs, choix, tous) =>
    `<option value="">${tous}</option>` + valeurs.map((v) => `<option${v === choix ? " selected" : ""}>${e(v)}</option>`).join("");
  const uniques = (liste, f) => [...new Set(liste.flatMap((x) => [].concat(f(x))).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  const champ = (id, label, html, large) => `<div class="champ${large ? " large" : ""}"><label for="${id}">${label}</label>${html}</div>`;
  const texte = (id, label, val, ph) => champ(id, label, `<input id="${id}" type="search" value="${e(val)}" placeholder="${e(ph || "")}">`, true);
  const liste = (id, label, valeurs, choix, tous) => champ(id, label, `<select id="${id}">${options(valeurs, choix, tous)}</select>`);
  const caseA = (id, label, coche) => `<label class="case"><input id="${id}" type="checkbox"${coche ? " checked" : ""}>${label}</label>`;
  const bloc = (titre, n, id) => `<section class="bloc"><h2>${titre}${n != null ? ` <span class="compte">${n}</span>` : ""}</h2><div id="${id}"></div></section>`;
  const repere = (dt, dd) => (dd ? `<div><dt>${dt}</dt><dd>${dd}</dd></div>` : "");
  const introuvable = (quoi) => {
    main.innerHTML = `<div class="vide">${quoi} est introuvable dans cette version de la base. <a href="index.html">Revenir à la carte</a></div>`;
  };
  const ecoute = (ids, f) => ids.forEach((i) => $("#" + i) && $("#" + i).addEventListener($("#" + i).type === "search" ? "input" : "change", f));
  const mots = (q) => K.norm(q).split(" ").filter(Boolean);

  const PAGES = {
    // ---------------------------------------------------------------- communes
    communes() {
      const s = { q: K.param("q"), dep: K.param("dep"), epci: K.param("epci"), doc: K.param("doc") === "1", tri: K.param("tri") || "pop" };
      const stats = (c) => K.liens("commune", c.code);
      main.innerHTML = `<div class="titre-page"><h1>Communes</h1><span class="compte" id="n"></span></div>
        <p class="chapo">Les 360 communes de Corse, avec ce que la base contient sur chacune. La fiche d'une commune rassemble ses élus, les faits datés, l'agenda, les articles et les images drone.</p>
        <div class="filtres">${texte("q", "Nom, code postal ou code Insee", s.q, "Sartène, 20100, 2A272")}
          ${liste("dep", "Département", uniques(D.communes, (c) => c.dep), s.dep, "Les deux")}
          ${liste("epci", "Intercommunalité", uniques(D.communes, (c) => c.epci), s.epci, "Toutes")}
          ${champ("tri", "Classer par", `<select id="tri"><option value="pop">Population</option><option value="nom">Nom</option><option value="doc">Volume documenté</option></select>`)}
          ${caseA("doc", "Seulement les communes documentées", s.doc)}</div><div id="liste"></div>`;
      $("#tri").value = s.tri;
      const poids = (c) => { const l = stats(c); return l.faits.length + l.articles.length + l.agenda.length + l.roles.length; };
      const maj = () => {
        Object.assign(s, { q: $("#q").value, dep: $("#dep").value, epci: $("#epci").value, doc: $("#doc").checked, tri: $("#tri").value });
        const m = mots(s.q);
        const r = D.communes
          .filter((c) => (!s.dep || c.dep === s.dep) && (!s.epci || c.epci === s.epci) && (!s.doc || poids(c) > 0) && K.contient(K.norm(`${c.nom} ${c.nomCorse} ${c.cp} ${c.code}`), m))
          .sort(s.tri === "nom" ? (a, b) => a.nom.localeCompare(b.nom, "fr") : s.tri === "doc" ? (a, b) => poids(b) - poids(a) || b.pop - a.pop : (a, b) => b.pop - a.pop);
        $("#n").textContent = K.pluriel(r.length, "commune");
        K.listeRepliable($("#liste"), r, (c) => {
          const l = stats(c);
          const d = [[l.roles.length, "mandat ou rôle", "mandats ou rôles"], [l.faits.length, "fait daté", "faits datés"], [l.agenda.length, "événement à venir", "événements à l'agenda"], [l.articles.length, "article"], [l.drones.length, "séquence drone", "séquences drone"]]
            .filter(([n]) => n).map(([n, u, p]) => `<span>${K.pluriel(n, u, p)}</span>`).join("");
          return `<div class="rang"><div class="quand num">${c.pop != null ? c.pop.toLocaleString("fr-FR") + " hab." : ""}</div><div class="quoi">
            <div class="intitule"><a href="${K.url.commune(c.code)}">${e(c.nom)}</a></div>
            <div class="meta"><span class="etiq">${e(c.code)}</span><span>${e(c.dep)}</span><span>${e(c.epci)}</span>${d || "<span>Rien dans la base</span>"}</div></div></div>`;
        }, 40);
        K.etatUrl({ q: s.q, dep: s.dep, epci: s.epci, doc: s.doc ? "1" : "", tri: s.tri === "pop" ? "" : s.tri });
      };
      ecoute(["q", "dep", "epci", "doc", "tri"], maj);
      maj();
    },

    // ---------------------------------------------------------------- fiche commune
    commune() {
      const c = K.I.commune.get(K.param("code") || K.param("id"));
      if (!c) return introuvable("Cette commune");
      document.title = `${c.nom} — Base de connaissances Corse`;
      const l = K.liens("commune", c.code);
      const roles = l.roles.slice().sort((a, b) => Number(b.actuel) - Number(a.actuel) || (b.debut || "").localeCompare(a.debut || ""));
      const maire = roles.find((r) => r.actuel && /^maire\b/i.test(r.mandat || ""));
      main.innerHTML = `<p class="fil"><a href="communes.html">Communes</a> / ${e(c.epci)}</p>
        <div class="fiche-entete"><div class="sur"><span class="etiq plein">${e(c.code)}</span><span class="etiq">${e(c.dep)}</span><span class="etiq">${e(c.epci)}</span></div>
          <h1>${e(c.nom)}</h1>
          <p class="sous">${c.pop != null ? c.pop.toLocaleString("fr-FR") + " habitants" : ""}${c.nomCorse ? `. En corse : ${e(c.nomCorse)}` : ""}${c.pron ? `. Se prononce ${e(c.pron)}` : ""}${
            maire ? `. Maire : ${maire.personnes.map(K.lienPersonne).join(", ")}` : ""}</p></div>
        <div class="fiche"><div>
          ${bloc("Mandats, fonctions et rôles", roles.length, "roles")}
          ${bloc("Faits datés", l.faits.length, "faits")}
          ${l.agenda.length ? bloc("Agenda", l.agenda.length, "agenda") : ""}
          ${bloc("Articles", l.articles.length, "articles")}
          ${l.drones.length ? bloc("Images drone", l.drones.length, "drones") : ""}
        </div><aside>
          <section class="bloc"><div class="mini-carte" id="mini"></div>
            <dl class="reperes">${repere("Code Insee", e(c.code))}${repere("Département", e(c.dep))}${repere("Intercommunalité", e(c.epci))}
              ${repere("Population", c.pop != null ? c.pop.toLocaleString("fr-FR") + " habitants" : "")}${repere("Codes postaux", e(c.cp))}
              ${repere("Nom corse", e(c.nomCorse) || '<span class="discret">Non renseigné</span>')}${repere("Prononciation pour l'antenne", e(c.pron) || '<span class="discret">Non renseignée</span>')}
              ${repere("Centre géographique", `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}`)}</dl>
            <div class="corps"><a class="bouton second" href="index.html?commune=${c.code}">Voir sur la carte</a></div></section>
          ${c.maireSortant2026 && !maire ? `<section class="bloc"><h2>Archive des municipales</h2><div class="corps"><p>Maire sortant à la veille du scrutin de mars 2026 : <b>${e(c.maireSortant2026)}</b>.</p>
            <p class="discret">Compilation de la rédaction arrêtée en février 2026. Le maire élu en 2026 n'est pas encore renseigné dans la base : ne pas reprendre ce nom au présent sans vérifier.</p></div></section>` : ""}
        </aside></div>`;
      K.listeRepliable($("#roles"), roles, (r) => K.rangRole(r), 8);
      K.listeRepliable($("#faits"), l.faits.slice().sort(K.parDate), (f) => K.rangFait(f, { sansLieu: true }), 10);
      if (l.agenda.length) K.listeRepliable($("#agenda"), l.agenda.slice().sort(K.parDateCroissante), (x) => K.rangAgenda(x), 10);
      K.listeRepliable($("#articles"), l.articles.slice().sort(K.parDate), (a) => K.rangArticle(a), 10);
      if (l.drones.length) K.listeRepliable($("#drones"), l.drones.slice().sort(K.parDate), (d) => K.rangDrone(d, { sansLieu: true }), 8);
      if (!roles.length) $("#roles").innerHTML = `<div class="vide">Aucun mandat ni rôle rattaché à cette commune. La base n'en compte encore que ${D.roles.length} pour toute la Corse.</div>`;
      if (window.L && window.KB_GEO) {
        const L = window.L, m = L.map("mini", { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, zoomSnap: 0.1 });
        const g = L.geoJSON(window.KB_GEO.communes, { interactive: false, style: (f) => f.properties.code === c.code ? { fillColor: "#2e83df", fillOpacity: 1, color: "#202020", weight: 1.5 } : { fillColor: "#fff", fillOpacity: 1, color: "#b4c0c9", weight: 0.4 } }).addTo(m);
        m.fitBounds(g.getBounds(), { padding: [8, 8] });
      }
    },

    // ---------------------------------------------------------------- chronologie
    chronologie() {
      const s = { q: K.param("q"), rub: K.param("rub"), type: K.param("type"), dossier: K.param("dossier"), jalons: K.param("jalons") === "1" };
      const dossiers = D.dossiers.filter((d) => K.liens("dossier", d.id).faits.length);
      main.innerHTML = `<div class="titre-page"><h1>Chronologie</h1><span class="compte" id="n"></span></div>
        <p class="chapo">Les faits datés relevés dans la presse, du plus récent au plus ancien. La date est celle du fait, jamais celle de l'article. Le losange jaune signale un jalon majeur.</p>
        <div class="filtres">${texte("q", "Mot du titre", s.q, "Simeoni, Sénat, grève")}
          ${liste("rub", "Rubrique", uniques(D.faits, (f) => f.rubrique), s.rub, "Toutes")}
          ${liste("type", "Nature du fait", uniques(D.faits, (f) => f.type), s.type, "Toutes")}
          ${champ("dossier", "Dossier", `<select id="dossier"><option value="">Tous</option>${dossiers.map((d) => `<option value="${d.id}"${d.id === s.dossier ? " selected" : ""}>${e(d.titre)}</option>`).join("")}</select>`)}
          ${caseA("jalons", "Jalons majeurs seulement", s.jalons)}</div><div id="liste"></div>`;
      const maj = () => {
        Object.assign(s, { q: $("#q").value, rub: $("#rub").value, type: $("#type").value, dossier: $("#dossier").value, jalons: $("#jalons").checked });
        const m = mots(s.q);
        const r = D.faits.filter((f) => (!s.rub || f.rubrique === s.rub) && (!s.type || f.type === s.type) && (!s.dossier || f.dossiers.includes(s.dossier)) && (!s.jalons || f.jalon) && K.contient(K.norm(f.titre), m)).sort(K.parDate);
        $("#n").textContent = `${K.pluriel(r.length, "fait daté", "faits datés")} sur ${D.faits.length}`;
        let an = "", h = "";
        r.forEach((f) => {
          const a = (f.date || "").slice(0, 4) || "Sans date";
          if (a !== an) { h += `<div class="annee">${a}</div>`; an = a; }
          h += K.rangFait(f);
        });
        $("#liste").innerHTML = r.length ? `<div class="liste">${h}</div>` : `<div class="vide">Aucun fait daté ne correspond à ces filtres.</div>`;
        K.etatUrl({ q: s.q, rub: s.rub, type: s.type, dossier: s.dossier, jalons: s.jalons ? "1" : "" });
      };
      ecoute(["q", "rub", "type", "dossier", "jalons"], maj);
      maj();
    },

    // ---------------------------------------------------------------- agenda
    agenda() {
      const auj = K.aujourdHui();
      const venir = D.agenda.filter((x) => (x.date || "").slice(0, 10) >= auj).sort(K.parDateCroissante);
      const passes = D.agenda.filter((x) => (x.date || "").slice(0, 10) < auj).sort(K.parDate);
      const echeances = D.dossiers.filter((d) => d.echeance && d.echeance >= auj && !K.liens("dossier", d.id).agenda.length);
      main.innerHTML = `<div class="titre-page"><h1>Agenda prévisionnel</h1><span class="compte">${K.pluriel(venir.length, "événement à venir", "événements à venir")}</span></div>
        <p class="chapo">Audiences, séances, scrutins et anniversaires à anticiper, avec ce que la documentation doit fournir avant la date. « Annoncé » signifie que la date vient de la presse et reste à confirmer à la source.</p>
        ${bloc("À venir", null, "venir")}
        ${echeances.length ? bloc("Échéances inscrites sur un dossier", echeances.length, "echeances") : ""}
        ${passes.length ? bloc("Passés", passes.length, "passes") : ""}`;
      let mois = "", h = "";
      venir.forEach((x) => {
        const m = K.dateFr(x.date, "Mois");
        if (m !== mois) { h += `<div class="annee">${m.charAt(0).toUpperCase() + m.slice(1)}</div>`; mois = m; }
        h += K.rangAgenda(x);
      });
      $("#venir").innerHTML = venir.length ? `<div class="liste">${h}</div>` : `<div class="vide">Aucun événement à venir n'est saisi. L'agenda se remplit dans Notion, base « Agenda prévisionnel ».</div>`;
      if (echeances.length) $("#echeances").innerHTML = `<div class="liste">${echeances.map((d) => `<div class="rang"><div class="quand">${K.dateFr(d.echeance)}</div><div class="quoi"><div class="intitule">${K.lienDossier(d.id)}</div><div class="complement">${e(d.natureEcheance)}</div></div></div>`).join("")}</div>`;
      if (passes.length) K.listeRepliable($("#passes"), passes, (x) => K.rangAgenda(x), 6);
    },

    // ---------------------------------------------------------------- dossiers
    dossiers() {
      const s = { q: K.param("q"), rub: K.param("rub"), type: K.param("type"), veille: K.param("veille") };
      const aVeille = D.dossiers.some((d) => d.veille);
      main.innerHTML = `<div class="titre-page"><h1>Dossiers thématiques</h1><span class="compte" id="n"></span></div>
        <p class="chapo">Chaque dossier réunit les articles, la chronologie, les protagonistes et les notes sur un même sujet : une affaire, une institution, un parcours, un thème de fond.</p>
        <div class="filtres">${texte("q", "Titre ou mot-clé", s.q, "autonomie, déchets, Bastia")}
          ${liste("rub", "Rubrique", uniques(D.dossiers, (d) => d.rubrique), s.rub, "Toutes")}
          ${liste("type", "Type de dossier", uniques(D.dossiers, (d) => d.type), s.type, "Tous")}
          ${aVeille ? liste("veille", "Niveau de veille", uniques(D.dossiers, (d) => d.veille), s.veille, "Tous") : ""}</div><div id="liste"></div>`;
      const maj = () => {
        Object.assign(s, { q: $("#q").value, rub: $("#rub").value, type: $("#type").value, veille: aVeille ? $("#veille").value : "" });
        const m = mots(s.q);
        const r = D.dossiers.filter((d) => (!s.rub || d.rubrique === s.rub) && (!s.type || d.type === s.type) && (!s.veille || d.veille === s.veille) && K.contient(K.norm(`${d.titre} ${d.motsCles || ""} ${d.resume}`), m));
        $("#n").textContent = `${K.pluriel(r.length, "dossier")} sur ${D.dossiers.length}`;
        $("#liste").innerHTML = r.length
          ? Object.entries(K.FAMILLES).map(([k, f]) => {
              const g = r.filter((d) => K.familleDe[d.rubrique] === k);
              return g.length ? `<div class="groupe-titre"><h2>${f.nom}</h2><span class="compte">${g.length}</span></div><div class="grille">${g.map(K.carteDossier).join("")}</div>` : "";
            }).join("")
          : `<div class="vide">Aucun dossier ne correspond à ces filtres.</div>`;
        K.etatUrl(s);
      };
      ecoute(["q", "rub", "type", "veille"], maj);
      maj();
    },

    // ---------------------------------------------------------------- fiche dossier
    dossier() {
      const d = K.I.dossier.get(K.param("id"));
      if (!d) return introuvable("Ce dossier");
      document.title = `${d.titre} — Base de connaissances Corse`;
      const l = K.liens("dossier", d.id);
      const gens = (d.personnes || []).map((i) => K.I.personne.get(i)).filter(Boolean);
      const periode = d.debut ? (d.fin ? `${K.dateFr(d.debut)} – ${K.dateFr(d.fin)}` : `depuis le ${K.dateFr(d.debut)}`) : "";
      const nonLus = l.articles.filter((a) => a.traitement === "À dépouiller").length;
      main.innerHTML = `<p class="fil"><a href="dossiers.html">Dossiers</a> / <a href="dossiers.html?rub=${encodeURIComponent(d.rubrique)}">${e(d.rubrique)}</a></p>
        <div class="fiche-entete"><div class="sur">${K.rub(d.rubrique)}<span class="etiq">${e(d.type)}</span>${d.veille ? `<span class="etiq${d.veille === "Veille active" ? " plein" : ""}">${e(d.veille)}</span>` : ""}${d.priorite ? `<span class="etiq">Priorité ${e(d.priorite.toLowerCase())}</span>` : ""}</div>
          <h1>${e(d.titre)}</h1><p class="sous">${e(d.resume)}</p></div>
        ${nonLus ? `<p class="avertissement">${nonLus} des ${l.articles.length} articles de ce dossier ne sont connus que par leur titre : ils n'ont pas été lus ni dépouillés.</p>` : ""}
        <div class="fiche"><div>
          ${l.notes.length ? bloc("Notes et synthèses", l.notes.length, "notes") : ""}
          ${bloc("Chronologie", l.faits.length, "faits")}
          ${l.agenda.length ? bloc("Agenda", l.agenda.length, "agenda") : ""}
          ${l.roles.length ? bloc("Mandats et rôles", l.roles.length, "roles") : ""}
          ${bloc("Articles", l.articles.length, "articles")}
        </div><aside>
          <section class="bloc"><h2>Repères</h2><dl class="reperes">${repere("Période couverte", e(periode))}
            ${repere("Prochaine échéance", d.echeance ? `${K.dateFr(d.echeance)}${d.natureEcheance ? `<br><span class="discret">${e(d.natureEcheance)}</span>` : ""}` : "")}
            ${repere("Mots-clés et variantes", e(d.motsCles))}${repere("Archives images", e(d.archivesImages))}</dl>
            ${!periode && !d.echeance && !d.motsCles ? `<div class="vide">Aucun repère saisi.</div>` : ""}</section>
          <section class="bloc"><h2>Protagonistes <span class="compte">${gens.length}</span></h2>
            ${gens.length ? `<dl class="reperes">${gens.map((p) => `<div><dd><a href="${K.url.personne(p.id)}">${e(K.nomAffiche(p))}</a></dd><dt>${e((p.fonction || p.nature).slice(0, 120))}</dt></div>`).join("")}</dl>` : `<div class="vide">Aucun protagoniste désigné.</div>`}</section>
        </aside></div>`;
      if (l.notes.length) $("#notes").innerHTML = `<div class="liste">${l.notes.map(rangNote).join("")}</div>`;
      K.listeRepliable($("#faits"), l.faits.slice().sort(K.parDateCroissante), (f) => K.rangFait(f, { sansDossier: true }), 30);
      if (l.agenda.length) K.listeRepliable($("#agenda"), l.agenda.slice().sort(K.parDateCroissante), (x) => K.rangAgenda(x, { sansDossier: true }));
      if (l.roles.length) K.listeRepliable($("#roles"), l.roles, (r) => K.rangRole(r, { sansDossier: true }));
      K.listeRepliable($("#articles"), l.articles.slice().sort(K.parDate), (a) => K.rangArticle(a, { sansDossier: true }), 15);
    },

    // ---------------------------------------------------------------- répertoire
    repertoire() {
      const s = { q: K.param("q"), nature: K.param("nature"), qualite: K.param("qualite"), av: K.param("av") === "1" };
      const variantes = D.personnes.some((p) => "variantes" in p);
      main.innerHTML = `<div class="titre-page"><h1>Répertoire</h1><span class="compte" id="n"></span></div>
        <p class="chapo">Personnes et organisations citées dans la base, avec l'intitulé exact de leur fonction${variantes ? ", les graphies fautives à éviter" : ""} et la date du dernier contrôle de la fiche. Une fonction change : une fiche non vérifiée ne se reprend pas à l'antenne sans contrôle.</p>
        <div class="filtres">${texte("q", variantes ? "Nom, variante ou fonction" : "Nom ou fonction", s.q, "Simeoni, préfet, Corsica Linea")}
          ${liste("nature", "Nature", uniques(D.personnes, (p) => p.nature), s.nature, "Toutes")}
          ${liste("qualite", "Qualité", uniques(D.personnes, (p) => p.qualite), s.qualite, "Toutes")}
          ${caseA("av", "Fiches non vérifiées seulement", s.av)}</div><div id="liste"></div>`;
      const maj = () => {
        Object.assign(s, { q: $("#q").value, nature: $("#nature").value, qualite: $("#qualite").value, av: $("#av").checked });
        const m = mots(s.q);
        const r = D.personnes.filter((p) => (!s.nature || p.nature === s.nature) && (!s.qualite || p.qualite.includes(s.qualite)) && (!s.av || !p.verifieLe) && K.contient(K.norm(`${p.nom} ${p.variantes || ""} ${p.fonction} ${p.rattachement}`), m));
        const v = D.personnes.filter((p) => p.verifieLe).length;
        $("#n").textContent = `${K.pluriel(r.length, "fiche")} sur ${D.personnes.length}, dont ${v} vérifiées`;
        K.listeRepliable($("#liste"), r, K.rangPersonne, 40);
        K.etatUrl({ q: s.q, nature: s.nature, qualite: s.qualite, av: s.av ? "1" : "" });
      };
      ecoute(["q", "nature", "qualite", "av"], maj);
      maj();
    },

    // ---------------------------------------------------------------- fiche personne
    personne() {
      const p = K.I.personne.get(K.param("id"));
      if (!p) return introuvable("Cette fiche");
      const nom = K.nomAffiche(p);
      document.title = `${nom} — Base de connaissances Corse`;
      const l = K.liens("personne", p.id);
      const dossiers = [...new Set([...l.dossiers, ...l.faits.flatMap((f) => f.dossiers.map((i) => K.I.dossier.get(i)))].filter(Boolean))];
      const roles = l.roles.slice().sort((a, b) => Number(b.actuel) - Number(a.actuel) || (b.debut || "").localeCompare(a.debut || ""));
      const vigilance = roles.some((r) => r.definitif && r.definitif.startsWith("Non"));
      main.innerHTML = `<p class="fil"><a href="repertoire.html">Répertoire</a> / ${e(p.nature)}</p>
        <div class="fiche-entete"><div class="sur"><span class="etiq plein">${e(p.nature)}</span>${p.qualite.map((q) => `<span class="etiq">${e(q)}</span>`).join("")}
          ${p.verifieLe ? `<span class="etiq ok">Fiche vérifiée le ${K.dateCourte(p.verifieLe)}</span>` : `<span class="etiq attention">Fiche non vérifiée</span>`}</div>
          <h1>${e(nom)}</h1>${p.fonction ? `<p class="sous">${K.riche(p.fonction)}</p>` : ""}</div>
        ${vigilance ? `<p class="avertissement rouge">Une procédure judiciaire est en cours et aucune décision définitive n'a été rendue : la personne est présumée innocente. Reprendre la formulation pour l'antenne indiquée ci-dessous.</p>` : ""}
        ${!p.verifieLe ? `<p class="avertissement">La fonction indiquée a été relevée dans la presse et n'a pas été contrôlée. La vérifier avant tout synthé ou lancement.</p>` : ""}
        <div class="fiche"><div>
          ${bloc("Mandats, fonctions et rôles", roles.length, "roles")}
          ${bloc("Faits datés", l.faits.length, "faits")}
          ${l.agenda.length ? bloc("Agenda", l.agenda.length, "agenda") : ""}
          ${bloc("Articles", l.articles.length, "articles")}
        </div><aside>
          <section class="bloc"><h2>Repères</h2><dl class="reperes">${repere("Nom dans la base", e(p.nom))}${repere("Rattachement", e(p.rattachement))}
            ${"pron" in p ? repere("Prononciation pour l'antenne", e(p.pron) || '<span class="discret">Non renseignée</span>') : ""}
            ${repere("Variantes et erreurs fréquentes", K.riche(p.variantes))}${repere("Repères biographiques", K.riche(p.reperes))}</dl></section>
          <section class="bloc"><h2>Dossiers <span class="compte">${dossiers.length}</span></h2>
            ${dossiers.length ? `<dl class="reperes">${dossiers.map((d) => `<div><dd>${K.lienDossier(d.id)}</dd><dt>${e(d.rubrique)}</dt></div>`).join("")}</dl>` : `<div class="vide">Aucun dossier.</div>`}</section>
        </aside></div>`;
      K.listeRepliable($("#roles"), roles, (r) => K.rangRole(r, { sansPersonne: true }));
      if (!roles.length) $("#roles").innerHTML = `<div class="vide">Aucun mandat ni rôle daté pour cette fiche. La fonction relevée figure en tête de page.</div>`;
      K.listeRepliable($("#faits"), l.faits.slice().sort(K.parDate), (f) => K.rangFait(f));
      if (l.agenda.length) K.listeRepliable($("#agenda"), l.agenda.slice().sort(K.parDateCroissante), (x) => K.rangAgenda(x));
      K.listeRepliable($("#articles"), l.articles.slice().sort(K.parDate), (a) => K.rangArticle(a));
    },

    // ---------------------------------------------------------------- articles
    articles() {
      const s = { q: K.param("q"), rub: K.param("rub"), source: K.param("source"), an: K.param("an"), lu: K.param("lu"), p: Number(K.param("p")) || 1 };
      const PAR = 50, aTraitement = D.articles.some((a) => a.traitement);
      const annees = uniques(D.articles, (a) => (a.date || "").slice(0, 4)).reverse();
      main.innerHTML = `<div class="titre-page"><h1>Articles</h1><span class="compte" id="n"></span></div>
        <p class="chapo">La revue de presse fichée dans la base. Le titre ouvre l'article chez son éditeur. Une fiche « non dépouillée » n'est connue que par son titre : son contenu n'a pas été lu.</p>
        <div class="filtres">${texte("q", "Mot du titre ou du résumé", s.q, "Air Corsica, incendie, budget")}
          ${liste("rub", "Rubrique", uniques(D.articles, (a) => a.rubrique), s.rub, "Toutes")}
          ${liste("source", "Source", uniques(D.articles, (a) => a.source), s.source, "Toutes")}
          ${champ("an", "Parution", `<select id="an"><option value="">Toutes</option>${annees.map((a) => `<option${a === s.an ? " selected" : ""}>${a}</option>`).join("")}<option value="0"${s.an === "0" ? " selected" : ""}>Non datée</option></select>`)}
          ${aTraitement ? champ("lu", "Traitement", `<select id="lu"><option value="">Tous</option><option value="1"${s.lu === "1" ? " selected" : ""}>Dépouillés</option><option value="0"${s.lu === "0" ? " selected" : ""}>Titre seul</option></select>`) : ""}</div>
        <div id="liste"></div><div class="pagination" id="pages"></div>`;
      const maj = (garderPage) => {
        Object.assign(s, { q: $("#q").value, rub: $("#rub").value, source: $("#source").value, an: $("#an").value, lu: aTraitement ? $("#lu").value : "" });
        if (!garderPage) s.p = 1;
        const m = mots(s.q);
        const r = D.articles.filter((a) => (!s.rub || a.rubrique === s.rub) && (!s.source || a.source === s.source)
          && (!s.an || (s.an === "0" ? !a.date : (a.date || "").startsWith(s.an)))
          && (!s.lu || (s.lu === "1") === (a.traitement !== "À dépouiller")) && K.contient(K.norm(`${a.titre} ${a.retenir || ""} ${a.auteur || ""}`), m));
        const nb = Math.max(1, Math.ceil(r.length / PAR));
        s.p = Math.min(s.p, nb);
        const dates = D.articles.filter((a) => a.date).length;
        $("#n").textContent = `${K.pluriel(r.length, "article")} sur ${D.articles.length}, dont ${dates} datés`;
        $("#liste").innerHTML = r.length ? `<div class="liste">${r.slice((s.p - 1) * PAR, s.p * PAR).map((a) => K.rangArticle(a)).join("")}</div>` : `<div class="vide">Aucun article ne correspond à ces filtres.</div>`;
        $("#pages").innerHTML = nb > 1 ? `<button class="bouton second" id="prec"${s.p <= 1 ? " disabled" : ""}>Page précédente</button><span>Page ${s.p} sur ${nb}</span><button class="bouton second" id="suiv"${s.p >= nb ? " disabled" : ""}>Page suivante</button>` : "";
        const aller = (d) => () => { s.p += d; maj(true); window.scrollTo({ top: 0 }); };
        if ($("#prec")) { $("#prec").onclick = aller(-1); $("#suiv").onclick = aller(1); }
        K.etatUrl({ q: s.q, rub: s.rub, source: s.source, an: s.an, lu: s.lu, p: s.p > 1 ? String(s.p) : "" });
      };
      ecoute(["q", "rub", "source", "an", "lu"], () => maj(false));
      maj(true);
    },

    // ---------------------------------------------------------------- notes
    notes() {
      main.innerHTML = `<div class="titre-page"><h1>Notes et synthèses</h1><span class="compte">${K.pluriel(D.notes.length, "document")}</span></div>
        <p class="chapo">Les productions de la documentation : notes de synthèse, chronologies, fiches repères. Chaque note indique la date à laquelle son information est arrêtée et son état de relecture.</p>
        ${D.notes.length ? `<div class="liste">${D.notes.map(rangNote).join("")}</div>` : `<div class="vide">Cette version du site ne contient pas les notes internes.</div>`}`;
    },
    note() {
      const n = K.I.note.get(K.param("id"));
      if (!n) return introuvable("Cette note");
      document.title = `${n.titre} — Base de connaissances Corse`;
      const sources = n.sources.map((i) => K.I.article.get(i)).filter(Boolean).sort(K.parDate);
      main.innerHTML = `<p class="fil"><a href="notes.html">Notes et synthèses</a></p>
        <div class="fiche-entete"><div class="sur"><span class="etiq plein">${e(n.type)}</span><span class="etiq ${n.etat === "Livrée" ? "ok" : "attention"}">${e(n.etat)}</span>
          ${n.arreteAu ? `<span class="etiq">Information arrêtée au ${K.dateFr(n.arreteAu)}</span>` : ""}${n.aRendreLe ? `<span class="etiq">À rendre le ${K.dateFr(n.aRendreLe)}</span>` : ""}</div>
          <h1>${e(n.titre.replace(/^[^—]+—\s*/, ""))}</h1>
          <p class="sous">${n.dossiers.map(K.lienDossier).filter(Boolean).join(" ; ")}</p></div>
        <div class="fiche"><article class="bloc"><div class="corps texte">${n.html || '<p class="discret">Le texte de cette note n\'a pas été exporté.</p>'}</div></article>
        <aside><section class="bloc"><h2>Sources mobilisées <span class="compte">${sources.length}</span></h2>
          <dl class="reperes">${sources.map((a) => `<div><dd>${a.lien ? `<a href="${e(a.lien)}" target="_blank" rel="noopener">${e(a.titre)}</a>` : e(a.titre)}</dd><dt>${e(a.source)}${a.date ? ", " + K.dateFr(a.date) : ""}</dt></div>`).join("")}</dl></section>
          <section class="bloc"><div class="corps"><button class="bouton second" type="button" onclick="window.print()">Imprimer la note</button></div></section></aside></div>`;
      main.querySelectorAll("a[data-article]").forEach((a) => {
        const art = K.I.article.get(a.dataset.article);
        if (art && art.lien) { a.href = art.lien; a.target = "_blank"; a.rel = "noopener"; }
      });
    },

    // ---------------------------------------------------------------- images drone
    drones() {
      const s = { q: K.param("q"), an: K.param("an") };
      const annees = uniques(D.drones, (d) => (d.date || "").slice(0, 4)).reverse();
      const nbCommunes = new Set(D.drones.map((d) => d.code)).size;
      main.innerHTML = `<div class="titre-page"><h1>Images drone</h1><span class="compte" id="n"></span></div>
        <p class="chapo">Les séquences aériennes archivées, rattachées à leur commune. ${K.pluriel(D.drones.length, "séquence")} sur ${K.pluriel(nbCommunes, "commune")}.</p>
        <div class="filtres">${texte("q", "Commune, lieu ou titre", s.q, "Riventosa, Bonifacio")}
          ${liste("an", "Année de diffusion", annees, s.an, "Toutes")}
          <a class="bouton" href="index.html?couche=drones">Voir sur la carte</a></div><div id="liste"></div>`;
      const maj = () => {
        Object.assign(s, { q: $("#q").value, an: $("#an").value });
        const m = mots(s.q);
        const r = D.drones.filter((d) => (!s.an || (d.date || "").startsWith(s.an)) && K.contient(K.norm(`${d.titre} ${d.lieu} ${(K.I.commune.get(d.code) || {}).nom || ""}`), m));
        $("#n").textContent = `${K.pluriel(r.length, "séquence")}`;
        K.listeRepliable($("#liste"), r, (d) => K.rangDrone(d), 40);
        K.etatUrl(s);
      };
      ecoute(["q", "an"], maj);
      maj();
    },

    // ---------------------------------------------------------------- méthode
    apropos() {
      const m = D.meta, c = m.compteurs, pc = (a, b) => (b ? Math.round((100 * a) / b) + " %" : "sans objet");
      const art = D.articles, dates = art.filter((a) => a.date).length, lus = art.filter((a) => a.traitement && a.traitement !== "À dépouiller").length;
      const verif = D.personnes.filter((p) => p.verifieLe).length, loc = D.faits.filter((f) => f.communes.length).length, recoupes = D.faits.filter((f) => f.fiabilite === "Recoupé").length;
      const complet = m.profil === "complet";
      const ecart = Object.keys(c).filter((b) => m.compteursBase[b] !== c[b]);
      const NOMS = { communes: "communes", faits: "faits datés", agenda: "événements à l'agenda", roles: "mandats et rôles", personnes: "fiches du répertoire", dossiers: "dossiers", articles: "articles", notes: "notes", drones: "séquences drone" };
      main.innerHTML = `<div class="titre-page"><h1>Méthode et limites</h1></div>
        <p class="chapo">Ce site est une maquette. Il montre ce que donnerait une base de connaissances sur la Corse alimentée par la veille de la documentation. Il se consulte comme un outil réel, mais ses données ne sont pas toutes vérifiées : cette page dit lesquelles.</p>
        <div class="chiffres">${[["communes.html", c.communes, "communes"], ["dossiers.html", c.dossiers, "dossiers"], ["articles.html", c.articles, "articles"], ["chronologie.html", c.faits, "faits datés"], ["repertoire.html", c.personnes, "fiches du répertoire"], ["agenda.html", c.agenda, "événements à l'agenda"], ["drones.html", c.drones, "séquences drone"]]
          .map(([h, n, t]) => `<a href="${h}"><strong>${n.toLocaleString("fr-FR")}</strong><span>${t}</span></a>`).join("")}</div>
        <div class="fiche"><div>
          <section class="bloc"><h2>Ce qu'on peut reprendre, et ce qu'on ne peut pas</h2><div class="corps texte">
            <ul>
              ${complet ? `<li><b>${lus} articles sur ${art.length} ont été lus et dépouillés</b> (${pc(lus, art.length)}). Les autres ne sont connus que par leur titre : ils servent à retrouver un sujet, pas à l'affirmer.</li>` : ""}
              <li><b>${dates} articles sur ${art.length} portent une date de parution</b> (${pc(dates, art.length)}). Les autres sont classés par date de saisie, ce qui ne dit rien de leur ancienneté.</li>
              <li><b>${verif} fiches du répertoire sur ${D.personnes.length} ont été contrôlées</b> (${pc(verif, D.personnes.length)}). Une fonction relevée dans la presse il y a six mois peut être fausse aujourd'hui.</li>
              <li><b>${recoupes} faits datés sur ${D.faits.length} sont recoupés</b> par au moins deux sources (${pc(recoupes, D.faits.length)}). Les autres reposent sur une source unique ou restent à vérifier, et la fiche le dit.</li>
              <li><b>${loc} faits datés sur ${D.faits.length} sont rattachés à une commune</b> (${pc(loc, D.faits.length)}).</li>
            </ul></div></section>
          <section class="bloc"><h2>Lire la carte</h2><div class="corps texte">
            <p>La carte compte, commune par commune, les fiches de la base. Elle montre donc où la documentation a regardé, pas où les choses se sont passées. Avec ${D.faits.length} faits datés, une commune foncée est une commune sur laquelle on a beaucoup saisi : en tirer une géographie de la délinquance ou de la vie politique serait une erreur.</p>
            <p>Un fait est placé au niveau de la commune, jamais à une adresse. Un verdict est localisé au siège de la juridiction. Un lieu-dit est rattaché à sa commune : Porticcio à Grosseto-Prugna, Ponte-Leccia à Morosaglia, Cavallo à Bonifacio. Les faits survenus hors de Corse ne sont pas localisés.</p>
            <p>Un article n'est rattaché à une commune que si le champ « Lieux » de sa fiche porte le nom exact de cette commune. Les mentions « Balagne », « Cap Corse » ou « Plaine orientale » ne sont rattachées à aucune commune.</p></div></section>
          <section class="bloc"><h2>D'où viennent les données</h2><div class="corps texte">
            <p>Les fiches sont saisies dans Notion, dans l'espace « Documentation — Revue de presse Corse ». Ce site n'en est qu'une copie en lecture : rien ne s'y modifie. Un script exporte les bases et reconstruit les pages ; la date du dernier export figure en bas de chaque page.</p>
            <p>Les contours des communes et des intercommunalités viennent de l'IGN (Admin Express), les populations et codes postaux du découpage administratif publié par Etalab. Les maires sortants cités dans les fiches communes viennent d'une compilation de la rédaction arrêtée en février 2026, avant les élections municipales.</p></div></section>
        </div><aside>
          <section class="bloc"><h2>Cette version</h2><dl class="reperes">${repere("Profil", complet ? "Complet, à usage interne" : "Publiable")}${repere("Export de Notion", K.dateFr(m.exporteLe))}</dl>
            <div class="corps">${complet
              ? `<p class="avertissement rouge">Cette version contient des statuts judiciaires de personnes nommées et des notes internes. Elle ne doit pas être déposée sur un site public.</p>`
              : `<p>Cette version écarte la justice, les faits divers, les rôles procéduraux, les notes internes et les champs de travail de la documentation.</p>${ecart.length ? `<p class="discret">Fiches conservées : ${ecart.map((b) => `${c[b]} ${NOMS[b]} sur ${m.compteursBase[b]}`).join(" ; ")}.</p>` : ""}`}</div></section>
        </aside></div>`;
    },
  };

  function rangNote(n) {
    return `<div class="rang"><div class="quand">${n.arreteAu ? K.dateFr(n.arreteAu) : ""}<br><span class="discret">arrêtée au</span></div><div class="quoi">
      <div class="intitule"><a href="${K.url.note(n.id)}">${e(n.titre)}</a></div>
      <div class="meta"><span class="etiq">${e(n.type)}</span><span class="etiq ${n.etat === "Livrée" ? "ok" : "attention"}">${e(n.etat)}</span>
        <span>${K.pluriel(n.sources.length, "source mobilisée", "sources mobilisées")}</span><span>${n.dossiers.map(K.lienDossier).filter(Boolean).join(" ; ")}</span></div></div></div>`;
  }

  if (PAGES[page]) PAGES[page]();
})();
