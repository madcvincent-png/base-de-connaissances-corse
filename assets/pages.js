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
  /** Coupe un texte au dernier mot entier, avec points de suspension. */
  const court = (t, n) => { t = String(t || ""); return t.length <= n ? t : t.slice(0, n).replace(/[\s,;:(]+\S*$/, "") + "…"; };

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
          const im = K.image("commune", c.code);
          return `<div class="rang"><div class="quand num">${c.pop != null ? c.pop.toLocaleString("fr-FR") + " hab." : ""}</div><div class="quoi avec-vignette">
            ${im ? `<img class="vignette m carre" src="${e(im.src)}" alt="" loading="lazy" decoding="async">` : `<span class="vignette m carre initiales" data-n="commune" aria-hidden="true">${e(c.code)}</span>`}<div>
            <div class="intitule"><a href="${K.url.commune(c.code)}">${e(c.nom)}</a></div>
            <div class="meta"><span>${e(c.dep)}</span><span>${e(c.epci)}</span>${d || "<span>Rien dans la base</span>"}</div></div></div></div>`;
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
      const executif = K.ELUS.communes[c.code] || [], maireRne = executif.find((x) => x.fonction === "Maire");
      const effectif = K.ELUS.effectifs[c.code];
      const sites = K.sitesDe.get(c.code) || [], lieux = K.lieuxDe.get(c.code) || [];
      main.innerHTML = `<p class="fil"><a href="communes.html">Communes</a> / ${e(c.epci)}</p>
        <div class="fiche-entete"><div class="sur"><span class="etiq plein">${e(c.code)}</span><span class="etiq">${e(c.dep)}</span><span class="etiq">${e(c.epci)}</span></div>
          <h1>${e(c.nom)}</h1>
          <p class="sous">${c.pop != null ? c.pop.toLocaleString("fr-FR") + " habitants" : ""}${c.nomCorse ? `. En corse : ${e(c.nomCorse)}` : ""}${c.pron ? `. Se prononce ${e(c.pron)}` : ""}${
            maire ? `. Maire : ${maire.personnes.map(K.lienPersonne).join(", ")}` : maireRne ? `. Maire : ${K.nomElu(maireRne)}` : ""}</p></div>
        <div class="fiche"><div>
          ${executif.length ? `<section class="bloc"><h2>Exécutif municipal <span class="compte">${executif.length}</span></h2>
            <table class="executif"><tbody>${executif.map((x) => `<tr${x.fonction === "Maire" ? ' class="maire"' : ""}><th scope="row">${e(K.fonctionRne(x.fonction))}</th><td>${K.nomElu(x)}</td><td class="discret">${x.debutFonction ? "depuis le " + K.dateCourte(x.debutFonction) : ""}</td></tr>`).join("")}</tbody></table>
            <p class="source-bloc">${effectif ? `Conseil municipal de ${effectif} membres. ` : ""}Répertoire national des élus${K.ELUS.miseAJour ? `, mis à jour le ${K.dateFr(K.ELUS.miseAJour)}` : ""}. Les conseillers sans délégation ne sont pas repris ici.</p></section>` : ""}
          ${bloc("Mandats, fonctions et rôles", roles.length, "roles")}
          ${bloc("Faits datés", l.faits.length, "faits")}
          ${l.agenda.length ? bloc("Agenda", l.agenda.length, "agenda") : ""}
          ${sites.length ? bloc("Sites et équipements", sites.length, "sites") : ""}
          ${bloc("Articles", l.articles.length, "articles")}
          ${lieux.length ? bloc("Monuments et patrimoine", lieux.length, "lieux") : ""}
          ${l.drones.length ? bloc("Images drone", l.drones.length, "drones") : ""}
        </div><aside>
          ${(() => { const im = K.image("commune", c.code); return im ? `<figure class="bloc photo"><img src="${e(im.src)}" alt="${e(c.nom)}" decoding="async">${K.credit(im)}</figure>` : ""; })()}
          <section class="bloc"><div class="mini-carte" id="mini"></div>
            <dl class="reperes">${repere("Code Insee", e(c.code))}${repere("Département", e(c.dep))}${repere("Intercommunalité", e(c.epci))}
              ${repere("Population", c.pop != null ? c.pop.toLocaleString("fr-FR") + " habitants" : "")}${repere("Codes postaux", e(c.cp))}
              ${repere("Nom corse", e(c.nomCorse) || '<span class="discret">Non renseigné</span>')}${repere("Prononciation pour l'antenne", e(c.pron) || '<span class="discret">Non renseignée</span>')}
              ${repere("Centre géographique", `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}`)}</dl>
            <div class="corps"><a class="bouton second" href="index.html?commune=${c.code}">Voir sur la carte</a></div></section>
          ${c.maireSortant2026 && !maire ? `<section class="bloc"><h2>Archive des municipales</h2><div class="corps"><p>Maire sortant à la veille du scrutin de mars 2026 : <b>${e(c.maireSortant2026)}</b>.</p>
            <p class="discret">${maireRne ? "Compilation de la rédaction arrêtée en février 2026, avant le scrutin. Le maire en fonction est celui du Répertoire national des élus, ci-contre." : "Compilation de la rédaction arrêtée en février 2026. Le maire élu en 2026 n'est pas encore renseigné dans la base : ne pas reprendre ce nom au présent sans vérifier."}</p></div></section>` : ""}
        </aside></div>`;
      K.listeRepliable($("#roles"), roles, (r) => K.rangRole(r), 8);
      K.listeRepliable($("#faits"), l.faits.slice().sort(K.parDate), (f) => K.rangFait(f, { sansLieu: true }), 10);
      if (l.agenda.length) K.listeRepliable($("#agenda"), l.agenda.slice().sort(K.parDateCroissante), (x) => K.rangAgenda(x), 10);
      K.listeRepliable($("#articles"), l.articles.slice().sort(K.parDate), (a) => K.rangArticle(a), 10);
      if (l.drones.length) K.listeRepliable($("#drones"), l.drones.slice().sort(K.parDate), (d) => K.rangDrone(d, { sansLieu: true }), 8);
      if (sites.length) K.listeRepliable($("#sites"), sites.slice().sort((a, b) => (b.seveso ? 1 : 0) - (a.seveso ? 1 : 0) || a.categorie.localeCompare(b.categorie, "fr")), (x) => K.rangSite(x, { sansLieu: true }), 8);
      if (lieux.length) K.listeRepliable($("#lieux"), lieux.slice().sort((a, b) => a.nom.localeCompare(b.nom, "fr")), rangLieu, 8);
      if (!roles.length) $("#roles").innerHTML = `<div class="vide">Aucun mandat ni rôle rattaché à cette commune. La base n'en compte encore que ${D.roles.length} pour toute la Corse.</div>`;
      if (window.L && window.KB_GEO) {
        const L = window.L, m = L.map("mini", { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, zoomSnap: 0.1 });
        const g = L.geoJSON(window.KB_GEO.communes, { interactive: false, style: (f) => f.properties.code === c.code ? { fillColor: "#2e83df", fillOpacity: 1, color: "#202020", weight: 1.5 } : { fillColor: "#fff", fillOpacity: 1, color: "#b4c0c9", weight: 0.4 } }).addTo(m);
        m.fitBounds(g.getBounds(), { padding: [8, 8] });
        sites.forEach((x) => x.lat && L.circleMarker([x.lat, x.lon], { radius: 4, weight: 1, color: "#fff", fillOpacity: 1, className: "marqueur-site s-" + (K.familleSite[x.categorie] || "") }).addTo(m));
      }
    },

    // ---------------------------------------------------------------- chronologie
    chronologie() {
      const s = { q: K.param("q"), rub: K.param("rub"), type: K.param("type"), dossier: K.param("dossier"), jalons: K.param("jalons") === "1", de: K.param("de"), a: K.param("a") };
      const dossiers = D.dossiers.filter((d) => K.liens("dossier", d.id).faits.length);
      // Ligne de temps : un cran par mois qui compte au moins un fait daté. Une échelle linéaire
      // de 1967 à aujourd'hui écraserait les mois récents, où se trouvent presque tous les faits.
      const mois = (iso) => { const [y, m] = iso.slice(0, 7).split("-").map(Number); return y * 12 + m - 1; };
      const isoMois = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
      const libMois = (i) => `${K.MOIS[i % 12]} ${Math.floor(i / 12)}`;
      const M = [...new Set(D.faits.filter((f) => f.date).map((f) => mois(f.date)))].sort((x, y) => x - y);
      const N = M.length, DERNIER = N - 1;
      const cran = (v, def) => { if (!/^\d{4}-\d{2}$/.test(v || "")) return def; const i = M.findIndex((x) => x >= mois(v)); return i < 0 ? DERNIER : i; };
      let de = cran(s.de, 0), a = Math.max(de, s.a ? (() => { const v = mois(s.a); let i = DERNIER; while (i > 0 && M[i] > v) i--; return i; })() : DERNIER);
      const place = (i) => `calc(10px + (100% - 20px) * ${N > 1 ? i / DERNIER : 0.5})`;
      main.innerHTML = `<div class="titre-page"><h1>Chronologie</h1><span class="compte" id="n"></span></div>
        <p class="chapo">Les faits datés relevés dans la presse, du plus récent au plus ancien. La date est celle du fait, jamais celle de l'article. Le losange jaune signale un jalon majeur.</p>
        <div class="filtres">${texte("q", "Mot du titre", s.q, "Simeoni, Sénat, grève")}
          ${liste("rub", "Rubrique", uniques(D.faits, (f) => f.rubrique), s.rub, "Toutes")}
          ${liste("type", "Nature du fait", uniques(D.faits, (f) => f.type), s.type, "Toutes")}
          ${champ("dossier", "Dossier", `<select id="dossier"><option value="">Tous</option>${dossiers.map((d) => `<option value="${d.id}"${d.id === s.dossier ? " selected" : ""}>${e(d.titre)}</option>`).join("")}</select>`)}
          ${caseA("jalons", "Jalons majeurs seulement", s.jalons)}</div>
        <section class="temps" aria-label="Période affichée">
          <div class="temps-tete"><b id="periode"></b><button type="button" class="lien-bouton" id="toute">Toute la période</button></div>
          <div class="histo" id="histo"></div>
          <div class="double-curseur">
            <label class="sr" for="t-de">Début de la période</label><input id="t-de" type="range" min="0" max="${DERNIER}" step="1" value="${de}">
            <label class="sr" for="t-a">Fin de la période</label><input id="t-a" type="range" min="0" max="${DERNIER}" step="1" value="${a}">
          </div>
          <div class="temps-annees" id="annees"></div>
        </section><div id="liste"></div>`;
      const histo = () => {
        // Faits par mois, pour ceux qui passent les autres filtres : on voit où se placer.
        const m = mots(s.q), n = {};
        D.faits.forEach((f) => {
          if (f.date && (!s.rub || f.rubrique === s.rub) && (!s.type || f.type === s.type) && (!s.dossier || f.dossiers.includes(s.dossier)) && (!s.jalons || f.jalon) && K.contient(K.norm(f.titre), m))
            n[mois(f.date)] = (n[mois(f.date)] || 0) + 1;
        });
        const max = Math.max(1, ...Object.values(n));
        $("#histo").innerHTML = M.map((x, i) => {
          const v = n[x] || 0;
          return `<button type="button" class="barre${i >= de && i <= a ? " dans" : ""}${v ? "" : " nulle"}" data-cran="${i}"
            style="left:${place(i)};width:calc((100% - 20px) / ${Math.max(N, 2)} - 2px);--h:${v ? Math.max(10, (v / max) * 100) : 3}%"
            title="${libMois(x)} : ${K.pluriel(v, "fait", "faits")}" aria-label="${libMois(x)}, ${K.pluriel(v, "fait", "faits")}"></button>`;
        }).join("");
      };
      // Repères d'années sous la barre, sans chevauchement
      let derniere = -1, an = "";
      $("#annees").innerHTML = M.map((x, i) => {
        const y = String(Math.floor(x / 12));
        if (y === an) return "";
        an = y;
        const pc = N > 1 ? i / DERNIER : 0.5;
        if (derniere >= 0 && pc - derniere < 0.07) return "";
        derniere = pc;
        return `<span style="left:${place(i)}">${y}</span>`;
      }).join("");
      const pose = () => {
        $("#t-de").value = de; $("#t-a").value = a;
        $(".double-curseur").style.setProperty("--g", place(de));
        $(".double-curseur").style.setProperty("--d", place(a));
        // Curseurs superposés : celui du début passe devant s'il est dans la moitié droite, sinon il serait bloqué
        $("#t-de").style.zIndex = de > DERNIER / 2 ? 3 : 1;
        const toute = de === 0 && a === DERNIER;
        $("#periode").textContent = toute ? `Toute la période, de ${libMois(M[0])} à ${libMois(M[DERNIER])}` : de === a ? libMois(M[de]) : `De ${libMois(M[de])} à ${libMois(M[a])}`;
        $("#toute").hidden = toute;
      };
      $("#t-de").addEventListener("input", (ev) => { de = Math.min(Number(ev.target.value), a); pose(); maj(); });
      $("#t-a").addEventListener("input", (ev) => { a = Math.max(Number(ev.target.value), de); pose(); maj(); });
      $("#toute").onclick = () => { de = 0; a = DERNIER; pose(); maj(); };
      $("#histo").addEventListener("click", (ev) => {
        const b = ev.target.closest(".barre");
        if (!b) return;
        de = a = Number(b.dataset.cran);
        pose(); maj();
      });
      const maj = () => {
        Object.assign(s, { q: $("#q").value, rub: $("#rub").value, type: $("#type").value, dossier: $("#dossier").value, jalons: $("#jalons").checked });
        const m = mots(s.q), toute = de === 0 && a === DERNIER;
        const r = D.faits.filter((f) => (!s.rub || f.rubrique === s.rub) && (!s.type || f.type === s.type) && (!s.dossier || f.dossiers.includes(s.dossier)) && (!s.jalons || f.jalon) && K.contient(K.norm(f.titre), m)
          && (toute || (f.date && mois(f.date) >= M[de] && mois(f.date) <= M[a]))).sort(K.parDate);
        histo();
        $("#n").textContent = `${K.pluriel(r.length, "fait daté", "faits datés")} sur ${D.faits.length}`;
        s.de = toute ? "" : isoMois(M[de]); s.a = toute ? "" : isoMois(M[a]);
        let an = "", h = "";
        r.forEach((f) => {
          const a = (f.date || "").slice(0, 4) || "Sans date";
          if (a !== an) { h += `<div class="annee">${a}</div>`; an = a; }
          h += K.rangFait(f);
        });
        $("#liste").innerHTML = r.length ? `<div class="liste">${h}</div>` : `<div class="vide">Aucun fait daté ne correspond à ces filtres sur cette période.</div>`;
        K.etatUrl({ q: s.q, rub: s.rub, type: s.type, dossier: s.dossier, jalons: s.jalons ? "1" : "", de: s.de, a: s.a });
      };
      ecoute(["q", "rub", "type", "dossier", "jalons"], maj);
      pose();
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
      let courant = [];
      const ouvrir = (id) => {
        const i = courant.findIndex((d) => d.id === id), d = courant[i];
        if (!d) return;
        const p = K.ouvrirPanneau(apercuDossier(d, i, courant.length), `Aperçu du dossier ${d.titre}`);
        p.querySelector("[data-pas='-1']")?.addEventListener("click", () => ouvrir(courant[i - 1].id));
        p.querySelector("[data-pas='1']")?.addEventListener("click", () => ouvrir(courant[i + 1].id));
      };
      $("#liste").addEventListener("click", (ev) => {
        const c = ev.target.closest("a.carte-dossier");
        if (!c || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button) return; // clic modifié : ouverture directe
        ev.preventDefault();
        ouvrir(c.dataset.dossier);
      });
      const maj = () => {
        Object.assign(s, { q: $("#q").value, rub: $("#rub").value, type: $("#type").value, veille: aVeille ? $("#veille").value : "" });
        const m = mots(s.q);
        const r = D.dossiers.filter((d) => (!s.rub || d.rubrique === s.rub) && (!s.type || d.type === s.type) && (!s.veille || d.veille === s.veille) && K.contient(K.norm(`${d.titre} ${d.motsCles || ""} ${d.resume}`), m));
        // l'ordre de navigation suit l'ordre d'affichage, famille par famille
        courant = Object.keys(K.FAMILLES).flatMap((k) => r.filter((d) => K.familleDe[d.rubrique] === k));
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
          ${l.documents.length ? bloc("Documents de référence", l.documents.length, "documents") : ""}
          ${bloc("Articles", l.articles.length, "articles")}
        </div><aside>
          <section class="bloc"><h2>Repères</h2><dl class="reperes">${repere("Période couverte", e(periode))}
            ${repere("Prochaine échéance", d.echeance ? `${K.dateFr(d.echeance)}${d.natureEcheance ? `<br><span class="discret">${e(d.natureEcheance)}</span>` : ""}` : "")}
            ${repere("Mots-clés et variantes", e(d.motsCles))}${repere("Archives images", e(d.archivesImages))}</dl>
            ${!periode && !d.echeance && !d.motsCles ? `<div class="vide">Aucun repère saisi.</div>` : ""}</section>
          <section class="bloc"><h2>Protagonistes <span class="compte">${gens.length}</span></h2>
            ${gens.length ? `<ul class="gens">${gens.map((p) => `<li><a href="${K.url.personne(p.id)}">${K.vignette(p, "s")}<span><b>${e(K.nomAffiche(p))}</b><small>${e(court(p.fonction || p.nature, 120))}</small></span></a></li>`).join("")}</ul>` : `<div class="vide">Aucun protagoniste désigné.</div>`}</section>
        </aside></div>`;
      if (K.frise(l.faits)) $("#faits").insertAdjacentHTML("beforebegin", `<div class="frise-zone">${K.frise(l.faits)}</div>`);
      if (l.notes.length) $("#notes").innerHTML = `<div class="liste">${l.notes.map(rangNote).join("")}</div>`;
      K.listeRepliable($("#faits"), l.faits.slice().sort(K.parDateCroissante), (f) => K.rangFait(f, { sansDossier: true }), 30);
      if (l.agenda.length) K.listeRepliable($("#agenda"), l.agenda.slice().sort(K.parDateCroissante), (x) => K.rangAgenda(x, { sansDossier: true }));
      if (l.roles.length) K.listeRepliable($("#roles"), l.roles, (r) => K.rangRole(r, { sansDossier: true }));
      if (l.documents.length) K.listeRepliable($("#documents"), l.documents.slice().sort(K.parDate), (x) => K.rangDocument(x, { sansDossier: true }), 6);
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
      const ouv = K.OUV_PERS[p.id] || {}, wd = ouv.wikidata;
      // Circonscription : la liste des députés porte le libellé complet (« 1re circonscription de Corse-du-Sud »)
      const rne = (ouv.rne || []).map((m) => (m.institution === "Assemblée nationale" && !/ de /.test(m.circonscription || "") ? { ...m, circonscription: K.circoDe.get(K.norm(p.nom)) || "" } : m));
      main.innerHTML = `<p class="fil"><a href="repertoire.html">Répertoire</a> / ${e(p.nature)}</p>
        <div class="fiche-entete avec-portrait"><figure class="portrait">${K.vignette(p, "l")}${K.credit(K.image("fiche", p.id))}</figure><div>
          <div class="sur"><span class="etiq plein">${e(p.nature)}</span>${p.qualite.map((q) => `<span class="etiq">${e(q)}</span>`).join("")}
          ${p.verifieLe ? `<span class="etiq ok">Fiche vérifiée le ${K.dateCourte(p.verifieLe)}</span>` : `<span class="etiq attention">Fiche non vérifiée</span>`}</div>
          <h1>${e(nom)}</h1>${p.fonction ? `<p class="sous">${K.riche(p.fonction)}</p>` : ""}</div></div>
        ${vigilance ? `<p class="avertissement rouge">Une procédure judiciaire est en cours et aucune décision définitive n'a été rendue : la personne est présumée innocente. Reprendre la formulation pour l'antenne indiquée ci-dessous.</p>` : ""}
        ${!p.verifieLe ? `<p class="avertissement">La fonction indiquée a été relevée dans la presse et n'a pas été contrôlée. La vérifier avant tout synthé ou lancement.</p>` : ""}
        <div class="fiche"><div>
          ${rne.length ? `<section class="bloc"><h2>Mandats en cours <span class="compte">${rne.length}</span></h2>
            <div class="liste">${rne.map(rangMandatRne).join("")}</div>
            <p class="source-bloc">Répertoire national des élus${K.ELUS.miseAJour ? `, mis à jour le ${K.dateFr(K.ELUS.miseAJour)}` : ""}. Rapprochement par le nom et le prénom, réservé aux fiches marquées « Élu » ou « Ancien élu ». Les intitulés sont ceux du répertoire, au masculin.</p></section>` : ""}
          ${bloc("Mandats, fonctions et rôles", roles.length, "roles")}
          ${bloc("Faits datés", l.faits.length, "faits")}
          ${l.agenda.length ? bloc("Agenda", l.agenda.length, "agenda") : ""}
          ${bloc("Articles", l.articles.length, "articles")}
        </div><aside>
          ${wd ? blocWikidata(wd, p) : ""}
          <section class="bloc"><h2>Repères</h2><dl class="reperes">${repere("Nom dans la base", e(p.nom))}${repere("Rattachement", e(p.rattachement))}
            ${"pron" in p ? repere("Prononciation pour l'antenne", e(p.pron) || '<span class="discret">Non renseignée</span>') : ""}
            ${repere("Variantes et erreurs fréquentes", K.riche(p.variantes))}${repere("Repères biographiques", K.riche(p.reperes))}</dl></section>
          <section class="bloc"><h2>Dossiers <span class="compte">${dossiers.length}</span></h2>
            ${dossiers.length ? `<dl class="reperes">${dossiers.map((d) => `<div><dd>${K.lienDossier(d.id)}</dd><dt>${e(d.rubrique)}</dt></div>`).join("")}</dl>` : `<div class="vide">Aucun dossier.</div>`}</section>
        </aside></div>`;
      K.listeRepliable($("#roles"), roles, (r) => K.rangRole(r, { sansPersonne: true }));
      if (!roles.length) $("#roles").innerHTML = rne.length
        ? `<div class="vide">Aucun rôle saisi par la documentation. Les mandats officiels figurent ci-dessus.</div>`
        : `<div class="vide">Aucun mandat ni rôle daté pour cette fiche. La fonction relevée figure en tête de page.</div>`;
      K.listeRepliable($("#faits"), l.faits.slice().sort(K.parDate), (f) => K.rangFait(f));
      if (l.agenda.length) K.listeRepliable($("#agenda"), l.agenda.slice().sort(K.parDateCroissante), (x) => K.rangAgenda(x));
      K.listeRepliable($("#articles"), l.articles.slice().sort(K.parDate), (a) => K.rangArticle(a));
    },

    // ---------------------------------------------------------------- articles
    articles() {
      const aTraitement = D.articles.some((a) => a.traitement);
      const recents = D.articles.filter((a) => a.date).slice().sort(K.parDate).slice(0, 10);
      const suivis = D.dossiers.map((d) => ({ d, n: K.liens("dossier", d.id).articles.length })).filter((x) => x.n).sort((a, b) => b.n - a.n).slice(0, 10);
      main.innerHTML = `<div class="titre-page"><h1>Articles</h1><span class="compte">${K.pluriel(D.articles.length, "article")}</span></div>
        <p class="chapo">La revue de presse fichée dans la base. Entrez par une famille de rubriques, puis affinez par source, année ou dossier. Le titre ouvre l'article chez son éditeur.</p>
        ${K.carrousel("Derniers parus", recents.map(carteArticle), { compte: recents.length })}
        ${K.carrousel("Dossiers les plus documentés", suivis.map(({ d, n }) => ({ f: K.familleDe[d.rubrique] || "", html: `<span class="car-role">${e(d.rubrique)}</span><b><a href="${K.url.dossier(d.id)}">${e(d.titre)}</a></b><small>${K.pluriel(n, "article")}</small>` })), { lien: ["dossiers.html", "Tous les dossiers"] })}
        <section class="bloc-explo"><h2 class="titre-section">Tous les articles</h2><div id="explo"></div></section>`;
      K.initCarrousels(main);
      const nomFamille = (r) => (K.FAMILLES[K.familleDe[r]] || {}).nom || "Sans rubrique";
      const famDe = Object.fromEntries(Object.entries(K.FAMILLES).map(([k, f]) => [f.nom, k]));
      K.explorateur($("#explo"), {
        id: "art", lignes: D.articles,
        recherche: { label: "Chercher dans les articles", placeholder: "Mot du titre ou du résumé", texte: (a) => `${a.titre} ${a.retenir || ""} ${a.auteur || ""}` },
        entonnoir: ["famille", "rub"], entonnoirRacine: "Toutes les rubriques",
        facettes: [
          { cle: "famille", titre: "Famille", question: "Quel domaine ?", valeurs: (a) => nomFamille(a.rubrique), famille: (v) => famDe[v] || "",
            pastille: (v) => `<span class="puce-f" data-f="${famDe[v] || ""}"></span>`, ordre: (a, b) => Object.keys(famDe).indexOf(a) - Object.keys(famDe).indexOf(b) },
          { cle: "rub", titre: "Rubrique", question: "Quelle rubrique ?", valeurs: (a) => a.rubrique || "Sans rubrique", famille: (v) => K.familleDe[v] || "" },
          { cle: "source", titre: "Source", valeurs: (a) => a.source, max: 8 },
          { cle: "an", titre: "Année de parution", valeurs: (a) => (a.date || "").slice(0, 4) || "Non datée", ordre: parAnnee, max: 6 },
          { cle: "genre", titre: "Genre", valeurs: (a) => a.genre },
          { cle: "dossier", titre: "Dossier", valeurs: (a) => (a.dossiers || []).map((i) => (K.I.dossier.get(i) || {}).titre).filter(Boolean), max: 6 },
          ...(aTraitement ? [{ cle: "lu", titre: "Traitement", valeurs: (a) => (a.traitement === "À dépouiller" ? "Titre seul" : "Dépouillé") }] : []),
        ],
        tris: [{ cle: "date", libelle: "Plus récents", f: K.parDate }, { cle: "source", libelle: "Source", f: (a, b) => a.source.localeCompare(b.source, "fr") || K.parDate(a, b) }],
        compte: (n, t) => `${K.pluriel(n, "article")} sur ${t}`,
        pagine: 40, groupe: (a) => (a.date ? K.dateFr(a.date, "Mois").replace(/^./, (c) => c.toUpperCase()) : "Parution non datée"),
        rendu: (a) => K.rangArticle(a),
      });
    },

    // ---------------------------------------------------------------- notes
    notes() {
      const types = [...new Set(D.notes.map((n) => n.type))];
      main.innerHTML = `<div class="titre-page"><h1>Notes de synthèse</h1><span class="compte">${K.pluriel(D.notes.length, "note")}</span></div>
        <p class="chapo">Les productions de la documentation. Chaque note dit à quelle date son information est arrêtée, son état de relecture, et renvoie aux documents et articles qu'elle mobilise.${K.D.meta.profil === "public" ? " Cette version ne montre que les notes établies à partir de sources publiques." : ""}</p>
        ${D.notes.length ? types.map((t) => `<div class="groupe-titre"><h2>${e(t)}</h2><span class="compte">${D.notes.filter((n) => n.type === t).length}</span></div>
          <div class="grille-notes">${D.notes.filter((n) => n.type === t).map((n) => `<article class="carte-note">${carteNote(n).html}</article>`).join("")}</div>`).join("") : `<div class="vide">Aucune note dans cette version du site.</div>`}`;
    },
    note() {
      const n = K.I.note.get(K.param("id"));
      if (!n) return introuvable("Cette note");
      document.title = `${n.titre} — Base de connaissances Corse`;
      const sources = n.sources.map((i) => K.I.article.get(i)).filter(Boolean).sort(K.parDate);
      const docs = (n.documents || []).map((i) => K.I.document.get(i)).filter(Boolean).sort(K.parDate);
      main.innerHTML = `<p class="fil"><a href="notes.html">Notes de synthèse</a></p>
        <div class="fiche-entete"><div class="sur"><span class="etiq plein">${e(n.type)}</span><span class="etiq ${n.etat === "Livrée" ? "ok" : "attention"}">${e(n.etat)}</span>
          ${n.arreteAu ? `<span class="etiq">Information arrêtée au ${K.dateFr(n.arreteAu)}</span>` : ""}${n.aRendreLe ? `<span class="etiq">À rendre le ${K.dateFr(n.aRendreLe)}</span>` : ""}</div>
          <h1>${e(n.titre.replace(/^[^—]+—\s*/, ""))}</h1>
          <p class="sous">${n.dossiers.map(K.lienDossier).filter(Boolean).join(" ; ")}</p></div>
        <div class="fiche"><article class="bloc"><div class="corps texte">${n.html || '<p class="discret">Le texte de cette note n\'a pas été exporté.</p>'}</div></article>
        <aside>${docs.length ? `<section class="bloc"><h2>Documents mobilisés <span class="compte">${docs.length}</span></h2>
          <dl class="reperes">${docs.map((d) => `<div><dd>${d.lien ? `<a href="${e(d.lien)}" target="_blank" rel="noopener">${e(d.titre)}</a>` : e(d.titre)}</dd><dt>${e(d.producteur)}${d.numero ? " · " + e(d.numero) : ""}${d.date ? ", " + K.dateFr(d.date) : ""}</dt></div>`).join("")}</dl></section>` : ""}
          ${sources.length ? `<section class="bloc"><h2>Articles mobilisés <span class="compte">${sources.length}</span></h2>
          <dl class="reperes">${sources.map((a) => `<div><dd>${a.lien ? `<a href="${e(a.lien)}" target="_blank" rel="noopener">${e(a.titre)}</a>` : e(a.titre)}</dd><dt>${e(a.source)}${a.date ? ", " + K.dateFr(a.date) : ""}</dt></div>`).join("")}</dl></section>` : ""}
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

    // ---------------------------------------------------------------- élus
    elus() {
      const E = K.ELUS, inst = E.institutions || {}, ADC = window.KB_ADC;
      const adc = inst["Assemblée de Corse"] || [];
      const fonction = (re) => adc.find((x) => re.test(x.fonction || ""));
      const maires = D.communes.map((c) => ({ c, m: (E.communes[c.code] || []).find((x) => x.fonction === "Maire") })).filter((x) => x.m);
      const maireDe = (code) => (E.communes[code] || []).find((x) => x.fonction === "Maire");
      // Carrousel des figures : on prend ce que disent les sources officielles, sans rien ajouter
      const figure = (x, role, detail) => {
        if (!x) return null;
        const p = K.ficheElu(x);
        return { html: `${p ? K.vignette(p, "m") : `<span class="vignette m initiales" data-n="personne" aria-hidden="true">${e((x.prenom || " ")[0] + (x.nom || " ")[0])}</span>`}
          <span class="car-role">${e(role)}</span><b>${K.nomElu(x)}</b>${detail ? `<small>${e(detail)}</small>` : ""}` };
      };
      const cartes = [
        figure(fonction(/organe exécutif/i), "Président du Conseil exécutif de Corse", "Collectivité de Corse"),
        figure(fonction(/président de l'assemblée/i), "Présidence de l'Assemblée de Corse", "Collectivité de Corse"),
        ...(inst["Députés"] || []).map((x) => figure(x, "Député", x.circonscription)),
        ...(inst["Sénateurs"] || []).map((x) => figure(x, "Sénateur", x.departement || "")),
        figure(maireDe("2A004"), "Maire d'Ajaccio", ""),
        figure(maireDe("2B033"), "Maire de Bastia", ""),
      ].filter(Boolean);
      main.innerHTML = `<div class="titre-page"><h1>Élus</h1><span class="compte">${K.pluriel(maires.length, "maire")}, ${ADC ? ADC.sieges : adc.length} sièges à l'Assemblée de Corse</span></div>
        <p class="chapo">Les élus en fonction selon le Répertoire national des élus du ministère de l'Intérieur${E.miseAJour ? `, mis à jour le ${K.dateFr(E.miseAJour)}` : ""}, et la composition des groupes publiée par l'Assemblée de Corse. Un nom souligné a une fiche dans le répertoire. Les intitulés officiels sont au masculin : vérifier le féminin avant un synthé.</p>
        ${K.carrousel("Figures de la vie publique", cartes, { compte: cartes.length })}
        ${ADC ? `<section class="bloc hemi-bloc"><h2>Assemblée de Corse <span class="compte">${ADC.sieges} sièges</span></h2>
          <div class="hemi-grille"><div><div class="hemi" id="hemi"></div><p class="hemi-info" id="hemi-info" aria-live="polite">Survoler ou toucher un siège pour lire le nom.</p></div>
          <div class="hemi-legende" id="hemi-legende"></div></div>
          <p class="source-bloc">Groupes politiques d'après les <a href="${e(ADC.source)}" target="_blank" rel="noopener">pages de l'Assemblée de Corse</a>, relevées le ${K.dateFr(ADC.releve)} ; chaque groupe indique la date de mise à jour de sa page. Les groupes sont rangés par effectif, la majorité à gauche : cet ordre ne figure pas une position politique, et les couleurs sont celles du site, pas celles des mouvements. Les membres du Conseil exécutif ne siègent pas à l'Assemblée.</p></section>` : ""}
        <section class="bloc-explo"><h2 class="titre-section">Maires et exécutifs municipaux</h2><div id="explo"></div></section>
        <div class="fiche moitie"><section class="bloc"><h2>Présidents d'intercommunalité <span class="compte">${(inst["Intercommunalités"] || []).length}</span></h2><dl class="reperes">
            ${(inst["Intercommunalités"] || []).slice().sort((a, b) => K.epciNom(a.epci).localeCompare(K.epciNom(b.epci), "fr")).map((x) => repere(e(K.epciNom(x.epci)), `${K.nomElu(x)}<br><span class="discret">depuis le ${K.dateFr(x.debutFonction || x.debutMandat)}</span>`)).join("")}</dl></section>
          <section class="bloc"><h2>Parlementaires</h2><dl class="reperes">
            ${(inst["Députés"] || []).map((x) => repere(e("Député, " + (x.circonscription || "")), `${K.nomElu(x)}<br><span class="discret">depuis le ${K.dateFr(x.debutMandat)}</span>`)).join("")}
            ${(inst["Sénateurs"] || []).map((x) => repere("Sénateur" + (x.departement ? ", " + e(x.departement) : ""), `${K.nomElu(x)}<br><span class="discret">depuis le ${K.dateFr(x.debutMandat)}</span>`)).join("")}</dl></section></div>`;
      K.initCarrousels(main);
      if (ADC) hemicycle(ADC, $("#hemi"), $("#hemi-legende"), $("#hemi-info"));
      const TAILLES = [[10000, "10 000 habitants et plus"], [2000, "2 000 à 9 999"], [500, "500 à 1 999"], [100, "100 à 499"], [0, "Moins de 100"]];
      const taille = (p) => (TAILLES.find(([s]) => (p || 0) >= s) || TAILLES[4])[1];
      K.explorateur($("#explo"), {
        id: "elus", lignes: maires,
        recherche: { label: "Chercher un élu ou une commune", placeholder: "Nom de l'élu ou de la commune", texte: ({ c, m }) => `${c.nom} ${m.nom} ${m.prenom}` },
        entonnoir: ["dep", "epci"], entonnoirRacine: "Toute la Corse",
        facettes: [
          { cle: "dep", titre: "Département", question: "Commencer par un département", valeurs: ({ c }) => c.dep, detail: (v) => `${D.communes.filter((c) => c.dep === v).length} communes` },
          { cle: "epci", titre: "Intercommunalité", question: "Puis une intercommunalité", valeurs: ({ c }) => c.epci, max: 6 },
          { cle: "taille", titre: "Taille de la commune", valeurs: ({ c }) => taille(c.pop), ordre: (a, b) => TAILLES.findIndex((t) => t[1] === a) - TAILLES.findIndex((t) => t[1] === b) },
          { cle: "fiche", titre: "Dans le répertoire", valeurs: ({ m }) => (K.ficheElu(m) ? "A une fiche" : "Sans fiche") },
        ],
        tris: [
          { cle: "pop", libelle: "Population", f: (a, b) => (b.c.pop || 0) - (a.c.pop || 0) },
          { cle: "nom", libelle: "Commune", f: (a, b) => a.c.nom.localeCompare(b.c.nom, "fr") },
          { cle: "elu", libelle: "Nom de l'élu", f: (a, b) => a.m.nom.localeCompare(b.m.nom, "fr") },
        ],
        compte: (n, t) => `${K.pluriel(n, "maire")} sur ${t}`,
        rendu: ({ c, m: x }) => `<div class="rang"><div class="quand num">${c.pop != null ? c.pop.toLocaleString("fr-FR") + " hab." : ""}</div><div class="quoi">
          <div class="intitule">${K.nomElu(x)}</div><div class="meta"><span>Maire de ${K.lienCommune(c.code)}</span>${x.debutFonction ? `<span>depuis le ${K.dateCourte(x.debutFonction)}</span>` : ""}
          <span>${K.pluriel((E.communes[c.code] || []).length - 1, "adjoint")}</span><span class="discret">${e(c.epci)}</span></div></div></div>`,
      });
    },

    // ---------------------------------------------------------------- sites et équipements
    sites() {
      const s = { vue: K.param("vue") === "patrimoine" ? "patrimoine" : "sites", q: K.param("q"), fam: K.param("fam"), cat: K.param("cat"), dep: K.param("dep"), seveso: K.param("seveso") === "1", prot: K.param("prot") };
      const dep = (code) => (K.I.commune.get(code) || {}).dep || "";
      const nomC = (code) => (K.I.commune.get(code) || {}).nom || "";
      const nSeveso = K.SITES.filter((x) => x.seveso).length;
      main.innerHTML = `<div class="titre-page"><h1>Sites et équipements</h1><span class="compte" id="n"></span></div>
        <p class="chapo">Les installations qui font l'actualité : dépôts pétroliers et sites Seveso, centrales, barrages, traitement et stockage des déchets, carrières, ports et aéroports, prisons, hôpitaux. Et le patrimoine protégé, commune par commune. ${nSeveso} sites relèvent de la directive Seveso.</p>
        <div class="segments" role="group" aria-label="Vue"><button type="button" data-vue="sites" aria-pressed="${s.vue === "sites"}">Installations et équipements (${K.SITES.length})</button><button type="button" data-vue="patrimoine" aria-pressed="${s.vue === "patrimoine"}">Monuments et patrimoine (${K.LIEUX.length})</button></div>
        <div class="filtres" id="filtres"></div>
        <div class="fiche large-carte"><div><div id="liste"></div></div><aside><section class="bloc"><div class="carte-sites" id="carte-sites"></div><div class="legende-sites" id="legende-sites"></div></section></aside></div>`;
      let carte = null, couche = null;
      if (window.L && window.KB_GEO) {
        const L = window.L;
        carte = L.map("carte-sites", { zoomSnap: 0.25, attributionControl: true, scrollWheelZoom: false });
        carte.attributionControl.setPrefix("").addAttribution("Contours : IGN, Admin Express");
        const g = L.geoJSON(window.KB_GEO.communes, { interactive: false, style: { fillColor: "#fff", fillOpacity: 1, color: "#b4c0c9", weight: 0.4 } }).addTo(carte);
        carte.fitBounds(g.getBounds(), { padding: [8, 8] });
        couche = L.layerGroup().addTo(carte);
      }
      const filtres = () => {
        $("#filtres").innerHTML = s.vue === "sites"
          ? `${texte("q", "Nom, exploitant ou commune", s.q, "Lucciana, EDF, Syvadec")}
            ${champ("fam", "Famille", `<select id="fam"><option value="">Toutes</option>${Object.entries(K.FAMILLES_SITES).map(([k, f]) => `<option value="${k}"${k === s.fam ? " selected" : ""}>${e(f.nom)}</option>`).join("")}</select>`)}
            ${liste("cat", "Catégorie", uniques(K.SITES, (x) => x.categorie), s.cat, "Toutes")}
            ${liste("dep", "Département", uniques(D.communes, (c) => c.dep), s.dep, "Les deux")}
            ${caseA("seveso", "Sites Seveso seulement", s.seveso)}`
          : `${texte("q", "Nom ou commune", s.q, "citadelle, Corte, tour génoise")}
            ${champ("prot", "Protection", `<select id="prot"><option value="">Toutes</option>${[["classe", "Monument historique classé"], ["inscrit", "Monument historique inscrit"], ["inventaire", "Inventaire général du patrimoine"], ["peril", "Patrimoine en péril"]].map(([k, t]) => `<option value="${k}"${k === s.prot ? " selected" : ""}>${t}</option>`).join("")}</select>`)}
            ${liste("dep", "Département", uniques(D.communes, (c) => c.dep), s.dep, "Les deux")}`;
        ecoute(["q", "fam", "cat", "dep", "seveso", "prot"], maj);
      };
      const PROT = { classe: /classé/, inscrit: /inscrit/, inventaire: /inventaire/i, peril: /péril/ };
      const maj = () => {
        const v = (id) => ($("#" + id) ? ($("#" + id).type === "checkbox" ? $("#" + id).checked : $("#" + id).value) : s[id]);
        Object.assign(s, { q: v("q"), dep: v("dep") }, s.vue === "sites" ? { fam: v("fam"), cat: v("cat"), seveso: v("seveso") } : { prot: v("prot") });
        const m = mots(s.q);
        let r;
        if (s.vue === "sites") {
          r = K.SITES.filter((x) => (!s.fam || K.familleSite[x.categorie] === s.fam) && (!s.cat || x.categorie === s.cat) && (!s.dep || dep(x.commune) === s.dep) && (!s.seveso || x.seveso)
            && K.contient(K.norm(`${x.nom} ${x.categorie} ${nomC(x.commune)}`), m))
            .sort((a, b) => (b.seveso ? 1 : 0) - (a.seveso ? 1 : 0) || a.categorie.localeCompare(b.categorie, "fr") || nomC(a.commune).localeCompare(nomC(b.commune), "fr"));
          $("#n").textContent = `${K.pluriel(r.length, "site")} sur ${K.SITES.length}`;
          K.listeRepliable($("#liste"), r, (x) => K.rangSite(x), 30);
        } else {
          r = K.LIEUX.filter((x) => (!s.prot || PROT[s.prot].test(x.protection || "")) && (!s.dep || dep(x.commune) === s.dep) && K.contient(K.norm(`${x.nom} ${nomC(x.commune)}`), m))
            .sort((a, b) => nomC(a.commune).localeCompare(nomC(b.commune), "fr") || a.nom.localeCompare(b.nom, "fr"));
          $("#n").textContent = `${K.pluriel(r.length, "monument")} sur ${K.LIEUX.length}`;
          K.listeRepliable($("#liste"), r, (x) => rangLieu(x, true), 30);
        }
        if (couche) {
          const L = window.L;
          couche.clearLayers();
          r.forEach((x) => x.lat && L.circleMarker([x.lat, x.lon], { radius: s.vue === "sites" ? 5 : 3.5, weight: 1, color: "#fff", fillOpacity: 0.95, className: "marqueur-site s-" + (s.vue === "sites" ? K.familleSite[x.categorie] || "" : "patrimoine") })
            .bindTooltip(`<b>${e(x.nom)}</b><small>${e(s.vue === "sites" ? x.categorie : x.protection || "")} — ${e(nomC(x.commune))}</small>`, { className: "info", direction: "top" }).addTo(couche));
        }
        $("#legende-sites").innerHTML = s.vue === "sites"
          ? Object.entries(K.FAMILLES_SITES).map(([k, f]) => `<span><i class="pastille-site" data-s="${k}"></i>${e(f.nom)}</span>`).join("")
          : `<span><i class="pastille-site" data-s="patrimoine"></i>Monument ou bien patrimonial</span>`;
        K.etatUrl(s.vue === "sites" ? { q: s.q, fam: s.fam, cat: s.cat, dep: s.dep, seveso: s.seveso ? "1" : "" } : { vue: "patrimoine", q: s.q, prot: s.prot, dep: s.dep });
      };
      main.querySelector(".segments").addEventListener("click", (ev) => {
        const b = ev.target.closest("button[data-vue]");
        if (!b || b.dataset.vue === s.vue) return;
        s.vue = b.dataset.vue;
        s.q = "";
        main.querySelectorAll("[data-vue]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        filtres();
        maj();
      });
      filtres();
      maj();
    },

    // ---------------------------------------------------------------- documents de référence
    documents() {
      const recents = D.documents.filter((d) => d.date).sort(K.parDate).slice(0, 8);
      const notes = D.notes.filter((n) => n.type === "Note de synthèse");
      const FAMILLE_PROD = { Insee: "Statistique publique", "Chambre régionale des comptes": "Contrôle et évaluation", "Cour des comptes": "Contrôle et évaluation", "Collectivité de Corse": "Collectivité de Corse", "Assemblée nationale": "Parlement et État", Sénat: "Parlement et État", "Préfecture de Corse": "Parlement et État", "Tribunal administratif": "Contrôle et évaluation" };
      const famille = (d) => FAMILLE_PROD[d.producteur] || "Autres";
      main.innerHTML = `<div class="titre-page"><h1>Documents de référence</h1><span class="compte">${K.pluriel(D.documents.length, "document")}</span></div>
        <p class="chapo">Études, statistiques, rapports de contrôle et textes officiels sur la Corse. On entre par la famille de producteur, puis on affine. Chaque fiche dit ce qu'il faut en retenir et renvoie au document chez son producteur.</p>
        ${K.carrousel("Notes de synthèse", notes.map(carteNote), { compte: notes.length, lien: ["notes.html", "Toutes les notes"] })}
        ${K.carrousel("Derniers parus", recents.map(carteDocument), { compte: recents.length })}
        <section class="bloc-explo"><h2 class="titre-section">Tous les documents</h2><div id="explo"></div></section>`;
      K.initCarrousels(main);
      K.explorateur($("#explo"), {
        id: "docs", lignes: D.documents,
        recherche: { label: "Chercher dans les documents", placeholder: "Titre, numéro, résumé", texte: (d) => `${d.titre} ${d.numero} ${d.collection} ${d.resume} ${d.chiffres} ${d.producteur}` },
        entonnoir: ["famille", "prod", "theme"], entonnoirRacine: "Tous les producteurs",
        facettes: [
          { cle: "famille", titre: "Famille", question: "Qui a produit le document ?", valeurs: famille },
          { cle: "prod", titre: "Producteur", question: "Quel producteur ?", valeurs: (d) => d.producteur },
          { cle: "theme", titre: "Thème", question: "Sur quel thème ?", valeurs: (d) => d.themes || [], max: 10 },
          { cle: "type", titre: "Type", valeurs: (d) => d.type },
          { cle: "an", titre: "Année", valeurs: (d) => (d.date || "").slice(0, 4) || "Non daté", ordre: parAnnee },
          { cle: "statut", titre: "Statut", valeurs: (d) => d.statut },
        ],
        tris: [{ cle: "date", libelle: "Plus récents", f: K.parDate }, { cle: "titre", libelle: "Titre", f: (a, b) => a.titre.localeCompare(b.titre, "fr") }],
        compte: (n, t) => `${K.pluriel(n, "document")} sur ${t}`,
        rendu: (d) => K.rangDocument(d),
      });
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
        <div class="chiffres">${[["communes.html", c.communes, "communes"], ["dossiers.html", c.dossiers, "dossiers"], ["articles.html", c.articles, "articles"], ["chronologie.html", c.faits, "faits datés"], ["repertoire.html", c.personnes, "fiches du répertoire"], ["agenda.html", c.agenda, "événements à l'agenda"], ["documents.html", D.documents.length, "documents de référence"], ["notes.html", D.notes.length, "notes de synthèse"], ["sites.html", K.SITES.length, "sites et équipements"], ["drones.html", c.drones, "séquences drone"]].filter(([, n]) => n)
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
            <p>Les photos et logos viennent de Wikimedia Commons, sous licence libre ; l'auteur et la licence figurent sous chaque image. Une commune est rapprochée de Wikidata par son code Insee. Une personne ne reçoit une photo que si un seul homonyme lié à la Corse existe sur Wikidata : ce rapprochement automatique reste à vérifier, et la fiche l'indique. À défaut, la fiche affiche les initiales.</p>
            <p>Les élus en fonction viennent du <a href="https://www.data.gouv.fr/fr/datasets/repertoire-national-des-elus-1/" target="_blank" rel="noopener">Répertoire national des élus</a> du ministère de l'Intérieur${K.ELUS.miseAJour ? `, mis à jour le ${K.dateFr(K.ELUS.miseAJour)}` : ""} : maire et adjoints de chaque commune, effectif du conseil, Assemblée de Corse, parlementaires, présidents d'intercommunalité. Seuls le nom, la fonction et les dates de mandat sont repris. Un élu n'est rattaché à une fiche du répertoire que si la fiche est marquée « Élu » ou « Ancien élu » et qu'aucun homonyme n'existe.</p>
            <p>La composition des groupes politiques de l'Assemblée de Corse est relevée à la main sur le site de l'Assemblée${window.KB_ADC ? `, le ${K.dateFr(window.KB_ADC.releve)}` : ""} : le Répertoire national des élus ne donne pas l'appartenance politique. Elle est à revoir à chaque changement de groupe.</p>
            <p>Les notes de synthèse sont rédigées par la documentation dans Notion. Seules figurent sur la version publiable celles marquées « Publiable », c'est-à-dire établies uniquement à partir de sources publiques ; leur état de relecture est affiché sur chaque note.</p>
            <p>Les installations classées viennent de <a href="https://www.georisques.gouv.fr/" target="_blank" rel="noopener">Géorisques</a> (ministère de la Transition écologique) : seules sont retenues les familles utiles à l'actualité (hydrocarbures, Seveso, déchets, carrières, énergie). Un exploitant personne physique n'est pas nommé. Les grands équipements (ports, aéroports, phares, barrages, centrales, prisons, hôpitaux, stades) et les monuments protégés viennent de Wikidata, qui peut être incomplet ou en retard.</p>
            <p>Les repères biographiques publics (année et lieu de naissance, partis, fonctions) viennent de Wikidata, pour les fiches dont le rapprochement est sans ambiguïté. Ils sont signalés comme tels et ne remplacent pas la fonction vérifiée par la documentation.${K.O.genere ? ` Dernière collecte : ${K.dateFr(K.O.genere)}.` : ""}</p>
            <p>Les contours des communes et des intercommunalités viennent de l'IGN (Admin Express), les populations et codes postaux du découpage administratif publié par Etalab. Les maires sortants cités dans les fiches communes viennent d'une compilation de la rédaction arrêtée en février 2026, avant les élections municipales.</p></div></section>
        </div><aside>
          <section class="bloc"><h2>Cette version</h2><dl class="reperes">${repere("Profil", complet ? "Complet, à usage interne" : "Publiable")}${repere("Export de Notion", K.dateFr(m.exporteLe))}</dl>
            <div class="corps">${complet
              ? `<p class="avertissement rouge">Cette version contient des statuts judiciaires de personnes nommées et des notes internes. Elle ne doit pas être déposée sur un site public.</p>`
              : `<p>Cette version écarte la justice, les faits divers, les rôles procéduraux, les notes internes et les champs de travail de la documentation.</p>${ecart.length ? `<p class="discret">Fiches conservées : ${ecart.map((b) => `${c[b]} ${NOMS[b]} sur ${m.compteursBase[b]}`).join(" ; ")}.</p>` : ""}`}</div></section>
        </aside></div>`;
    },
  };

  /** Vue étendue d'un dossier, ouverte dans le panneau latéral avant d'aller sur sa page. */
  function apercuDossier(d, i, total) {
    const l = K.liens("dossier", d.id);
    const gens = (d.personnes || []).map((x) => K.I.personne.get(x)).filter(Boolean);
    const periode = d.debut ? (d.fin ? `${K.dateFr(d.debut)} – ${K.dateFr(d.fin)}` : `depuis le ${K.dateFr(d.debut)}`) : "";
    const venir = l.agenda.filter((x) => (x.date || "").slice(0, 10) >= K.aujourdHui()).sort(K.parDateCroissante).slice(0, 2);
    const faits = l.faits.slice().sort(K.parDate).slice(0, 4);
    const arts = l.articles.slice().sort(K.parDate).slice(0, 4);
    const chiffre = (n, un, plusieurs) => `<div><strong>${n}</strong><span>${K.pluriel(n, un, plusieurs).replace(/^\S+\s/, "")}</span></div>`;
    return `<article class="apercu" data-f="${K.familleDe[d.rubrique] || ""}">
      <div class="apercu-nav"><span class="discret">${i + 1} / ${total}</span>
        <span><button type="button" class="bouton second" data-pas="-1"${i ? "" : " disabled"}>← Précédent</button>
        <button type="button" class="bouton second" data-pas="1"${i < total - 1 ? "" : " disabled"}>Suivant →</button></span></div>
      <div class="sur">${K.rub(d.rubrique)}<span class="etiq">${e(d.type)}</span>${d.veille === "Veille active" ? `<span class="etiq plein">Veille active</span>` : ""}</div>
      <h2>${e(d.titre)}</h2>
      ${d.resume ? `<p class="sous">${e(d.resume)}</p>` : ""}
      ${periode ? `<p class="discret">Période couverte : ${e(periode)}</p>` : ""}
      <div class="mini-chiffres">${chiffre(l.articles.length, "article")}${chiffre(l.faits.length, "fait daté", "faits datés")}${chiffre(gens.length, "protagoniste")}${chiffre(l.agenda.length, "échéance", "échéances")}</div>
      ${K.frise(l.faits) ? `<h3>Frise</h3>${K.frise(l.faits)}` : ""}
      ${venir.length ? `<h3>À venir</h3><div class="liste">${venir.map((x) => K.rangAgenda(x, { sansDossier: true })).join("")}</div>` : ""}
      ${faits.length ? `<h3>Derniers faits datés</h3><div class="liste">${faits.map((f) => K.rangFait(f, { sansDossier: true })).join("")}</div>` : ""}
      ${gens.length ? `<h3>Protagonistes</h3><ul class="gens">${gens.map((p) => `<li><a href="${K.url.personne(p.id)}">${K.vignette(p, "s")}<span><b>${e(K.nomAffiche(p))}</b><small>${e(court(p.fonction || p.nature, 90))}</small></span></a></li>`).join("")}</ul>` : ""}
      ${arts.length ? `<h3>Derniers articles</h3><div class="liste">${arts.map((a) => K.rangArticle(a, { sansDossier: true })).join("")}</div>` : ""}
      <div class="apercu-pied"><a class="bouton" href="${K.url.dossier(d.id)}">Ouvrir le dossier complet</a></div>
    </article>`;
  }

  /** Hémicycle : sièges disposés en arcs, attribués groupe par groupe de gauche à droite. */
  function hemicycle(A, el, legende, info) {
    const groupes = A.groupes.map((g) => ({ ...g, sieges: (g.president ? [g.president] : []).concat(g.membres.slice().sort((a, b) => a[0].localeCompare(b[0], "fr"))) }));
    const N = groupes.reduce((n, g) => n + g.sieges.length, 0);
    const RANGS = N > 40 ? 5 : 4, R0 = 0.42, R1 = 1;
    const rayons = Array.from({ length: RANGS }, (_, i) => R0 + ((R1 - R0) * i) / (RANGS - 1));
    const total = rayons.reduce((a, b) => a + b, 0);
    const parRang = rayons.map((r) => Math.round((N * r) / total));
    let ecart = N - parRang.reduce((a, b) => a + b, 0);
    for (let i = RANGS - 1; ecart; i = (i + RANGS - 1) % RANGS) { parRang[i] += Math.sign(ecart); ecart -= Math.sign(ecart); }
    const sieges = [];
    rayons.forEach((r, i) => { for (let j = 0; j < parRang[i]; j++) { const a = Math.PI - (j * Math.PI) / Math.max(1, parRang[i] - 1); sieges.push({ a, r }); } });
    sieges.sort((x, y) => y.a - x.a || x.r - y.r);
    const R = 190, rs = Math.min(9.5, (R * (R1 - R0)) / RANGS / 2.25), W = 2 * (R + rs + 4), cx = W / 2, cy = R + rs + 4, H = cy + rs + 26;
    let k = 0;
    const cercles = groupes.flatMap((g) => g.sieges.map((m, i) => {
      const s = sieges[k++], x = cx + Math.cos(s.a) * s.r * R, y = cy - Math.sin(s.a) * s.r * R;
      const nom = K.nomAffiche({ nature: "Personne", nom: `${m[0]} ${m[1]}` }) + (g.president && i === 0 ? " (président du groupe)" : "");
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rs.toFixed(1)}" fill="${g.couleur}" data-g="${g.id}" data-nom="${e(nom)}" data-gnom="${e(g.nom)}" tabindex="-1"><title>${e(nom)} — ${e(g.nom)}</title></circle>`;
    })).join("");
    const majorite = Math.floor(N / 2) + 1;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Hémicycle de l'Assemblée de Corse : ${groupes.map((g) => `${g.nom}, ${g.sieges.length} sièges`).join(" ; ")}">
      <line x1="${cx}" y1="${cy - R - rs - 2}" x2="${cx}" y2="${cy - R0 * R + rs + 2}" class="hemi-axe"/>
      ${cercles}
      <text x="${cx}" y="${cy - 8}" text-anchor="middle" class="hemi-total">${N}</text>
      <text x="${cx}" y="${cy + rs + 20}" text-anchor="middle" class="hemi-sous">${N} sièges · majorité absolue à ${majorite}</text></svg>`;
    legende.innerHTML = `<ul>${groupes.map((g) => `<li><button type="button" data-g="${g.id}" aria-pressed="false"><span class="pastille-g" style="background:${g.couleur}"></span>
      <span class="g-nom">${e(g.court || g.nom)}</span><b class="g-n">${g.sieges.length}</b></button>
      <details><summary>${g.president ? `Présidé par ${e(K.nomAffiche({ nature: "Personne", nom: g.president.join(" ") }))}` : "Liste des élus"}<span class="discret"> · page du ${K.dateCourte(g.maj)}</span></summary>
        <ul class="g-membres">${g.sieges.map((m) => `<li>${K.nomElu({ nom: m[0], prenom: m[1] })}</li>`).join("")}</ul>
        <a href="${e(g.source)}" target="_blank" rel="noopener">Source : Assemblée de Corse</a></details></li>`).join("")}</ul>
      ${groupes[0].sieges.length >= majorite ? `<p class="hemi-note">${e(groupes[0].nom)} détient à lui seul la majorité absolue (${groupes[0].sieges.length} sièges sur ${N}).</p>` : ""}`;
    const svg = el.querySelector("svg");
    const montrer = (c) => { info.innerHTML = c ? `<b>${c.dataset.nom}</b> · ${c.dataset.gnom}` : "Survoler ou toucher un siège pour lire le nom."; };
    svg.addEventListener("pointerover", (ev) => { if (ev.target.tagName === "circle") montrer(ev.target); });
    svg.addEventListener("click", (ev) => { if (ev.target.tagName === "circle") montrer(ev.target); });
    let choisi = "";
    legende.addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-g]");
      if (!b) return;
      choisi = choisi === b.dataset.g ? "" : b.dataset.g;
      legende.querySelectorAll("button[data-g]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.g === choisi)));
      svg.classList.toggle("filtre", !!choisi);
      svg.querySelectorAll("circle").forEach((c) => c.classList.toggle("eteint", !!choisi && c.dataset.g !== choisi));
    });
    legende.addEventListener("pointerover", (ev) => { const b = ev.target.closest("button[data-g]"); if (b && !choisi) svg.querySelectorAll("circle").forEach((c) => c.classList.toggle("eteint", c.dataset.g !== b.dataset.g)); });
    legende.addEventListener("pointerleave", () => { if (!choisi) svg.querySelectorAll("circle").forEach((c) => c.classList.remove("eteint")); });
  }

  /** Un mandat du Répertoire national des élus, rédigé pour être lu. */
  function rangMandatRne(m) {
    const f = K.fonctionRne(m.fonction);
    let quoi;
    if (m.institution === "Conseil municipal") quoi = `${f === "Conseiller" ? "Conseiller municipal" : f} — ${K.lienCommune(m.commune) || e(m.commune)}`;
    else if (m.institution === "Intercommunalité") quoi = `${f === "Conseiller" ? "Conseiller communautaire" : e(f)} — ${e(K.epciNom(m.epci))}`;
    else if (m.institution === "Assemblée nationale") quoi = `Député — ${e(/ de /.test(m.circonscription) ? m.circonscription : "Assemblée nationale")}`;
    else if (m.institution === "Sénat") quoi = `Sénateur${m.departement ? " — " + e(m.departement) : ""}`;
    else quoi = `${f === "Conseiller" ? "Conseiller à l'Assemblée de Corse" : e(f) + " — Assemblée de Corse"}`;
    const d = m.debutFonction || m.debutMandat;
    return `<div class="rang"><div class="quand">En cours<br><span class="discret">${d ? "depuis le " + K.dateFr(d) : ""}</span></div><div class="quoi"><div class="intitule">${quoi}</div></div></div>`;
  }

  /** Repères publics tirés de Wikidata, présentés comme tels. */
  function blocWikidata(w, p) {
    const fonctions = (w.fonctions || []).slice(0, 8).map((f) => `<li>${e(f.poste)}<span class="discret">${f.debut ? " " + (f.fin ? `${f.debut.slice(0, 4)}–${f.fin.slice(0, 4)}` : `depuis ${f.debut.slice(0, 4)}`) : ""}</span></li>`).join("");
    const liens = [w.wikipedia && `<a href="${e(w.wikipedia)}" target="_blank" rel="noopener">Wikipédia</a>`, `<a href="https://www.wikidata.org/wiki/${e(w.wikidata)}" target="_blank" rel="noopener">Wikidata</a>`, w.site && `<a href="${e(w.site)}" target="_blank" rel="noopener">Site officiel</a>`].filter(Boolean).join(" · ");
    return `<section class="bloc"><h2>Repères publics</h2><dl class="reperes">
      ${repere("Description", e(w.description))}
      ${p.nature === "Personne" ? repere("Naissance", e([w.naissance, w.lieuNaissance].filter(Boolean).join(", "))) : repere("Fondation", e(w.fondation || ""))}
      ${w.siege ? repere("Siège", e(w.siege)) : ""}
      ${(w.partis || []).length ? repere("Partis", e(w.partis.join(", "))) : ""}
      ${fonctions ? repere("Fonctions", `<ul class="fonctions">${fonctions}</ul>`) : ""}
      ${repere("Liens", liens)}</dl>
      <p class="source-bloc">Wikidata, rapprochement automatique sans homonyme. Peut être incomplet ou en retard : la fonction vérifiée par la documentation fait foi.</p></section>`;
  }

  function rangLieu(x, avecCommune) {
    const prot = (x.protection || "").split(" ; ").filter(Boolean);
    return `<div class="rang"><div class="quand"><span class="pastille-site" data-s="patrimoine"></span>Patrimoine</div><div class="quoi">
      <div class="intitule"><a href="https://www.wikidata.org/wiki/${e(x.wikidata)}" target="_blank" rel="noopener">${e(x.nom.charAt(0).toUpperCase() + x.nom.slice(1))}</a></div>
      <div class="meta">${prot.map((t) => `<span class="etiq${/péril/.test(t) ? " attention" : ""}">${e(t.charAt(0).toUpperCase() + t.slice(1))}</span>`).join("")}${avecCommune === true ? `<span>${K.lienCommune(x.commune)}</span>` : ""}</div></div></div>`;
  }

  /** Années les plus récentes d'abord, « Non datée » en dernier. */
  const parAnnee = (a, b) => (/^\d/.test(b) ? 1 : 0) - (/^\d/.test(a) ? 1 : 0) || b.localeCompare(a);

  /** Cartes des carrousels. */
  function carteNote(n) {
    const titre = n.titre.replace(/^[^—]+—\s*/, "");
    const [sujet, angle] = titre.split(" : ");
    const d = (n.dossiers || []).map((i) => K.I.dossier.get(i)).filter(Boolean)[0];
    return { f: d ? K.familleDe[d.rubrique] || "" : "", html: `<span class="car-role">${e(n.type)}${n.arreteAu ? ` · au ${K.dateCourte(n.arreteAu)}` : ""}</span>
      <b><a href="${K.url.note(n.id)}">${e(sujet)}</a></b>${angle ? `<small>${e(angle)}</small>` : ""}
      <span class="car-bas"><span class="etiq ${n.etat === "Livrée" ? "ok" : "attention"}">${e(n.etat)}</span>${(n.documents || []).length ? `<span>${K.pluriel(n.documents.length, "document")}</span>` : ""}${(n.sources || []).length ? `<span>${K.pluriel(n.sources.length, "article")}</span>` : ""}</span>` };
  }
  function carteDocument(d) {
    return { html: `<span class="car-role">${e(d.producteur)}${d.date ? ` · ${K.dateCourte(d.date)}` : ""}</span>
      <b>${d.lien ? `<a href="${e(d.lien)}" target="_blank" rel="noopener">${e(court(d.titre, 110))}</a>` : e(court(d.titre, 110))}</b>
      ${d.chiffres ? `<small>${e(court(d.chiffres, 150))}</small>` : d.resume ? `<small>${e(court(d.resume, 150))}</small>` : ""}
      <span class="car-bas">${[d.collection, d.numero].filter(Boolean).length ? `<span>${e([d.collection, d.numero].filter(Boolean).join(" n° "))}</span>` : ""}</span>` };
  }
  function carteArticle(a) {
    return { f: K.familleDe[a.rubrique] || "", html: `<span class="car-role">${e(a.source)} · ${K.dateCourte(a.date)}</span>
      <b>${a.lien ? `<a href="${e(a.lien)}" target="_blank" rel="noopener">${e(court(a.titre, 120))}</a>` : e(court(a.titre, 120))}</b>
      <span class="car-bas">${K.rub(a.rubrique)}${(a.dossiers || []).slice(0, 1).map(K.lienDossier).join("")}</span>` };
  }

  function rangNote(n) {
    return `<div class="rang"><div class="quand">${n.arreteAu ? K.dateFr(n.arreteAu) : ""}<br><span class="discret">arrêtée au</span></div><div class="quoi">
      <div class="intitule"><a href="${K.url.note(n.id)}">${e(n.titre)}</a></div>
      <div class="meta"><span class="etiq">${e(n.type)}</span><span class="etiq ${n.etat === "Livrée" ? "ok" : "attention"}">${e(n.etat)}</span>
        ${(n.documents || []).length ? `<span>${K.pluriel(n.documents.length, "document mobilisé", "documents mobilisés")}</span>` : ""}${n.sources.length ? `<span>${K.pluriel(n.sources.length, "article mobilisé", "articles mobilisés")}</span>` : ""}<span>${n.dossiers.map(K.lienDossier).filter(Boolean).join(" ; ")}</span></div></div></div>`;
  }

  if (PAGES[page]) PAGES[page]();
})();
