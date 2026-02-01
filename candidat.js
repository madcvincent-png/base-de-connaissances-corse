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

async function boot(){
  const id = getParam("id");
  const backCommune = document.getElementById("backCommune");
  try{
    const candidats = await loadJson("data/candidats.json");
    const c = candidats.find(x => x.id === id);
    if (!c){
      document.getElementById("candCard").innerHTML = "Candidat introuvable.";
      return;
    }
    const commune = c.commune || c.maire_sortant_de || "";
    backCommune.href = `index.html?commune=${encodeURIComponent(commune)}`;

    const img = c.photo_asset || "";
    const imgRemote = c.photo_url || "";
    const imgHtml = (img || imgRemote) ? `
      <img class="thumb" style="width:96px;height:96px" src="${escapeHtml(img)}" alt="${escapeHtml(c.name)}"
           onerror="this.onerror=null; ${imgRemote ? `this.src='${escapeHtml(imgRemote)}';` : "this.style.display='none';"}">`
      : "";

    document.title = c.name + " – Municipales Corse 2026";
    document.getElementById("candCard").innerHTML = `
      <div class="comm-head">
        ${imgHtml}
        <div>
          <div class="card-title" style="font-size:22px">${escapeHtml(c.name)}</div>
          <div class="card-sub">${escapeHtml(commune || "—")}</div>
        </div>
      </div>
      <div class="details" style="margin-top:10px">
        ${c.articles ? `<div><span class="muted">Articles :</span> ${escapeHtml(c.articles)}</div>` : `<div class="muted">Aucune source liée pour le moment.</div>`}
      </div>
    `;
  } catch(err){
    console.error(err);
    document.getElementById("candCard").innerHTML = "Erreur de chargement.";
  }
}
boot();
