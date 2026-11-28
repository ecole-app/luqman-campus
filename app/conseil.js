// Luqmân Campus — étape 5 : conseil de classe en mode deux écrans.
// Écran de pilotage (direction ou professeur principal) : élève par élève, mention, appréciation générale, suivi interne.
// Écran projeté (?projection=<id du conseil>, sur un autre appareil ou une autre fenêtre) : suit le pilotage en direct
// (Supabase Realtime, sinon relecture toutes les 4 s ; dans le même navigateur, BroadcastChannel instantané).
// L'écran projeté n'affiche jamais les remarques internes ni les élèves « à revoir ».
(function () {
  const { LOAD, insererOnglet } = window.LCVS;
  const { refaire, estReseau } = window.LCVS.outils;
  const O = window.LCVS.notesOutils, N = O.N, { fmt, opt } = O;
  const BO = () => window.LCVS.bulletinsOutils;
  const PROJ = new URLSearchParams(location.search).get('projection');
  const C = { photos: {}, photosVer: null, classeId: '', periodeId: '', conseil: null, suivi: {}, data: null, prev: null, err: '', tempsReel: false, canal: null, sondage: null, etat: '', minuteurA: null };
  window.__LC.C = C;
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('lc-conseil') : null;

  const css = document.createElement('style');
  css.textContent = `
    body.lc-proj { background:#06201d; overflow:hidden; } body.lc-proj header, body.lc-proj nav, body.lc-proj .bandeau { display:none !important; }
    body.lc-proj main { max-width:none; padding:0; margin:0; }
    .pj-ecran { position:fixed; inset:0; background:#06201d; display:flex; align-items:center; justify-content:center; }
    .pj-cadre { position:relative; overflow:hidden; } .pj-ecran .pj-cadre { width:100vw; height:100vh; }
    .pj-mini { width:100%; aspect-ratio:16/9; border-radius:10px; border:1px solid var(--filet); background:#06201d; }
    .pj { position:absolute; left:0; top:0; width:1280px; height:720px; transform-origin:0 0; box-sizing:border-box; padding:36px 48px; color:#f4efe2;
      background:radial-gradient(1200px 600px at 85% -10%, rgba(212,160,23,.18), transparent 60%), linear-gradient(160deg,#0A2E2A 0%,#0b3a34 55%,#082824 100%);
      font-family:'DM Sans',system-ui,sans-serif; display:flex; flex-direction:column; gap:18px; }
    .pj * { box-sizing:border-box; }
    .pj .pj-entete { display:flex; justify-content:space-between; align-items:center; font-size:17px; color:#cfe3df; letter-spacing:.04em; text-transform:uppercase; border-bottom:1px solid rgba(212,160,23,.35); padding-bottom:12px; }
    .pj .pj-entete b { color:#D4A017; font-weight:700; }
    .pj h1 { font-family:'Playfair Display',serif; font-weight:700; margin:0; line-height:1.05; }
    .pj .pj-scene { flex:1; min-height:0; display:grid; gap:26px; animation:pjEntree .45s ease both; }
    @keyframes pjEntree { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }
    .pj .pj-carte { background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1); border-radius:18px; padding:18px 22px; min-height:0; overflow:hidden; }
    .pj .pj-carte h3 { margin:0 0 12px; font-size:15px; letter-spacing:.08em; text-transform:uppercase; color:#D4A017; font-weight:700; }
    .pj .pj-kpis { display:flex; gap:16px; } .pj .pj-kpi { flex:1; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1); border-radius:16px; padding:14px 18px; }
    .pj .pj-kpi span { display:block; font-size:14px; color:#a9c4be; text-transform:uppercase; letter-spacing:.05em; } .pj .pj-kpi b { font-size:40px; font-weight:700; }
    .pj .haut { color:#F5C542; } .pj .bas { color:#ff6b5f; }
    .pj .pj-barres { display:flex; flex-direction:column; gap:10px; }
    .pj .pj-ligne { display:grid; grid-template-columns:240px 1fr 64px; gap:14px; align-items:center; font-size:18px; }
    .pj .pj-ligne .nom { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .pj .pj-ligne .val { text-align:right; font-weight:700; font-size:20px; }
    .pj .pj-piste { position:relative; height:16px; background:rgba(255,255,255,.08); border-radius:8px; }
    .pj .pj-piste .plage { position:absolute; top:0; bottom:0; background:rgba(212,160,23,.18); border-radius:8px; }
    .pj .pj-piste .barre { position:absolute; left:0; top:0; bottom:0; border-radius:8px; background:linear-gradient(90deg,#0D9488,#2dd4bf); }
    .pj .pj-piste .barre.haut { background:linear-gradient(90deg,#b8860b,#F5C542); } .pj .pj-piste .barre.bas { background:linear-gradient(90deg,#9b1c13,#ff6b5f); }
    .pj .pj-piste .repere { position:absolute; top:-5px; bottom:-5px; width:3px; background:#f4efe2; border-radius:2px; }
    .pj .pj-ligne .appr { grid-column:2 / 4; font-size:14px; color:#cfe3df; line-height:1.3; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; margin-top:-4px; }
    .pj .compact .pj-ligne { font-size:16px; } .pj .compact .pj-ligne .appr { -webkit-line-clamp:1; font-size:13px; } .pj .compact .pj-barres { gap:6px; } .pj .compact .pj-piste { height:12px; }
    .pj .pj-histo { display:flex; align-items:flex-end; gap:14px; height:250px; padding-top:20px; }
    .pj .pj-histo div { flex:1; display:flex; flex-direction:column; align-items:center; gap:6px; height:100%; justify-content:flex-end; font-size:15px; color:#cfe3df; }
    .pj .pj-histo i { display:block; width:100%; border-radius:10px 10px 4px 4px; background:linear-gradient(180deg,#2dd4bf,#0D9488); min-height:4px; }
    .pj .pj-histo b { font-size:22px; color:#f4efe2; }
    .pj .pj-moy { width:190px; height:190px; border-radius:50%; border:6px solid #D4A017; display:flex; flex-direction:column; align-items:center; justify-content:center; margin:6px 0 10px; background:rgba(0,0,0,.18); }
    .pj .pj-moy b { font-size:62px; line-height:1; } .pj .pj-moy span { font-size:15px; color:#a9c4be; }
    .pj .pj-mention { display:inline-block; padding:8px 20px; border-radius:999px; background:#D4A017; color:#0A2E2A; font-weight:700; font-size:22px; }
    .pj .pj-mention.av { background:#ff6b5f; color:#2a0805; }
    .pj .pj-info { font-size:18px; color:#cfe3df; margin:6px 0; } .pj .pj-info b { color:#f4efe2; }
    .pj .pj-gen { font-size:21px; line-height:1.4; font-style:italic; color:#f4efe2; }
    .pj .pj-accueil { place-content:center; text-align:center; gap:14px; }
    .pj .pj-logo { width:110px; height:110px; margin:0 auto 10px; border-radius:26px; border:3px solid #D4A017; display:flex; align-items:center; justify-content:center; font-family:'Playfair Display',serif; font-size:52px; color:#D4A017; font-weight:700; }
    .pj .pj-chips { display:flex; flex-wrap:wrap; gap:8px; } .pj .pj-chips span { background:rgba(255,255,255,.1); border-radius:999px; padding:6px 14px; font-size:17px; }
    .pj .pj-pied { font-size:13px; color:#7fa49c; display:flex; justify-content:space-between; }
    .pj .pj-ident { display:flex; gap:18px; align-items:center; }
    .pj .pj-photo { width:120px; height:150px; flex:none; border-radius:16px; object-fit:cover; border:3px solid #D4A017; background:#0d3a34; display:flex; align-items:center; justify-content:center; font-family:'Playfair Display',serif; font-size:44px; color:#D4A017; }
    .cs-photo { width:72px; height:90px; border-radius:10px; object-fit:cover; border:2px solid var(--or); background:#eee7d6; display:flex; align-items:center; justify-content:center; font-weight:700; color:var(--vert); flex:none; }
    .cs-fichier { position:relative; overflow:hidden; } .cs-fichier input { position:absolute; inset:0; opacity:0; cursor:pointer; }
    .pj-plein { position:fixed; right:16px; bottom:16px; z-index:20; opacity:.75; }
    .pj-erreur { color:#f4efe2; font-family:'DM Sans',sans-serif; text-align:center; padding:40px; font-size:20px; max-width:700px; }
    .cs-pilote { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:14px; } @media (max-width:860px) { .cs-pilote { grid-template-columns:1fr; } }
    .cs-eleves { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0; } .cs-eleves button { border:1px solid var(--filet); background:#fff; border-radius:999px; padding:6px 11px; font:inherit; font-size:13px; cursor:pointer; }
    .cs-eleves button.on { background:var(--vert); color:#fff; border-color:var(--vert); } .cs-eleves button.vu { border-color:var(--ok); } .cs-eleves button .m { font-size:11px; color:var(--or); font-weight:700; }
    .cs-vues { display:flex; gap:4px; flex-wrap:wrap; } .cs-vues button { border:1px solid var(--filet); background:#fff; padding:8px 12px; border-radius:10px; font:inherit; cursor:pointer; } .cs-vues button.on { background:var(--or); color:var(--vert); font-weight:700; border-color:var(--or); }
    .cs-pilote textarea { width:100%; min-height:80px; font:inherit; padding:8px; border-radius:10px; border:1px solid #d8d0bd; resize:vertical; }
    .cs-tab td.c, .cs-tab th.c { text-align:center; } .cs-lien { width:100%; font-size:12px; }
  `;
  document.head.appendChild(css);

  // ---------- Outils ----------
  const H = 1280, V = 720;
  const nomEl = e => e ? `${e.prenom} ${e.nom}` : '';
  const n = v => v == null ? null : Number(v);
  const f = v => v == null || Number.isNaN(v) ? '—' : fmt(v);
  const cls = v => v == null ? '' : v >= N.params.haut ? 'haut' : v < N.params.bas ? 'bas' : '';
  const peutAnimer = () => !!N.droits.admin || (N.droits.pp || []).includes(C.classeId);
  const opts = () => Object.assign({ rang: false, absences: true, appreciations: true }, (C.conseil && C.conseil.options) || {});
  const lienProjection = () => location.origin + location.pathname + '?projection=' + C.conseil.id;
  const eleves = () => (C.data && C.data.eleves) || [];
  const eleveCourant = () => eleves().find(e => e.id === (C.conseil && C.conseil.eleve_id)) || null;
  const moyPrev = id => { const e = C.prev && C.prev.eleves.find(x => x.id === id); return e ? n(e.moyenne) : null; };
  const duree = () => { if (!C.conseil) return ''; const f = C.conseil.fin ? new Date(C.conseil.fin) : new Date(); const m = Math.max(0, Math.round((f - new Date(C.conseil.debut)) / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
  const initiales = e => ((e.prenom || '').charAt(0) + (e.nom || '').charAt(0)).toUpperCase();
  const photo = (e, classe) => C.photos[e.id] ? `<img class="${classe}" src="${C.photos[e.id]}" alt="Photo de ${esc(nomEl(e))}">` : `<div class="${classe}">${esc(initiales(e))}</div>`;
  async function chargerPhotos() {
    C.photos = {}; const ids = eleves().map(e => e.id); if (!ids.length) return;
    const r = await sb.from('photos_eleves').select('eleve_id,image').in('eleve_id', ids);
    if (!r.error) (r.data || []).forEach(x => { C.photos[x.eleve_id] = x.image; });
    C.photosVer = (C.conseil && C.conseil.options && C.conseil.options.photos) || null;
  }
  // Photo réduite dans l'appli (recadrée 4:5, 300 × 375 px, JPEG) : légère à stocker et à projeter.
  async function compresser(fichier) {
    if (!/^image\//.test(fichier.type)) throw new Error(fichier.name + ' : ce n’est pas une image.');
    const url = URL.createObjectURL(fichier);
    try {
      const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error(fichier.name + ' : image illisible.')); i.src = url; });
      const L = 300, Hh = 375, r = L / Hh, sw = img.width / img.height > r ? img.height * r : img.width, sh = img.width / img.height > r ? img.height : img.width / r;
      const cv = document.createElement('canvas'); cv.width = L; cv.height = Hh;
      cv.getContext('2d').drawImage(img, (img.width - sw) / 2, (img.height - sh) / 3, sw, sh, 0, 0, L, Hh);
      let q = 0.85, d = cv.toDataURL('image/jpeg', q); while (d.length > 190000 && q > 0.4) { q -= 0.1; d = cv.toDataURL('image/jpeg', q); }
      return d;
    } finally { URL.revokeObjectURL(url); }
  }
  const sansAccent = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const estAvert = m => /avertissement/i.test(m || '');
  const ajusterEchelle = () => document.querySelectorAll('.pj-cadre').forEach(c => { const p = c.querySelector('.pj'); if (!p) return; const k = Math.min(c.clientWidth / H, c.clientHeight / V) || 0.3;
    p.style.transform = `scale(${k})`; p.style.left = Math.max(0, (c.clientWidth - H * k) / 2) + 'px'; p.style.top = Math.max(0, (c.clientHeight - V * k) / 2) + 'px'; });
  window.addEventListener('resize', ajusterEchelle);

  // ---------- L'écran projeté (une scène 1280×720 mise à l'échelle) ----------
  function sceneProjection(cs, D, o) {
    if (!cs || !D) return '';
    const ent = (titre, droite) => `<div class="pj-entete"><span><b>${esc(D.classe.nom)}</b> · ${esc(D.periode.libelle)} · ${esc(titre)}</span><span>${droite || esc(D.etablissement.nom || '')}</span></div>`;
    const pied = `<div class="pj-pied"><span>Luqmân Campus · conseil de classe</span><span>${esc(D.periode.annee || '')}</span></div>`;
    if (cs.vue === 'accueil') return `<div class="pj"><div class="pj-scene pj-accueil"><div class="pj-logo">LC</div>
      <div style="font-size:22px;letter-spacing:.2em;text-transform:uppercase;color:#D4A017">Conseil de classe</div><h1 style="font-size:96px">${esc(D.classe.nom)}</h1>
      <div style="font-size:28px;color:#cfe3df">${esc(D.periode.libelle)} · ${esc(D.periode.annee || '')}</div>
      <div style="font-size:20px;color:#a9c4be;margin-top:18px">${esc(D.etablissement.nom || '')}${D.classe.prof_principal ? ' · Professeur principal : ' + esc(D.classe.prof_principal) : ''}</div></div></div>`;
    const els = D.eleves, gens = els.map(e => n(e.moyenne)).filter(v => v != null);
    if (cs.vue === 'synthese') {
      const mentions = [...new Set(els.map(e => e.mention).filter(Boolean))], sans = els.filter(e => !e.mention).length;
      return `<div class="pj">${ent('Synthèse du conseil')}<div class="pj-scene" style="grid-template-rows:auto 1fr">
        <div class="pj-kpis"><div class="pj-kpi"><span>Moyenne de la classe</span><b class="${cls(n(D.moyenne_classe))}">${f(n(D.moyenne_classe))}</b></div>
          <div class="pj-kpi"><span>Mentions attribuées</span><b>${els.length - sans}</b></div><div class="pj-kpi"><span>Élèves</span><b>${els.length}</b></div></div>
        <div class="pj-carte"><h3>Mentions et avertissements</h3>${mentions.map(m => { const l = els.filter(e => e.mention === m);
          return `<div style="margin-bottom:14px"><span class="pj-mention ${estAvert(m) ? 'av' : ''}" style="font-size:18px;padding:5px 14px">${esc(m)} · ${l.length}</span><div class="pj-chips" style="margin-top:8px">${l.map(e => `<span>${esc(nomEl(e))}</span>`).join('')}</div></div>`; }).join('') || '<p class="pj-info">Aucune mention pour l’instant.</p>'}</div>
        </div>${pied}</div>`;
    }
    if (cs.vue === 'eleve' && cs.eleve_id) {
      const e = els.find(x => x.id === cs.eleve_id); if (!e) return `<div class="pj">${ent('Élève')}<div class="pj-scene"><p class="pj-info">Élève introuvable.</p></div></div>`;
      const i = els.indexOf(e) + 1, m = n(e.moyenne), m0 = moyPrev(e.id), ab = e.absences || {};
      const ens = D.enseignements, compact = ens.length > 7 || (o.appreciations && ens.length > 5);
      const lignes = ens.map(en => { const r = (e.resultats || {})[en.id] || {}, v = n(r.moyenne), mc = n(en.moyenne_classe);
        return `<div class="pj-ligne"><span class="nom">${esc(en.matiere)}</span><div class="pj-piste">${v != null ? `<i class="barre ${cls(v)}" style="width:${v * 5}%"></i>` : ''}${mc != null ? `<i class="repere" style="left:calc(${mc * 5}% - 1px)" title="Moyenne de la classe"></i>` : ''}</div>
          <span class="val ${cls(v)}">${v != null ? fmt(v) : '—'}</span>${o.appreciations && r.appreciation ? `<div class="appr">${esc(r.appreciation)}</div>` : ''}</div>`; }).join('');
      return `<div class="pj">${ent('Élève ' + i + ' / ' + els.length)}<div class="pj-scene" style="grid-template-columns:380px 1fr">
        <div class="pj-carte" style="display:flex;flex-direction:column">
          <div class="pj-ident">${photo(e, 'pj-photo')}<h1 style="font-size:40px">${esc(e.prenom)}<br>${esc(e.nom)}</h1></div>
          <div class="pj-moy" style="width:160px;height:160px"><b class="${cls(m)}">${m != null ? fmt(m) : '—'}</b><span>moyenne générale</span></div>
          ${m != null && m0 != null && Math.abs(m - m0) >= 0.1 ? `<div class="pj-info"><b class="${m > m0 ? 'haut' : 'bas'}">${m > m0 ? '▲ +' : '▼ '}${fmt(Math.round((m - m0) * 100) / 100)}</b> depuis la période précédente</div>` : ''}
          <div class="pj-info">Moyenne de la classe : <b>${f(n(D.moyenne_classe))}</b></div>
          ${o.rang && e.rang ? `<div class="pj-info">Rang : <b>${e.rang}</b> sur ${els.length}</div>` : ''}
          ${o.absences ? `<div class="pj-info">Absences : <b>${ab.demi_journees || 0}</b> demi-journée${ab.demi_journees > 1 ? 's' : ''}${ab.non_justifiees ? ` (dont ${ab.non_justifiees} non justifiée${ab.non_justifiees > 1 ? 's' : ''})` : ''} · Retards : <b>${ab.retards || 0}</b></div>` : ''}
          <div style="margin-top:auto">${e.mention ? `<span class="pj-mention ${estAvert(e.mention) ? 'av' : ''}">${esc(e.mention)}</span>` : ''}</div></div>
        <div style="display:grid;grid-template-rows:1fr auto;gap:18px;min-height:0">
          <div class="pj-carte ${compact ? 'compact' : ''}"><h3>Résultats par matière <span style="color:#a9c4be;text-transform:none;letter-spacing:0;font-weight:400">— le trait blanc : moyenne de la classe</span></h3><div class="pj-barres">${lignes}</div></div>
          <div class="pj-carte"><h3>Appréciation générale</h3><div class="pj-gen">${e.generale ? esc(e.generale) : '<span style="color:#a9c4be">À rédiger pendant le conseil.</span>'}</div></div></div>
        </div></div>`;
    }
    // Vue d'ensemble de la classe (aucun nom d'élève).
    const tranches = [[0, 8, '< 8'], [8, 10, '8 – 10'], [10, 12, '10 – 12'], [12, 14, '12 – 14'], [14, 16, '14 – 16'], [16, 20.01, '≥ 16']].map(([a, b, l]) => [l, gens.filter(v => v >= a && v < b).length]);
    const maxT = Math.max(1, ...tranches.map(t => t[1])), absTot = els.reduce((s, e) => s + ((e.absences || {}).demi_journees || 0), 0);
    const lignes = D.enseignements.map(en => { const v = n(en.moyenne_classe), mi = n(en.min), ma = n(en.max);
      return `<div class="pj-ligne"><span class="nom">${esc(en.matiere)}</span><div class="pj-piste">${mi != null && ma != null ? `<i class="plage" style="left:${mi * 5}%;width:${(ma - mi) * 5}%"></i>` : ''}${v != null ? `<i class="barre ${cls(v)}" style="width:${v * 5}%;opacity:.9"></i>` : ''}</div><span class="val ${cls(v)}">${v != null ? fmt(v) : '—'}</span></div>`; }).join('');
    return `<div class="pj">${ent('Vue d’ensemble')}<div class="pj-scene" style="grid-template-rows:auto 1fr">
      <div class="pj-kpis"><div class="pj-kpi"><span>Moyenne de la classe</span><b class="${cls(n(D.moyenne_classe))}">${f(n(D.moyenne_classe))}</b></div>
        <div class="pj-kpi"><span>Plus haute</span><b class="haut">${gens.length ? fmt(Math.max(...gens)) : '—'}</b></div><div class="pj-kpi"><span>Plus basse</span><b class="${gens.length && Math.min(...gens) < N.params.bas ? 'bas' : ''}">${gens.length ? fmt(Math.min(...gens)) : '—'}</b></div>
        <div class="pj-kpi"><span>Élèves</span><b>${els.length}</b></div>${o.absences ? `<div class="pj-kpi"><span>Demi-journées d’absence</span><b>${absTot}</b></div>` : ''}</div>
      <div style="display:grid;grid-template-columns:1.35fr 1fr;gap:22px;min-height:0">
        <div class="pj-carte ${D.enseignements.length > 9 ? 'compact' : ''}"><h3>Moyennes par matière <span style="color:#a9c4be;text-transform:none;letter-spacing:0;font-weight:400">— zone dorée : de la plus basse à la plus haute</span></h3><div class="pj-barres">${lignes}</div></div>
        <div class="pj-carte"><h3>Répartition des moyennes générales</h3><div class="pj-histo">${tranches.map(([l, c]) => `<div><b>${c}</b><i style="height:${Math.round(c / maxT * 100)}%"></i><span>${l}</span></div>`).join('')}</div></div></div>
      </div>${pied}</div>`;
  }
  const cadre = (cs, D, o, classe) => `<div class="pj-cadre ${classe || ''}">${sceneProjection(cs, D, o)}</div>`;

  // ---------- Synchronisation de l'écran projeté ----------
  let minuteurD = null;
  function recevoir(row) {
    if (!row || !C.conseil || row.id !== C.conseil.id) return;
    if (row.revision === C.conseil.revision && row.vue === C.conseil.vue && row.eleve_id === C.conseil.eleve_id) return;
    C.conseil = row;
    if (((row.options || {}).photos || null) !== C.photosVer) chargerPhotos().then(refaire); else refaire();
    clearTimeout(minuteurD); minuteurD = setTimeout(rafraichirDonnees, 300);
  }
  async function rafraichirDonnees() {
    if (!C.conseil) return;
    const r = await sb.rpc('donnees_bulletins', { p_classe: C.conseil.classe_id, p_periode: C.conseil.periode_id });
    if (!r.error && r.data && JSON.stringify(r.data) !== JSON.stringify(C.data)) { C.data = r.data; refaire(); }
  }
  function ecouter() {
    if (bc) bc.onmessage = ev => recevoir(ev.data);
    if (typeof sb.channel === 'function' && !C.canal) {
      try {
        C.canal = sb.channel('conseil-' + C.conseil.id)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conseils', filter: 'id=eq.' + C.conseil.id }, p => recevoir(p.new))
          .subscribe(st => { C.tempsReel = st === 'SUBSCRIBED'; });
      } catch (e) { C.tempsReel = false; }
    }
    clearInterval(C.sondage);
    C.sondage = setInterval(async () => { if (C.tempsReel) return;
      const r = await sb.from('conseils').select('*').eq('id', C.conseil.id).maybeSingle(); if (!r.error && r.data) recevoir(r.data); }, 4000);
  }

  // ---------- Chargements ----------
  async function chargerProjection() {
    document.body.classList.add('lc-proj');
    const r = await sb.from('conseils').select('*').eq('id', PROJ).maybeSingle();
    if (r.error) { C.err = estReseau(r.error) ? 'Pas de connexion : l’écran projeté a besoin du réseau.' : r.error.message; return; }
    if (!r.data) { C.err = 'Conseil introuvable. Vérifie le lien, et que cet appareil est connecté avec le compte de la direction ou du professeur principal.'; return; }
    C.conseil = r.data;
    try { const d = await BO().preparer(r.data.classe_id, r.data.periode_id); C.data = d.data; C.prev = d.prev; } catch (e) { C.err = String(e.message || e); return; }
    await chargerPhotos();
    ecouter();
  }
  async function chargerConseil() {
    if (PROJ) return chargerProjection();
    C.err = ''; C.data = null; C.conseil = null; C.suivi = {};
    if (!S.classes.length) return;
    const B = BO().B;
    try { const d = await BO().preparer(C.classeId || B.classeId, C.periodeId || B.periodeId); C.data = d.data; C.prev = d.prev; }
    catch (e) { C.classeId = B.classeId; C.periodeId = B.periodeId; if (/réseau/.test(e.message)) throw e; C.err = peutAnimer() ? String(e.message || e) : 'Le conseil est animé par la direction ou le professeur principal de la classe.'; return; }
    C.classeId = B.classeId; C.periodeId = B.periodeId;
    await chargerPhotos();
    const r = await sb.from('conseils').select('*').eq('classe_id', C.classeId).eq('periode_id', C.periodeId).maybeSingle();
    if (r.error) { C.err = /conseils|relation/.test(r.error.message) ? 'Le conseil de classe n’est pas encore installé (migration 0014).' : r.error.message; return; }
    C.conseil = r.data || null;
    if (C.conseil) { const s = await sb.from('conseil_eleves').select('*').eq('conseil_id', C.conseil.id); (s.data || []).forEach(x => { C.suivi[x.eleve_id] = x; }); }
  }
  const recharger = async () => { try { await chargerConseil(); } catch (e) { dire('err', String(e.message || e)); } refaire(); };

  // ---------- Écran de pilotage ----------
  function vueConseil() {
    if (PROJ) {
      if (C.err) return `<div class="pj-ecran"><div class="pj-erreur">${esc(C.err)}</div></div>`;
      if (!C.conseil || !C.data) return `<div class="pj-ecran"><div class="pj-erreur">Chargement…</div></div>`;
      return `<div class="pj-ecran">${cadre(C.conseil, C.data, opts())}</div>${document.fullscreenElement ? '' : '<button class="b sec pj-plein" id="pj-plein">⛶ Plein écran</button>'}`;
    }
    if (!S.classes.length) return `<div class="carte"><h2>Conseil de classe</h2><p class="doux">Crée d’abord des classes et des élèves.</p></div>`;
    const sel = `<div class="barre"><select id="c-classe">${S.classes.map(c => opt(c.id, c.nom, c.id === C.classeId)).join('')}</select>
      <select id="c-per">${N.periodes.map(p => opt(p.id, p.libelle, p.id === C.periodeId)).join('')}</select>
      ${C.conseil ? `<span class="tag ${C.conseil.statut === 'termine' ? 'ok' : ''}">${C.conseil.statut === 'termine' ? 'Conseil terminé' : 'Conseil en cours'} · <span id="c-chrono">${duree()}</span></span>` : ''}</div>`;
    if (C.err) return `${msg()}<div class="carte"><h2>Conseil de classe</h2>${sel}<div class="msg err">${esc(C.err)}</div></div>`;
    if (!C.data) return `${msg()}<div class="carte"><h2>Conseil de classe</h2>${sel}<p class="doux">Chargement…</p></div>`;
    if (!peutAnimer()) return `${msg()}<div class="carte"><h2>Conseil de classe</h2>${sel}<div class="msg info">Le conseil est animé par la direction ou le professeur principal de la classe.</div></div>`;
    if (!C.conseil) return `${msg()}<div class="carte"><h2>Conseil de classe</h2>${sel}
      <p>${eleves().length} élèves · moyenne de la classe ${f(n(C.data.moyenne_classe))} · bulletins : ${esc({ ouvert: 'ouverts à la saisie', valide: 'validés', publie: 'publiés' }[C.data.statut] || C.data.statut)}</p>
      <p class="petit doux">Le conseil s’anime depuis cet écran ; un second écran (vidéoprojecteur, télévision, autre ordinateur) affiche en direct la classe puis chaque élève. Les remarques internes n’y apparaissent jamais.</p>
      <button class="b" id="c-ouvrir">▶ Ouvrir le conseil de classe</button></div>`;
    const cs = C.conseil, o = opts(), e = eleveCourant(), els = eleves(), vus = els.filter(x => (C.suivi[x.id] || {}).traite).length;
    const vues = [['accueil', 'Accueil'], ['classe', 'Vue de la classe'], ['eleve', 'Élève'], ['synthese', 'Synthèse']];
    const fige = !N.droits.admin && C.data.statut !== 'ouvert';
    const panneauEleve = e ? (() => { const s = C.suivi[e.id] || {}, prop = BO().mentionProposee(e), i = els.indexOf(e);
      return `<div class="carte"><div class="barre" style="justify-content:space-between"><button class="b sec" id="c-prec" ${i <= 0 ? 'disabled' : ''}>◀</button>
          <span style="display:flex;gap:10px;align-items:center">${photo(e, 'cs-photo')}<strong style="font-size:17px">${esc(nomEl(e))}</strong></span><button class="b sec" id="c-suiv" ${i >= els.length - 1 ? 'disabled' : ''}>▶</button></div>
        ${N.droits.admin ? `<div class="barre"><span class="b sec cs-fichier">📷 ${C.photos[e.id] ? 'Changer la photo' : 'Ajouter une photo'}<input type="file" accept="image/*" id="c-photo"></span>${C.photos[e.id] ? '<button class="b sec" id="c-photo-retirer">Retirer la photo</button>' : ''}</div>` : ''}
        ${fige ? '<div class="msg info">Bulletins validés : seule la direction peut encore modifier l’appréciation générale et la mention.</div>' : ''}
        <label class="petit">Mention ${prop ? `<span class="doux">(proposée : ${esc(prop)})</span>` : ''}</label>
        <select id="c-mention" ${fige ? 'disabled' : ''}>${opt('', '— aucune —', !e.mention)}${BO().B.mentions.map(m => opt(m, m, m === e.mention)).join('')}</select>
        <label class="petit" style="display:block;margin-top:8px">Appréciation générale (projetée)</label>
        <textarea id="c-gen" maxlength="${BO().B.maxAppr}" ${fige ? 'disabled' : ''}>${esc(e.generale || '')}</textarea>
        <div class="ap-pied"><button class="b sec" id="c-prop" ${fige ? 'disabled' : ''}>💡 Proposer</button><span id="c-etat" class="etat">${esc(C.etat)}</span></div>
        <label class="petit" style="display:block;margin-top:8px">Remarque interne (compte rendu, jamais projetée)</label>
        <textarea id="c-rem" maxlength="1000" placeholder="Ex. : rendez-vous avec la famille, tutorat…">${esc(s.remarque || '')}</textarea>
        <div class="barre"><label><input type="checkbox" id="c-revoir" ${s.a_revoir ? 'checked' : ''}> ⚑ À revoir</label>
          <button class="b" id="c-vu">${i < els.length - 1 ? '✓ Vu · élève suivant ▶' : '✓ Vu · synthèse'}</button></div></div>`; })()
      : `<div class="carte"><p class="doux">Choisis un élève pour l’afficher sur l’écran projeté (ou utilise les flèches ← → du clavier).</p></div>`;
    return `${msg()}<div class="carte"><h2>Conseil de classe</h2>${sel}
      <p class="petit">${vus} / ${els.length} élèves vus · moyenne de la classe ${f(n(C.data.moyenne_classe))}</p>
      ${N.droits.admin ? `<div class="barre"><span class="b sec cs-fichier">📷 Importer les photos de la classe<input type="file" accept="image/*" multiple id="c-photos-lot"></span>
        <span class="petit doux">${Object.keys(C.photos).length} / ${els.length} photos · fichiers nommés « NOM_Prénom.jpg »</span></div>` : ''}
      <div class="cs-vues">${vues.map(([k, l]) => `<button data-cvue="${k}" class="${cs.vue === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="cs-eleves">${els.map(x => { const s = C.suivi[x.id] || {};
        return `<button data-cel="${x.id}" class="${cs.vue === 'eleve' && cs.eleve_id === x.id ? 'on' : ''} ${s.traite ? 'vu' : ''}">${s.traite ? '✓ ' : ''}${s.a_revoir ? '⚑ ' : ''}${esc(x.prenom)} ${esc(x.nom.charAt(0))}.${x.mention ? ` <span class="m">${esc(x.mention.split(' ')[0])}</span>` : ''}</button>`; }).join('')}</div></div>
      <div class="cs-pilote"><div><div class="carte"><h3>Écran projeté</h3>${cadre(cs, C.data, o, 'pj-mini')}
          <div class="barre" style="margin-top:8px"><button class="b" id="c-projeter">📺 Ouvrir l’écran projeté</button><button class="b sec" id="c-copier">📋 Copier le lien</button></div>
          <input class="cs-lien" id="c-lien" readonly value="${esc(lienProjection())}">
          <p class="petit doux">Sur l’ordinateur relié au vidéoprojecteur : ouvre ce lien (connecté avec un compte de la direction ou du professeur principal), puis « Plein écran ».</p>
          <div class="barre"><label class="petit"><input type="checkbox" data-copt="rang" ${o.rang ? 'checked' : ''}> Afficher le rang</label>
            <label class="petit"><input type="checkbox" data-copt="absences" ${o.absences ? 'checked' : ''}> Absences et retards</label>
            <label class="petit"><input type="checkbox" data-copt="appreciations" ${o.appreciations ? 'checked' : ''}> Appréciations des matières</label></div></div></div>
        <div>${panneauEleve}</div></div>
      <div class="carte"><h3>Fin du conseil</h3><div class="barre">
        ${cs.statut === 'termine' ? '<button class="b sec" id="c-rouvrir">Rouvrir le conseil</button>' : '<button class="b" id="c-terminer">Terminer le conseil</button>'}
        <button class="b sec" id="c-cr-imp">🖨 Compte rendu</button><button class="b sec" id="c-cr-pdf">⬇ PDF du compte rendu</button></div>
        ${els.some(x => (C.suivi[x.id] || {}).a_revoir) ? `<p class="petit">⚑ À revoir : ${els.filter(x => (C.suivi[x.id] || {}).a_revoir).map(x => esc(nomEl(x))).join(', ')}</p>` : ''}</div>`;
  }

  // ---------- Compte rendu (interne : remarques comprises) ----------
  function pagesCompteRendu() {
    const D = C.data, cs = C.conseil, els = D.eleves, parPage = 16, pages = [];
    const ent = `<div class="bu-tete"><div><h2>Compte rendu du conseil de classe</h2><div>${esc(D.classe.nom)} · ${esc(D.periode.libelle)} · ${esc(D.periode.annee || '')}</div></div>
      <div style="text-align:right">${esc(D.etablissement.nom || '')}<br>${new Date(cs.debut).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} · durée ${duree()}</div></div>
      <p>Moyenne de la classe : <strong>${f(n(D.moyenne_classe))}</strong> · ${els.length} élèves · ${els.filter(e => e.mention).length} mentions${D.classe.prof_principal ? ' · Professeur principal : ' + esc(D.classe.prof_principal) : ''}</p>`;
    for (let k = 0; k < Math.max(1, els.length); k += parPage) {
      const l = els.slice(k, k + parPage).map(e => { const s = C.suivi[e.id] || {};
        return `<tr><td>${esc(e.nom)} ${esc(e.prenom)}</td><td class="c">${f(n(e.moyenne))}</td><td>${esc(e.mention || '')}</td><td class="c">${s.a_revoir ? '⚑' : ''}</td><td>${esc(s.remarque || '')}</td></tr>`; }).join('');
      pages.push(`<article class="bulletin">${ent}<table class="cs-tab"><thead><tr><th>Élève</th><th class="c">Moyenne</th><th>Mention</th><th class="c">À revoir</th><th>Remarque du conseil</th></tr></thead><tbody>${l}</tbody></table>
        <div class="bu-pied"><span>Document interne — ne pas transmettre aux familles</span><span>Page ${pages.length + 1} / ${Math.max(1, Math.ceil(els.length / parPage))}</span></div></article>`);
    }
    return pages;
  }

  // ---------- Actions ----------
  async function piloter(ch) {
    const r = await sb.rpc('piloter_conseil', { p_conseil: C.conseil.id, p_changements: ch });
    if (r.error) { dire('err', estReseau(r.error) ? 'Pas de connexion : l’écran projeté n’a pas été mis à jour.' : r.error.message); refaire(); return false; }
    C.conseil = r.data; try { if (bc) bc.postMessage(C.conseil); } catch (e) { /* rien */ } return true;
  }
  async function noter(id, ch) {
    const r = await sb.rpc('noter_conseil_eleve', { p_conseil: C.conseil.id, p_eleve: id, p_traite: ch.traite ?? null, p_a_revoir: ch.a_revoir ?? null, p_remarque: ch.remarque ?? null });
    if (r.error) { dire('err', estReseau(r.error) ? 'Pas de connexion : le suivi n’a pas été enregistré.' : r.error.message); return false; }
    const s = C.suivi[id] = C.suivi[id] || { traite: false, a_revoir: false, remarque: null };
    if (ch.traite != null) s.traite = ch.traite; if (ch.a_revoir != null) s.a_revoir = ch.a_revoir; if (ch.remarque != null) s.remarque = ch.remarque.trim() || null; return true;
  }
  async function montrerEleve(id) { C.etat = ''; if (await piloter({ vue: 'eleve', eleve_id: id })) refaire(); }
  async function enregistrerGenerale() {
    const e = eleveCourant(); if (!e) return; clearTimeout(C.minuteurA);
    const t = $('#c-gen') ? $('#c-gen').value.trim() : (e.generale || ''), m = $('#c-mention') ? $('#c-mention').value : (e.mention || '');
    if (t === (e.generale || '') && m === (e.mention || '')) return true;
    const etat = $('#c-etat'); if (etat) { etat.textContent = 'Enregistrement…'; etat.className = 'etat'; }
    const r = await sb.rpc('saisir_appreciation_generale', { p_eleve: e.id, p_periode: C.data.periode.id, p_texte: t, p_mention: m || null });
    if (r.error) { C.etat = estReseau(r.error) ? 'Pas de connexion : non enregistré' : r.error.message; if (etat) { etat.textContent = C.etat; etat.className = 'etat err'; } return false; }
    e.generale = t || null; e.mention = m || null; C.etat = 'Enregistré ✓'; if (etat) { etat.textContent = C.etat; etat.className = 'etat ok'; }
    await piloter({}); return true;
  }
  async function deplacer(dir) {
    const els = eleves(), e = eleveCourant(), i = e ? els.indexOf(e) : -1, j = Math.min(els.length - 1, Math.max(0, i + dir));
    if (!els.length || (e && j === i)) return; await enregistrerGenerale(); await montrerEleve(els[j].id);
  }
  document.addEventListener('keydown', ev => {
    if (PROJ || S.tab !== 'conseil' || !C.conseil || /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
    if (ev.key === 'ArrowRight') { ev.preventDefault(); deplacer(1); } else if (ev.key === 'ArrowLeft') { ev.preventDefault(); deplacer(-1); }
  });
  setInterval(() => { const c = document.getElementById('c-chrono'); if (c) c.textContent = duree(); }, 30000);

  function liensConseil() {
    ajusterEchelle(); requestAnimationFrame(ajusterEchelle);
    if (PROJ) {
      const p = $('#pj-plein'); if (p) p.onclick = () => { const d = document.documentElement; (d.requestFullscreen ? d.requestFullscreen() : Promise.reject()).then(() => { p.remove(); setTimeout(ajusterEchelle, 200); }).catch(() => p.remove()); };
      return;
    }
    const cl = $('#c-classe'); if (cl) cl.onchange = () => { C.classeId = cl.value; S.message = null; recharger(); };
    const pe = $('#c-per'); if (pe) pe.onchange = () => { C.periodeId = pe.value; S.message = null; recharger(); };
    const ouv = $('#c-ouvrir'); if (ouv) ouv.onclick = async () => {
      const r = await sb.rpc('ouvrir_conseil', { p_classe: C.classeId, p_periode: C.periodeId });
      if (r.error) { dire('err', r.error.message); return refaire(); }
      S.message = null; await recharger();
    };
    if (!C.conseil) return;
    document.querySelectorAll('[data-cvue]').forEach(b => b.onclick = async () => {
      const v = b.dataset.cvue, ch = { vue: v }; if (v === 'eleve' && !C.conseil.eleve_id && eleves()[0]) ch.eleve_id = eleves()[0].id;
      await enregistrerGenerale(); if (await piloter(ch)) refaire(); });
    document.querySelectorAll('[data-cel]').forEach(b => b.onclick = async () => { await enregistrerGenerale(); montrerEleve(b.dataset.cel); });
    document.querySelectorAll('[data-copt]').forEach(c => c.onchange = async () => { if (await piloter({ options: { [c.dataset.copt]: c.checked } })) refaire(); });
    $('#c-projeter').onclick = () => { const w = window.open(lienProjection(), 'lc-projection'); if (!w) { dire('info', 'Fenêtre bloquée par le navigateur : copie le lien et ouvre-le sur l’autre écran.'); refaire(); } };
    $('#c-copier').onclick = async () => { const i = $('#c-lien'); try { await navigator.clipboard.writeText(i.value); dire('ok', 'Lien de l’écran projeté copié.'); } catch (e) { i.select(); dire('info', 'Sélectionne le lien et copie-le.'); } refaire(); };
    const signalerPhotos = async () => { await piloter({ options: { photos: String(Date.now()) } }); C.photosVer = C.conseil.options.photos; };
    const ph = $('#c-photo'); if (ph) ph.onchange = async () => {
      const e = eleveCourant(), f = ph.files[0]; if (!f) return;
      try { const d = await compresser(f); const r = await sb.from('photos_eleves').upsert({ eleve_id: e.id, image: d });
        if (r.error) throw new Error(estReseau(r.error) ? 'Pas de connexion : photo non enregistrée.' : r.error.message);
        C.photos[e.id] = d; await signalerPhotos(); dire('ok', 'Photo enregistrée.'); } catch (x) { dire('err', String(x.message || x)); }
      refaire(); };
    const phr = $('#c-photo-retirer'); if (phr) phr.onclick = async () => { const e = eleveCourant(); const r = await sb.from('photos_eleves').delete().eq('eleve_id', e.id);
      if (r.error) dire('err', r.error.message); else { delete C.photos[e.id]; await signalerPhotos(); dire('ok', 'Photo retirée.'); } refaire(); };
    const lot = $('#c-photos-lot'); if (lot) lot.onchange = async () => {
      const fichiers = [...lot.files], ok = [], refus = [];
      for (const f of fichiers) { const base = sansAccent(f.name.replace(/\.[^.]+$/, ''));
        const e = eleves().find(x => base === sansAccent(x.nom + x.prenom) || base === sansAccent(x.prenom + x.nom));
        if (!e) { refus.push(f.name); continue; }
        try { const d = await compresser(f); const r = await sb.from('photos_eleves').upsert({ eleve_id: e.id, image: d }); if (r.error) throw new Error(r.error.message); C.photos[e.id] = d; ok.push(e); }
        catch (x) { refus.push(f.name); } }
      if (ok.length) await signalerPhotos();
      dire(refus.length ? 'info' : 'ok', `${ok.length} photo${ok.length > 1 ? 's' : ''} enregistrée${ok.length > 1 ? 's' : ''}.` + (refus.length ? ` Non reconnues (nom de fichier ≠ NOM_Prénom) : ${refus.join(', ')}.` : ''));
      refaire(); };
    const pr = $('#c-prec'); if (pr) pr.onclick = () => deplacer(-1);
    const su = $('#c-suiv'); if (su) su.onclick = () => deplacer(1);
    const gen = $('#c-gen'); if (gen) { gen.oninput = () => { C.etat = ''; const et = $('#c-etat'); if (et) et.textContent = ''; clearTimeout(C.minuteurA); C.minuteurA = setTimeout(enregistrerGenerale, 1200); }; gen.onchange = enregistrerGenerale; }
    const men = $('#c-mention'); if (men) men.onchange = async () => { await enregistrerGenerale(); refaire(); };
    const prop = $('#c-prop'); if (prop) prop.onclick = () => { const e = eleveCourant(), p = BO().proposerGenerale(e); gen.value = gen.value.trim() ? gen.value.trim() + ' ' + p : p;
      const m = BO().mentionProposee(e); if (m && men && !men.value) men.value = m; enregistrerGenerale().then(() => refaire()); };
    const rem = $('#c-rem'); if (rem) rem.onchange = async () => { const e = eleveCourant(); if (await noter(e.id, { remarque: rem.value })) { C.etat = 'Remarque enregistrée ✓'; } refaire(); };
    const rev = $('#c-revoir'); if (rev) rev.onchange = async () => { await noter(eleveCourant().id, { a_revoir: rev.checked }); refaire(); };
    const vu = $('#c-vu'); if (vu) vu.onclick = async () => {
      const e = eleveCourant(), els = eleves(), i = els.indexOf(e); await enregistrerGenerale();
      if (rem && rem.value.trim() !== ((C.suivi[e.id] || {}).remarque || '')) await noter(e.id, { remarque: rem.value });
      await noter(e.id, { traite: true });
      if (i < els.length - 1) await montrerEleve(els[i + 1].id); else if (await piloter({ vue: 'synthese' })) refaire();
    };
    const term = $('#c-terminer'); if (term) term.onclick = async () => { await enregistrerGenerale(); if (await piloter({ statut: 'termine', vue: 'synthese' })) { dire('ok', 'Conseil terminé. Le compte rendu est prêt à imprimer.'); refaire(); } };
    const rou = $('#c-rouvrir'); if (rou) rou.onclick = async () => { if (await piloter({ statut: 'en_cours' })) { S.message = null; refaire(); } };
    $('#c-cr-imp').onclick = () => BO().imprimer(pagesCompteRendu().join(''));
    $('#c-cr-pdf').onclick = () => BO().telechargerPdf(pagesCompteRendu(), `Conseil_${C.data.classe.nom}_${C.data.periode.libelle}`);
  }

  // ---------- Branchement ----------
  insererOnglet('conseil', 'Conseil de classe', 'bulletins');
  Object.assign(VUES, { conseil: vueConseil });
  Object.assign(LIENS, { conseil: liensConseil });
  Object.assign(LOAD, { conseil: chargerConseil });
  window.__LC.conseilOutils = { sceneProjection, pagesCompteRendu, recevoir };
  if (PROJ) S.tab = 'conseil';
})();
