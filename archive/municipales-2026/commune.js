function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}
function normalize(s){
  return (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/’/g,"'").trim();
}
async function loadJson(url){
  const r = await fetch(url, {cache:"no-cache"});
  if (!r.ok) throw new Error(`fetch ${url} -> ${r.status}`);
  return r.json();
}
function getParam(name){
  const u = new URL(window.location.href);
  return u.searchParams.get(name) || "";
}
function splitCandidates(s){
  if (!s) return [];
  return String(s).split(",").map(x => x.trim()).filter(Boolean);
}

async function boot(){
  const id = getParam("id");
  const backMap = document.getElementById("backMap");
  backMap.href = `index.html?communeId=${encodeURIComponent(id)}`;

  try{
    const [communes, candidats] = await Promise.all([
      loadJson("data/communes_meta.json"),
      loadJson("data/candidats.json")
    ]);

    const c = communes.find(x => x.id === id);
    if (!c){
      document.getElementById("commCard").innerHTML = "Commune introuvable.";
      return;
    }

    document.title = `${c.nom} – Municipales Corse 2026`;

    const img = c.photo_asset || "";
    const imgRemote = c.photo_url || "";
    const imgHtml = (img || imgRemote) ? `
      <img class="thumb" style="width:96px;height:96px" src="${escapeHtml(img)}" alt="${escapeHtml(c.nom)}"
           onerror="this.onerror=null; ${imgRemote ? `this.src='${escapeHtml(imgRemote)}';` : "this.style.display='none';"}">`
      : "";

    const candNames = splitCandidates(c.candidats);
    const candLinks = candNames.map(n => {
      const cand = candidats.find(x =>
        normalize(x.name) === normalize(n) &&
        normalize((x.commune || x.maire_sortant_de || "")) === normalize(c.nom)
      );
      if (cand){
        return `<div>• <a href="candidat.html?id=${encodeURIComponent(cand.id)}">${escapeHtml(n)}</a></div>`;
      }
      return `<div>• ${escapeHtml(n)}</div>`;
    }).join("");

    document.getElementById("commCard").innerHTML = `
      <div class="comm-head">
        ${imgHtml}
        <div>
          <div class="card-title" style="font-size:22px">${escapeHtml(c.nom)}</div>
          <div class="card-sub">${escapeHtml(c.departement)} • ${escapeHtml(c.epci || "")}</div>
        </div>
      </div>

      <div class="badges">
        <span class="badge">Habitants : ${c.habitants ?? "—"}</span>
        <span class="badge">Listes : ${c.nb_listes ?? "—"}</span>
      </div>

      <div class="details">
        <div><span class="muted">Maire sortant :</span> ${escapeHtml(c.maire_sortant || "—")}</div>
        <div style="margin-top:10px"><span class="muted">Candidats déclarés :</span></div>
        ${candLinks || `<div class="muted">—</div>`}
      </div>
    `;
  } catch(err){
    console.error(err);
    document.getElementById("commCard").innerHTML = "Erreur de chargement.";
  }
}
boot();
