/* Recherche simple et avancée.
   Une seule syntaxe : la boîte la lit, le formulaire avancé l'écrit. Ce qu'on voit dans la boîte est
   donc toujours la requête exécutée, qu'on peut copier, corriger ou partager par l'adresse de la page.

     simeoni autonomie                 tous ces mots, n'importe où dans la fiche
     "plan de relance"                 l'expression exacte
     personne:simeoni                  un champ : titre, personne, dossier, commune, theme, type, source
     dossier:(port bastia)             plusieurs mots dans le même champ
     déchets OU ordures SAUF Viggianello      opérateurs, lus de gauche à droite
     -tourisme                         équivaut à SAUF tourisme
     base:articles,dossiers            bases interrogées (-base:communes pour en écarter)
     date:2024..2026-06                période (année, mois ou jour ; bornes facultatives)
*/
(function () {
  "use strict";
  const K = window.KB, D = K.D, e = K.esc, norm = K.norm;
  const main = document.getElementById("page");

  // ---------------------------------------------------------------- champs et bases
  const CHAMPS = {
    tout: "Tout le texte",
    titre: "Titre ou nom",
    personne: "Personne ou organisation",
    dossier: "Dossier",
    commune: "Commune ou lieu",
    theme: "Thème ou rubrique",
    type: "Type ou genre",
    source: "Source ou producteur",
  };
  const ALIAS_CHAMP = {
    tout: "tout", texte: "tout", titre: "titre", nom: "titre",
    personne: "personne", personnes: "personne", qui: "personne", organisation: "personne",
    dossier: "dossier", dossiers: "dossier", commune: "commune", communes: "commune", lieu: "commune", lieux: "commune",
    theme: "theme", themes: "theme", rubrique: "theme", type: "type", genre: "type", nature: "type",
    source: "source", sources: "source", producteur: "source", journal: "source",
  };
  const OPS = { ET: "ET", OU: "OU", SAUF: "SAUF" };

  const nomP = (i) => { const p = K.I.personne.get(i); return p ? `${p.nom} ${K.nomAffiche(p)} ${p.formes || ""}` : ""; };
  const nomD = (i) => { const d = K.I.dossier.get(i); return d ? `${d.titre} ${d.motsCles || ""}` : ""; };
  const nomC = (c) => { const o = K.I.commune.get(c); return o ? `${o.nom} ${o.nomCorse || ""}` : ""; };
  const theme = (r) => (r ? `${r} ${(K.FAMILLES[K.familleDe[r]] || {}).nom || ""}` : "");
  const srcArt = (i) => { const a = K.I.article.get(i); return a ? a.source : ""; };
  const court = (t, n) => { t = String(t || ""); return t.length <= n ? t : t.slice(0, n).replace(/[\s,;:(]+\S*$/, "") + "…"; };

  function rangDossier(d) {
    const l = K.liens("dossier", d.id);
    return `<div class="rang"><div class="quand">${d.debut ? e(K.dateFr(d.debut, "Année")) + (d.fin ? "–" + e(K.dateFr(d.fin, "Année")) : "") : "Dossier"}</div><div class="quoi">
      <div class="intitule"><a href="${K.url.dossier(d.id)}">${e(d.titre)}</a></div>
      ${d.resume ? `<div class="complement">${e(court(d.resume, 240))}</div>` : ""}
      <div class="meta">${K.rub(d.rubrique)}${d.type ? `<span class="etiq">${e(d.type)}</span>` : ""}<span>${K.pluriel(l.articles.length, "article")}</span>${l.faits.length ? `<span>${K.pluriel(l.faits.length, "fait daté", "faits datés")}</span>` : ""}</div></div></div>`;
  }
  function rangCommune(c) {
    return `<div class="rang"><div class="quand">${e(c.dep || "Commune")}</div><div class="quoi">
      <div class="intitule"><a href="${K.url.commune(c.code)}">${e(c.nom)}</a>${c.nomCorse && c.nomCorse !== c.nom ? ` <span class="discret">${e(c.nomCorse)}</span>` : ""}</div>
      <div class="meta">${c.epci ? `<span>${e(c.epci)}</span>` : ""}${c.cp ? `<span>${e(c.cp)}</span>` : ""}${c.pop ? `<span>${K.pluriel(c.pop, "habitant")}</span>` : ""}</div></div></div>`;
  }
  function rangNote(n) {
    return `<div class="rang"><div class="quand">${n.arreteAu ? e(K.dateFr(n.arreteAu)) : "Note"}</div><div class="quoi">
      <div class="intitule"><a href="${K.url.note(n.id)}">${e(n.titre)}</a></div>
      <div class="meta"><span class="etiq">${e(n.type)}</span><span>${(n.dossiers || []).map(K.lienDossier).filter(Boolean).join(" ; ")}</span></div></div></div>`;
  }

  /* Pour chaque base : où se trouve chaque champ. Les relations comptent : un article relié à une personne
     dans Notion se trouve par « personne: » même si son titre ne la nomme pas. */
  const BASES = [
    { cle: "articles", nom: "Articles", un: "article", liste: D.articles, date: (a) => [a.date, a.date], rendu: (a) => K.rangArticle(a),
      champs: (a) => ({ titre: a.titre, personne: (a.personnes || []).map(nomP), dossier: (a.dossiers || []).map(nomD),
        commune: [...(a.communes || []).map(nomC), ...(a.lieux || [])], theme: theme(a.rubrique), type: a.genre, source: [a.source, a.typeSource] }),
      csv: (a) => [a.source, a.rubrique, a.genre, "", a.lien] },
    { cle: "dossiers", nom: "Dossiers", un: "dossier", liste: D.dossiers, date: (d) => [d.debut, d.fin || K.aujourdHui()], rendu: rangDossier,
      champs: (d) => ({ titre: `${d.titre} ${d.motsCles || ""}`, personne: (d.personnes || []).map(nomP), dossier: `${d.titre} ${d.motsCles || ""}`,
        theme: theme(d.rubrique), type: d.type, plus: d.resume }),
      csv: (d) => ["", d.rubrique, d.type, K.url.dossier(d.id), ""] },
    { cle: "faits", nom: "Faits datés", un: "fait daté", plusieurs: "faits datés", liste: D.faits, date: (f) => [f.date, f.dateFin || f.date], rendu: (f) => K.rangFait(f),
      champs: (f) => ({ titre: f.titre, personne: (f.personnes || []).map(nomP), dossier: (f.dossiers || []).map(nomD), commune: (f.communes || []).map(nomC),
        theme: theme(f.rubrique), type: f.type, source: (f.sources || []).map(srcArt) }),
      csv: (f) => [(f.sources || []).map(srcArt).filter(Boolean).join(", "), f.rubrique, f.type, "chronologie.html", ""] },
    { cle: "personnes", nom: "Répertoire", un: "fiche", liste: D.personnes, date: null, rendu: (p) => K.rangPersonne(p),
      // une personne se trouve aussi par les dossiers dont elle est protagoniste
      champs: (p) => ({ titre: `${p.nom} ${K.nomAffiche(p)} ${p.formes || ""}`, personne: `${p.nom} ${K.nomAffiche(p)} ${p.formes || ""}`,
        dossier: K.liens("personne", p.id).dossiers.map((d) => nomD(d.id)), type: [p.nature, ...(p.qualite || [])], plus: `${p.fonction} ${p.rattachement}` }),
      csv: (p) => [p.rattachement, "", [p.nature, ...(p.qualite || [])].join(", "), K.url.personne(p.id), ""] },
    { cle: "documents", nom: "Documents", un: "document", liste: D.documents, date: (d) => [d.date, d.date], rendu: (d) => K.rangDocument(d),
      champs: (d) => ({ titre: d.titre, dossier: (d.dossiers || []).map(nomD), theme: (d.themes || []).map(theme), type: [d.type, d.collection],
        source: [d.producteur, d.collection], plus: `${d.resume || ""} ${d.chiffres || ""} ${d.numero || ""}` }),
      csv: (d) => [d.producteur, (d.themes || []).join(", "), d.type, "", d.lien] },
    { cle: "agenda", nom: "Agenda", un: "échéance", liste: D.agenda, date: (x) => [x.date, x.dateFin || x.date], rendu: (x) => K.rangAgenda(x),
      champs: (x) => ({ titre: x.titre, personne: (x.personnes || []).map(nomP), dossier: (x.dossiers || []).map(nomD),
        commune: [...(x.communes || []).map(nomC), x.lieu], theme: theme(x.rubrique), type: x.type }),
      csv: (x) => ["", x.rubrique, x.type, "agenda.html", x.lien] },
    { cle: "notes", nom: "Notes", un: "note", liste: D.notes, date: (n) => [n.arreteAu, n.arreteAu], rendu: rangNote,
      champs: (n) => ({ titre: n.titre, dossier: (n.dossiers || []).map(nomD), type: n.type }),
      csv: (n) => ["", "", n.type, K.url.note(n.id), ""] },
    { cle: "communes", nom: "Communes", un: "commune", liste: D.communes, date: null, rendu: rangCommune,
      champs: (c) => ({ titre: `${c.nom} ${c.nomCorse || ""}`, commune: `${c.nom} ${c.nomCorse || ""}`, plus: `${c.dep} ${c.epci} ${c.cp} ${c.code}` }),
      csv: (c) => ["", "", "Commune", K.url.commune(c.code), ""] },
  ].filter((b) => b.liste && b.liste.length);
  const BASE = Object.fromEntries(BASES.map((b) => [b.cle, b]));
  const ALIAS_BASE = { article: "articles", articles: "articles", presse: "articles", dossier: "dossiers", dossiers: "dossiers",
    fait: "faits", faits: "faits", chronologie: "faits", personne: "personnes", personnes: "personnes", repertoire: "personnes",
    document: "documents", documents: "documents", agenda: "agenda", note: "notes", notes: "notes", commune: "communes", communes: "communes" };

  // Index : chaque champ normalisé une fois, précédé d'un espace pour chercher en début de mot.
  const plat = (v) => [].concat(v == null ? [] : v).flat().filter(Boolean).join(" ");
  const INDEX = BASES.flatMap((b) =>
    b.liste.map((x) => {
      const c = b.champs(x), f = {};
      Object.keys(CHAMPS).forEach((k) => { if (k !== "tout" && c[k] != null) f[k] = " " + norm(plat(c[k])); });
      f.tout = " " + norm([...Object.keys(c).map((k) => plat(c[k]))].join(" "));
      const [debut, fin] = b.date ? b.date(x).map((d) => (d || "").slice(0, 10)) : ["", ""];
      return { base: b.cle, x, f, debut, fin: fin || debut };
    })
  );

  // ---------------------------------------------------------------- syntaxe
  /** « 2024 » → 2024-01-01 ou 2024-12-31 selon la borne ; « 2024-03 » de même au mois. */
  function borne(s, fin) {
    s = (s || "").trim();
    if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(s)) return "";
    if (s.length === 10) return s;
    if (s.length === 7) {
      if (!fin) return s + "-01";
      const [a, m] = s.split("-").map(Number);
      return `${s}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`;
    }
    return s + (fin ? "-12-31" : "-01-01");
  }

  function analyser(q) {
    const r = { termes: [], bases: null, du: "", au: "" };
    let op = "ET";
    const re = /(-)?(?:([\p{L}]+):)?(?:"([^"]*)"?|\(([^)]*)\)?|([^\s"()]+))/gu;
    for (const m of String(q || "").matchAll(re)) {
      const [, moins, ch, phrase, groupe, mot] = m;
      if (!moins && !ch && mot && OPS[mot]) { op = OPS[mot]; continue; }
      const cle = ch ? norm(ch) : "";
      const valeur = phrase != null ? phrase : groupe != null ? groupe : mot || "";
      if (cle === "base" || cle === "bases") {
        const l = valeur.split(/[\s,;]+/).map((v) => ALIAS_BASE[norm(v)]).filter((v) => v && BASE[v]);
        r.bases = moins ? BASES.map((b) => b.cle).filter((b) => !l.includes(b) && (!r.bases || r.bases.includes(b))) : l;
        continue;
      }
      if (cle === "date" || cle === "periode") {
        const [du, au] = valeur.includes("..") ? valeur.split("..") : [valeur, valeur];
        r.du = borne(du, false); r.au = borne(au, true);
        continue;
      }
      const champ = cle ? ALIAS_CHAMP[cle] : "tout";
      const brut = champ ? valeur : `${ch} ${valeur}`; // champ inconnu : on cherche le texte tel quel
      const mots = norm(brut).split(" ").filter(Boolean);
      if (!mots.length) continue;
      r.termes.push({ op: moins ? "SAUF" : op, champ: champ || "tout", phrase: phrase != null, mots, brut: brut.trim() });
      op = "ET";
    }
    return r;
  }

  function ecrire(r) {
    const val = (t) => (t.phrase ? `"${t.brut}"` : /\s/.test(t.brut) ? `(${t.brut})` : t.brut);
    const parts = r.termes.map((t, i) => {
      const op = t.op === "SAUF" ? "SAUF " : i && t.op === "OU" ? "OU " : "";
      return `${op}${t.champ === "tout" ? "" : t.champ + ":"}${val(t)}`;
    });
    if (r.bases && r.bases.length && r.bases.length < BASES.length) parts.push(`base:${r.bases.join(",")}`);
    if (r.du || r.au) parts.push(`date:${r.du}..${r.au}`);
    return parts.join(" ");
  }

  // ---------------------------------------------------------------- évaluation
  const vrai = (t, rec) => {
    const txt = rec.f[t.champ];
    if (!txt) return false;
    return t.phrase ? txt.includes(" " + t.mots.join(" ")) : t.mots.every((m) => txt.includes(" " + m));
  };
  /** Opérateurs lus de gauche à droite : a OU b SAUF c = (a OU b) SAUF c. */
  function evaluer(r, rec) {
    let v = null, score = 0;
    for (const t of r.termes) {
      const m = vrai(t, rec);
      if (m && t.op !== "SAUF") score += rec.f.titre && vrai({ ...t, champ: "titre" }, rec) ? 3 : 1;
      v = v === null ? (t.op === "SAUF" ? !m : m) : t.op === "ET" ? v && m : t.op === "OU" ? v || m : v && !m;
    }
    return { ok: v === null ? true : v, score };
  }
  const POIDS = { dossiers: 3, personnes: 3, communes: 2, documents: 1 };

  function executer(r) {
    if (!r.termes.length && !r.bases && !r.du && !r.au) return [];
    return INDEX.filter((rec) => {
      if (r.bases && !r.bases.includes(rec.base)) return false;
      if ((r.du || r.au) && BASE[rec.base].date) {
        if (!rec.debut) return false;
        if (r.au && rec.debut > r.au) return false;
        if (r.du && rec.fin < r.du) return false;
      }
      const v = evaluer(r, rec);
      rec.score = v.score + (r.termes.length ? POIDS[rec.base] || 0 : 0);
      return v.ok;
    });
  }
  const TRIS = {
    pertinence: (a, b) => b.score - a.score || (b.debut || "").localeCompare(a.debut || ""),
    recents: (a, b) => (b.debut || "").localeCompare(a.debut || "") || b.score - a.score,
    anciens: (a, b) => (a.debut || "9999").localeCompare(b.debut || "9999") || b.score - a.score,
  };

  window.RECHERCHE = { analyser, ecrire, executer, BASES, CHAMPS };
  if (document.body.dataset.page !== "recherche") return;

  // ---------------------------------------------------------------- page
  const p0 = new URLSearchParams(location.search);
  const etat = { q: p0.get("q") || "", vue: p0.get("vue") || "", tri: p0.get("tri") || "pertinence", n: 40 };
  let requete = analyser(etat.q);

  const uniques = (l) => [...new Set(l.flat(Infinity).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  const LISTES = {
    personne: uniques(D.personnes.map((p) => K.nomAffiche(p))),
    dossier: uniques(D.dossiers.map((d) => d.titre)),
    commune: uniques(D.communes.map((c) => c.nom)),
    theme: uniques([K.RUBRIQUES, Object.values(K.FAMILLES).map((f) => f.nom), D.documents.map((d) => d.themes || [])]),
    type: uniques([D.articles.map((a) => a.genre), D.documents.map((d) => d.type), D.dossiers.map((d) => d.type), D.faits.map((f) => f.type),
      D.personnes.map((p) => [p.nature, ...(p.qualite || [])])]),
    source: uniques([D.articles.map((a) => [a.source, a.typeSource]), D.documents.map((d) => [d.producteur, d.collection])]),
  };
  const EXEMPLES = [
    ["Tout ce qui relie un dossier et une personne", 'dossier:autonomie personne:simeoni'],
    ["Articles de justice de la presse régionale, depuis 2025", 'theme:justice source:(presse quotidienne régionale) base:articles date:2025..'],
    ["Études de l'Insee sur la démographie", 'source:insee theme:démographie base:documents'],
    ["Incendies et feux, hors rubriques justice et faits divers", 'incendie OU feux SAUF theme:justice'],
  ];

  main.innerHTML = `<div class="titre-page"><h1>Recherche</h1><span class="compte">${K.pluriel(INDEX.length, "fiche")} dans ${BASES.length} bases</span></div>
    <p class="chapo">Tapez des mots : la recherche porte sur les titres, les noms, et les fiches que la documentation a reliées à chaque article (personnes, dossiers, communes).
      Ouvrez la recherche avancée pour choisir les bases, combiner plusieurs masques et borner la période. Elle écrit sa requête dans la boîte, que vous pouvez corriger ou copier.</p>
    <form class="rech-form" role="search" aria-label="Recherche dans la base">
      <div class="rech-boite"><label class="sr" for="rq">Requête</label>
        <input id="rq" type="search" autocomplete="off" spellcheck="false" placeholder="Ex. : dossier:autonomie personne:simeoni" value="${e(etat.q)}">
        <button class="bouton" type="submit">Chercher</button>
        <button class="bouton second" type="button" id="bascule" aria-expanded="false" aria-controls="avancee">Recherche avancée</button></div>
      <div id="avancee" class="rech-avancee" hidden>
        <fieldset class="rech-bases"><legend>Chercher dans</legend>
          <div class="cases">${BASES.map((b) => `<label class="case"><input type="checkbox" name="base" value="${b.cle}">${b.nom} <span class="discret">${b.liste.length.toLocaleString("fr-FR")}</span></label>`).join("")}</div>
          <div class="rech-liens"><button type="button" class="lien-bouton" data-bases="tout">Tout cocher</button><button type="button" class="lien-bouton" data-bases="rien">Tout décocher</button></div>
        </fieldset>
        <fieldset class="rech-masques"><legend>Masques de recherche</legend>
          <p class="discret">Chaque masque cherche dans un champ. Les masques se combinent de haut en bas : ET restreint, OU élargit, SAUF écarte. Plusieurs mots dans un masque doivent tous s'y trouver ; des guillemets cherchent l'expression exacte.</p>
          <div id="masques"></div>
          <button type="button" class="bouton second" id="ajout">Ajouter un masque</button>
        </fieldset>
        <fieldset class="rech-periode"><legend>Période</legend>
          <div class="champ"><label for="du">Du</label><input id="du" inputmode="numeric" placeholder="2025 ou 2025-03"></div>
          <div class="champ"><label for="au">Au</label><input id="au" inputmode="numeric" placeholder="2025 ou 2025-03"></div>
          <p class="discret">Les fiches datées hors période sont écartées. Le répertoire et les communes, qui n'ont pas de date, ne sont pas filtrés.</p>
        </fieldset>
        <div class="rech-actions"><button class="bouton" type="submit">Chercher</button><button type="button" class="bouton second" id="effacer">Tout effacer</button></div>
      </div>
      ${Object.entries(LISTES).map(([k, l]) => `<datalist id="dl-${k}">${l.map((v) => `<option value="${e(v)}"></option>`).join("")}</datalist>`).join("")}
    </form>
    <div id="sortie" aria-live="polite"></div>
    <details class="rech-aide"><summary>Syntaxe de la boîte de recherche</summary>
      <dl class="reperes">
        <div><dt>mot1 mot2</dt><dd>tous les mots, en début de mot et sans tenir compte des accents : « port » trouve « portuaire », pas « rapport »</dd></div>
        <div><dt>"expression exacte"</dt><dd>les mots dans cet ordre</dd></div>
        <div><dt>champ:mot ou champ:(deux mots)</dt><dd>titre, personne, dossier, commune, theme, type, source</dd></div>
        <div><dt>ET, OU, SAUF, -mot</dt><dd>opérateurs en majuscules, lus de gauche à droite : a OU b SAUF c = (a OU b) SAUF c</dd></div>
        <div><dt>base:articles,dossiers</dt><dd>bases interrogées : articles, dossiers, faits, personnes, documents, agenda, notes, communes ; -base:communes en écarte une</dd></div>
        <div><dt>date:2024..2026-06</dt><dd>période ; une borne peut manquer : date:2025.. ou date:..2020</dd></div>
      </dl></details>`;

  const $ = (s) => main.querySelector(s);
  const boite = $("#rq"), avancee = $("#avancee"), bascule = $("#bascule");

  // ---- masques
  function ligneMasque(t, i) {
    const val = t.phrase ? `"${t.brut}"` : t.brut;
    const dl = LISTES[t.champ] ? ` list="dl-${t.champ}"` : "";
    return `<div class="masque" data-i="${i}">
      ${i ? `<label class="sr" for="mo${i}">Opérateur du masque ${i + 1}</label><select id="mo${i}" class="m-op">${["ET", "OU", "SAUF"].map((o) => `<option${o === t.op ? " selected" : ""}>${o}</option>`).join("")}</select>`
        : `<label class="sr" for="mo${i}">Le premier masque inclut ou exclut</label><select id="mo${i}" class="m-op"><option value="ET"${t.op !== "SAUF" ? " selected" : ""}>Contient</option><option value="SAUF"${t.op === "SAUF" ? " selected" : ""}>Sauf</option></select>`}
      <label class="sr" for="mc${i}">Champ du masque ${i + 1}</label>
      <select id="mc${i}" class="m-champ">${Object.entries(CHAMPS).map(([k, l]) => `<option value="${k}"${k === t.champ ? " selected" : ""}>${l}</option>`).join("")}</select>
      <label class="sr" for="mv${i}">Valeur du masque ${i + 1}</label>
      <input id="mv${i}" class="m-val" type="search" autocomplete="off"${dl} value="${e(val)}" placeholder="${t.champ === "tout" ? "mots ou &quot;expression exacte&quot;" : "choisir ou taper"}">
      <button type="button" class="m-suppr" aria-label="Retirer le masque ${i + 1}">×</button></div>`;
  }
  function dessinerMasques() {
    const t = requete.termes.length ? requete.termes : [{ op: "ET", champ: "tout", brut: "", mots: [] }];
    $("#masques").innerHTML = t.map(ligneMasque).join("");
    main.querySelectorAll('input[name="base"]').forEach((c) => (c.checked = !requete.bases || requete.bases.includes(c.value)));
    $("#du").value = requete.du; $("#au").value = requete.au;
  }
  /** Le formulaire réécrit la requête ; la boîte l'affiche. */
  function lireFormulaire() {
    const termes = [...main.querySelectorAll(".masque")].map((m) => {
      let brut = m.querySelector(".m-val").value.trim();
      const phrase = /^".*"$/.test(brut) && brut.length > 1;
      if (phrase) brut = brut.slice(1, -1).trim();
      brut = brut.replace(/["()]/g, " ").replace(/\s+/g, " ").trim();
      return { op: m.querySelector(".m-op").value, champ: m.querySelector(".m-champ").value, phrase, brut, mots: norm(brut).split(" ").filter(Boolean) };
    }).filter((t) => t.mots.length);
    const bases = [...main.querySelectorAll('input[name="base"]')].filter((c) => c.checked).map((c) => c.value);
    requete = { termes, bases: bases.length === BASES.length ? null : bases, du: borne($("#du").value, false), au: borne($("#au").value, true) };
    boite.value = ecrire(requete);
    etat.q = boite.value; etat.n = 40;
    resultats();
  }
  const ouvrir = (o) => { avancee.hidden = !o; bascule.setAttribute("aria-expanded", String(o)); if (o) dessinerMasques(); };

  // ---- résultats
  let trouves = [];
  function resultats() {
    K.etatUrl({ q: etat.q, vue: etat.vue, tri: etat.tri === "pertinence" ? "" : etat.tri });
    const sortie = $("#sortie");
    if (!etat.q.trim()) {
      sortie.innerHTML = `<section class="bloc"><h2>Exemples</h2><div class="liste">${EXEMPLES.map(([t, q]) =>
        `<div class="rang"><div class="quand">Exemple</div><div class="quoi"><div class="intitule"><a href="recherche.html?q=${encodeURIComponent(q)}">${e(t)}</a></div><div class="meta"><code>${e(q)}</code></div></div></div>`).join("")}</div></section>`;
      return;
    }
    trouves = executer(requete).sort(TRIS[etat.tri] || TRIS.pertinence);
    const parBase = Object.fromEntries(BASES.map((b) => [b.cle, trouves.filter((r) => r.base === b.cle)]));
    if (etat.vue && !parBase[etat.vue]) etat.vue = "";
    if (!trouves.length) {
      sortie.innerHTML = `<div class="vide">Aucune fiche ne répond à <code>${e(etat.q)}</code>. Retirez un masque, élargissez la période ou cherchez dans « Tout le texte » plutôt que dans un champ précis.</div>`;
      return;
    }
    const pastille = (cle, nom, n) => `<button type="button" class="pastille" data-vue="${cle}" aria-pressed="${etat.vue === cle}">${e(nom)} <i>${n.toLocaleString("fr-FR")}</i></button>`;
    const nomN = (b, n) => K.pluriel(n, b.un, b.plusieurs);
    let corps;
    if (etat.vue) {
      const b = BASE[etat.vue], l = parBase[etat.vue];
      corps = `<section class="bloc"><h2>${b.nom} <span class="compte">${l.length}</span></h2><div class="liste">${l.slice(0, etat.n).map((r) => b.rendu(r.x)).join("")}</div>
        ${l.length > etat.n ? `<button type="button" class="bouton second plus" id="plus">Afficher ${Math.min(40, l.length - etat.n)} de plus (${l.length - etat.n} restants)</button>` : ""}</section>`;
    } else {
      corps = BASES.filter((b) => parBase[b.cle].length).sort((a, c) => {
        const s = (k) => Math.max(...parBase[k].map((r) => r.score));
        return etat.tri === "pertinence" ? s(c.cle) - s(a.cle) : 0;
      }).map((b) => {
        const l = parBase[b.cle];
        return `<section class="bloc"><h2>${b.nom} <span class="compte">${l.length}</span></h2><div class="liste">${l.slice(0, 5).map((r) => b.rendu(r.x)).join("")}</div>
          ${l.length > 5 ? `<button type="button" class="lien-bouton voir-base" data-vue="${b.cle}">Voir les ${nomN(b, l.length)}</button>` : ""}</section>`;
      }).join("");
    }
    sortie.innerHTML = `<div class="rech-bilan"><p><b>${K.pluriel(trouves.length, "fiche trouvée", "fiches trouvées")}</b> pour <code>${e(etat.q)}</code></p>
        <div class="rech-outils"><label for="tri">Trier par</label><select id="tri">${[["pertinence", "Pertinence"], ["recents", "Plus récents"], ["anciens", "Plus anciens"]]
          .map(([k, l]) => `<option value="${k}"${k === etat.tri ? " selected" : ""}>${l}</option>`).join("")}</select>
          <button type="button" class="bouton second" id="csv">Exporter en tableur</button></div></div>
      <div class="pastilles" role="group" aria-label="Afficher une base">${pastille("", "Toutes", trouves.length)}${BASES.filter((b) => parBase[b.cle].length).map((b) => pastille(b.cle, b.nom, parBase[b.cle].length)).join("")}</div>
      ${corps}`;
  }

  function exporter() {
    const l = etat.vue ? trouves.filter((r) => r.base === etat.vue) : trouves;
    const cel = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const absolu = (u) => (u && !/^https?:/.test(u) ? new URL(u, location.href).href : u || "");
    const lignes = [["Base", "Titre", "Date", "Source ou producteur", "Rubrique ou thème", "Type", "Fiche", "Lien externe"]].concat(
      l.map((r) => {
        const b = BASE[r.base], x = r.x, [src, rub, type, fiche, lien] = b.csv(x);
        return [b.nom, x.titre || x.nom, r.debut, src, rub, type, absolu(fiche), lien];
      })
    );
    const blob = new Blob(["﻿" + lignes.map((c) => c.map(cel).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `recherche-${K.aujourdHui()}.csv`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---- événements
  let minuterie;
  boite.addEventListener("input", () => {
    clearTimeout(minuterie);
    minuterie = setTimeout(() => {
      etat.q = boite.value; etat.n = 40;
      requete = analyser(etat.q);
      if (!avancee.hidden) dessinerMasques();
      resultats();
    }, 180);
  });
  main.querySelector("form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (!avancee.hidden && ev.submitter && avancee.contains(ev.submitter)) lireFormulaire();
    else { etat.q = boite.value; requete = analyser(etat.q); if (!avancee.hidden) dessinerMasques(); resultats(); }
  });
  bascule.addEventListener("click", () => ouvrir(avancee.hidden));
  avancee.addEventListener("input", (ev) => { if (ev.target.matches(".m-val, #du, #au")) { clearTimeout(minuterie); minuterie = setTimeout(lireFormulaire, 250); } });
  avancee.addEventListener("change", (ev) => {
    if (ev.target.matches(".m-champ")) {
      const v = ev.target.closest(".masque").querySelector(".m-val"), k = ev.target.value;
      if (LISTES[k]) v.setAttribute("list", "dl-" + k); else v.removeAttribute("list");
    }
    if (ev.target.matches("select, input[type=checkbox]")) lireFormulaire();
  });
  avancee.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.id === "ajout") {
      const n = main.querySelectorAll(".masque").length;
      $("#masques").insertAdjacentHTML("beforeend", ligneMasque({ op: "ET", champ: "tout", brut: "", mots: [] }, n));
      $(`#mv${n}`).focus();
    } else if (b.classList.contains("m-suppr")) {
      const tous = main.querySelectorAll(".masque");
      if (tous.length === 1) tous[0].querySelector(".m-val").value = "";
      else b.closest(".masque").remove();
      lireFormulaire();
      if (tous.length > 1) dessinerMasques();
    } else if (b.dataset.bases) {
      main.querySelectorAll('input[name="base"]').forEach((c) => (c.checked = b.dataset.bases === "tout"));
      lireFormulaire();
    } else if (b.id === "effacer") {
      requete = analyser(""); dessinerMasques(); boite.value = ""; etat.q = ""; etat.vue = ""; resultats(); boite.focus();
    }
  });
  $("#sortie").addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.vue != null) { etat.vue = b.dataset.vue; etat.n = 40; resultats(); $("#sortie").scrollIntoView({ block: "start" }); }
    else if (b.id === "plus") { etat.n += 40; resultats(); }
    else if (b.id === "csv") exporter();
  });
  $("#sortie").addEventListener("change", (ev) => { if (ev.target.id === "tri") { etat.tri = ev.target.value; resultats(); } });

  ouvrir(p0.get("avancee") === "1" || requete.termes.some((t) => t.champ !== "tout" || t.op !== "ET") || !!requete.bases || !!requete.du || !!requete.au);
  resultats();
  if (!etat.q) boite.focus();
})();
