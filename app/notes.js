// Luqmân Campus — étape 3 : notes et compétences.
// Onglet « Notes » : évaluations, saisie rapide, relevé de classe (moyennes, rang).
// Onglet « Compétences » : niveaux par évaluation, bilan de période, catalogue du socle.
// S'appuie sur window.LCVS (vie-scolaire.js). Couleurs : jaune pétillant ≥ seuil haut, rouge écarlate < seuil bas.
(function () {
  const { LOAD, insererOnglet } = window.LCVS;
  const { nomEleve, estReseau, refaire, lienFiche, jourFr } = window.LCVS.outils;
  const N = { droits: { admin: false, pp: [], ens: [] }, classeId: '', ensId: '', periodeId: undefined, vue: 'evals', evalId: null, sub: 'saisie', periodes: [], params: { haut: 18, bas: 8 }, niveaux: ['Maîtrise insuffisante', 'Maîtrise fragile', 'Maîtrise satisfaisante', 'Très bonne maîtrise'],
    competences: [], evals: [], evalComps: [], notes: [], acqs: [], moyM: [], moyG: [], bilan: [], ouvertCom: new Set(), confirmer: null, creation: false, pret: false };
  window.__LC.N = N;

  const css = document.createElement('style');
  css.textContent = `
    .note { display:inline-block; min-width:2.8em; text-align:center; padding:1px 9px; border-radius:999px; font-weight:700; font-variant-numeric:tabular-nums; background:#f1ecdf; color:var(--texte); position:relative; white-space:nowrap; }
    .note.vide { background:transparent; color:var(--doux); font-weight:400; }
    .note.haut { background:linear-gradient(120deg,#fff200 0%,#ffe000 42%,#fffa8a 52%,#ffe000 62%,#fff200 100%); background-size:240% 100%; color:#3d3000;
      box-shadow:0 0 0 1px #e6c800, 0 0 10px 2px rgba(255,230,0,.75); animation:lc-brille 2.8s linear infinite; }
    .note.haut::after { content:'✦'; position:absolute; top:-8px; right:-5px; font-size:11px; color:#fff; text-shadow:0 0 4px #ffcf00, 0 0 2px #ff9d00; animation:lc-etincelle 1.7s ease-in-out infinite; }
    .note.bas { background:#e11d00; color:#fff; box-shadow:0 0 0 1px #b51600; }
    @keyframes lc-brille { to { background-position:-240% 0; } }
    @keyframes lc-etincelle { 0%,100% { opacity:0; transform:scale(.4) rotate(0); } 50% { opacity:1; transform:scale(1.1) rotate(45deg); } }
    @media (prefers-reduced-motion: reduce) { .note.haut { animation:none; } .note.haut::after { animation:none; opacity:1; } }
    .nl { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:7px 0; border-bottom:1px solid var(--filet); }
    .nl .n { flex:1 1 150px; min-width:140px; font-weight:500; }
    .nl .ni { width:84px; text-align:center; font-weight:700; font-size:16px; padding:9px 6px; }
    .nl .np { min-width:64px; text-align:center; }
    .nl .etat { min-width:18px; font-size:13px; color:var(--ok); }
    .nl .etat.att { color:#b45309; }
    .nl .etat.err { color:var(--rouge); flex-basis:100%; }
    .nl .com { flex-basis:100%; }
    .chips { display:flex; gap:4px; }
    .chips button { font:inherit; font-size:12px; font-weight:700; padding:8px 8px; border-radius:8px; border:1px solid var(--filet); background:#fff; color:var(--doux); cursor:pointer; touch-action:manipulation; }
    .chips button.on { background:var(--vert); color:#fff; border-color:var(--vert); }
    .stat { display:flex; gap:14px; flex-wrap:wrap; align-items:center; margin:8px 0; font-size:14px; }
    .niv { display:inline-flex; gap:4px; }
    .niv button { font:inherit; font-size:13px; font-weight:700; width:38px; height:38px; border-radius:8px; border:2px solid var(--c); background:#fff; color:var(--c); cursor:pointer; touch-action:manipulation; }
    .niv button.on { background:var(--c); color:#fff; }
    .nv { display:inline-block; min-width:2em; text-align:center; border-radius:6px; padding:2px 8px; font-weight:700; color:#fff; background:var(--c); }
    .sousnav { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px; }
    .sousnav button { font:inherit; font-weight:700; padding:8px 14px; border-radius:999px; border:1px solid var(--vert); background:#fff; color:var(--vert); cursor:pointer; }
    .sousnav button.on { background:var(--vert); color:#fff; }
    .rel td.c, .rel th.c { text-align:center; }
    .rel tfoot td { font-weight:700; background:#faf7ef; }
    @media (max-width:640px) { .nl .ni { width:96px; } .chips button { padding:10px 9px; } }
  `;
  document.head.appendChild(css);

  // ---------- Outils ----------
  const opt = (v, l, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(l)}</option>`;
  const fmt = v => Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const num = t => { const x = Number(String(t).trim().replace(',', '.')); return Number.isFinite(x) ? x : NaN; };
  const aujourdhui = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const COULEURS_NIV = ['#d9480f', '#e08a00', '#2f9e5b', '#0b7285'];
  const cycleDe = niveau => niveau === '6e' ? 3 : 4;
  const estAdm = () => !!N.droits.admin;
  const monEns = () => estAdm() || N.droits.ens.includes(N.ensId);
  const estPP = () => estAdm() || N.droits.pp.includes(N.classeId);
  const classe = () => S.classes.find(c => c.id === N.classeId);
  const ensDeClasse = () => S.ens.filter(x => x.classe_id === N.classeId).sort((a, b) => nomMatiere(a.matiere_id).localeCompare(nomMatiere(b.matiere_id), 'fr'));
  const elevesClasse = () => S.eleves.filter(e => e.classe_id === N.classeId);
  const periodeDe = id => N.periodes.find(p => p.id === id);
  const evalCourante = () => N.evals.find(e => e.id === N.evalId);
  const notesDe = id => N.notes.filter(n => n.evaluation_id === id);
  const v20 = (v, bareme) => v / bareme * 20;
  const msgNotes = () => (S.message ? msg() : '');
  const appeler = async (nom, args) => {
    const r = await sb.rpc(nom, args);
    return r.error ? { error: estReseau(r.error) ? 'Pas de connexion : rien n’a été enregistré.' : r.error.message } : r;
  };

  // ---------- Notes hors ligne : file d'attente gardée sur l'appareil ----------
  const FILE_N = 'lc_file_notes';
  const lireFile = () => { try { return JSON.parse(localStorage.getItem(FILE_N)) || []; } catch { return []; } };
  const ecrireFile = f => { try { localStorage.setItem(FILE_N, JSON.stringify(f)); } catch { /* stockage indisponible */ } };
  function mettreEnFile(ev, eleve, ligne) {
    const f = lireFile().filter(x => !(x.ev === ev && x.eleve === eleve)); f.push({ ev, eleve, ligne }); ecrireFile(f); majFile();
  }
  function majFile() {
    const n = lireFile().length, el = document.getElementById('n-file'); if (!el) return;
    el.innerHTML = n ? `<div class="msg info">⏳ ${n} note${n > 1 ? 's' : ''} en attente d’envoi : elle${n > 1 ? 's partiront' : ' partira'} dès le retour du réseau (ne ferme pas l’appli avant).</div>` : '';
  }
  let envoiEnCours = false;
  async function envoyerFile() {
    if (envoiEnCours || !navigator.onLine || !lireFile().length) return;
    envoiEnCours = true;
    try {
      const evals = [...new Set(lireFile().map(x => x.ev))];
      for (const ev of evals) {
        const lot = lireFile().filter(x => x.ev === ev);
        const r = await sb.rpc('saisir_notes', { p_eval: ev, p_lignes: lot.map(x => ({ eleve_id: x.eleve, ...x.ligne })) });
        if (r.error && estReseau(r.error)) break;
        ecrireFile(lireFile().filter(x => !lot.includes(x) && !lot.some(y => y.ev === x.ev && y.eleve === x.eleve && JSON.stringify(y.ligne) === JSON.stringify(x.ligne))));
        if (r.error) dire('err', 'Des notes gardées sur l’appareil n’ont pas pu être envoyées : ' + r.error.message);
        else { dire('ok', `${lot.length} note${lot.length > 1 ? 's' : ''} envoyée${lot.length > 1 ? 's' : ''} au retour du réseau.`); N.pret && N.evalId === ev && N.vue !== 'releve' && chargerEvals().then(refaire).catch(() => {}); }
      }
    } finally { envoiEnCours = false; majFile(); }
  }
  window.addEventListener('online', () => { envoyerFile(); });
  setInterval(() => { if (lireFile().length) envoyerFile(); }, 20000);
  setTimeout(envoyerFile, 3000);

  // Pastille colorée : le chiffre est toujours écrit (la couleur n'est jamais seule à porter le sens).
  function pastille(note20, texte, ctx) {
    if (note20 == null || Number.isNaN(note20)) return '<span class="note vide">—</span>';
    const c = note20 >= N.params.haut ? 'haut' : note20 < N.params.bas ? 'bas' : '';
    const t = c === 'haut' ? `Excellent (${fmt(N.params.haut)} ou plus sur 20)` : c === 'bas' ? `En difficulté (moins de ${fmt(N.params.bas)} sur 20)` : '';
    return `<span class="note ${c}" ${t ? `title="${t}"` : ''}>${texte ?? fmt(note20)}${ctx || ''}</span>`;
  }
  const pastilleEval = (valeur, bareme) => pastille(v20(valeur, bareme), fmt(valeur), Number(bareme) === 20 ? '' : `<small style="font-weight:400">/${fmt(bareme)}</small>`);
  const statutTxt = { absent: 'Abs', dispense: 'Disp', non_rendu: 'NR' };

  // ---------- Chargements ----------
  async function chargerBase() {
    if (N.pret) return;
    const [p, pr, c, en, dr] = await Promise.all([
      sb.from('periodes').select('id,numero,libelle,debut,fin,verrouillee,annees_scolaires!inner(active)').eq('annees_scolaires.active', true).order('numero'),
      sb.from('parametres').select('cle,valeur').in('cle', ['note_seuil_haut', 'note_seuil_bas', 'niveaux_competences', 'notes_visibles_tout_personnel', 'note_non_rendu_compte_zero']),
      sb.from('competences').select('*').order('cycle').order('ordre'),
      sb.from('enseignements').select('*'),
      sb.rpc('mes_droits_notes')]);
    if (!dr.error && dr.data) N.droits = { admin: !!dr.data.admin, pp: dr.data.classes_pp || [], ens: dr.data.enseignements || [] };
    if (!en.error && en.data && en.data.length) S.ens = en.data;
    if (p.error) throw new Error(estReseau(p.error) ? 'Pas de connexion : les notes ont besoin du réseau.' : p.error.message);
    N.periodes = p.data || []; N.competences = c.data || [];
    (pr.data || []).forEach(x => { if (x.cle === 'note_seuil_haut') N.params.haut = Number(x.valeur); if (x.cle === 'note_seuil_bas') N.params.bas = Number(x.valeur); if (x.cle === 'niveaux_competences' && Array.isArray(x.valeur)) N.niveaux = x.valeur; if (x.cle === 'notes_visibles_tout_personnel') N.params.visTout = x.valeur === true || x.valeur === 'true'; if (x.cle === 'note_non_rendu_compte_zero') N.params.nonRendu = !(x.valeur === false || x.valeur === 'false'); });
    if (!N.classeId) N.classeId = (S.classes[0] || {}).id || '';
    if (!N.ensId || !ensDeClasse().some(x => x.id === N.ensId)) N.ensId = (ensDeClasse()[0] || {}).id || '';
    if (N.periodeId === undefined) { const j = aujourdhui(); N.periodeId = (N.periodes.find(x => j >= x.debut && j <= x.fin) || N.periodes.filter(x => x.debut <= j).pop() || N.periodes[0] || {}).id || ''; }
    N.pret = true;
  }
  async function chargerEvals() {
    N.evals = []; N.notes = []; N.evalComps = []; N.acqs = [];
    if (!N.ensId) return;
    let q = sb.from('evaluations').select('*').eq('enseignement_id', N.ensId).order('date_eval', { ascending: false });
    if (N.periodeId) q = q.eq('periode_id', N.periodeId);
    const e = await q; if (e.error) throw new Error(e.error.message);
    N.evals = e.data || [];
    const ids = N.evals.map(x => x.id); if (!ids.length) return;
    const [n, ec, a] = await Promise.all([sb.from('notes').select('*').in('evaluation_id', ids), sb.from('evaluation_competences').select('*').in('evaluation_id', ids), sb.from('acquisitions').select('*').in('evaluation_id', ids)]);
    N.notes = n.data || []; N.evalComps = ec.data || []; N.acqs = a.data || [];
  }
  async function chargerReleve() {
    const per = N.periodeId || null;
    const [m, g] = await Promise.all([sb.rpc('moyennes_matieres', { p_classe: N.classeId, p_periode: per }), sb.rpc('moyennes_generales', { p_classe: N.classeId, p_periode: per })]);
    if (m.error) throw new Error(m.error.message);
    N.moyM = m.data || []; N.moyG = g.data || [];
  }
  async function chargerBilan() {
    const r = await sb.rpc('bilan_competences', { p_classe: N.classeId, p_periode: N.periodeId || null });
    if (r.error) throw new Error(r.error.message);
    N.bilan = r.data || [];
  }
  async function chargerNotes() { await envoyerFile(); await chargerBase(); if (N.vue === 'reglages') return; if (N.vue === 'releve') await chargerReleve(); else await chargerEvals(); }
  async function chargerCompetences() {
    await chargerBase();
    if (N.sub === 'saisie') await chargerEvals(); else if (N.sub === 'bilan') await chargerBilan(); else { const c = await sb.from('competences').select('*').order('cycle').order('ordre'); N.competences = c.data || []; }
  }
  const recharger = async fn => { try { await fn(); } catch (e) { dire('err', String(e.message || e)); } refaire(); };

  // ---------- Sélecteurs communs ----------
  function selecteurs(avecMatiere) {
    return `<div class="barre">
      <select id="n-classe">${S.classes.map(c => opt(c.id, c.nom, c.id === N.classeId)).join('')}</select>
      ${avecMatiere ? `<select id="n-ens">${ensDeClasse().map(x => opt(x.id, nomMatiere(x.matiere_id), x.id === N.ensId)).join('') || opt('', 'Aucune matière pour cette classe')}</select>` : ''}
      <select id="n-per">${N.periodes.map(p => opt(p.id, p.libelle + (p.verrouillee ? ' 🔒' : ''), p.id === N.periodeId)).join('')}${opt('', 'Toute l’année', !N.periodeId)}</select></div>`;
  }
  function liensSelecteurs(fn, avecMatiere) {
    $('#n-classe').onchange = e => { N.classeId = e.target.value; N.ensId = (ensDeClasse()[0] || {}).id || ''; N.evalId = null; recharger(fn); };
    if (avecMatiere) $('#n-ens').onchange = e => { N.ensId = e.target.value; N.evalId = null; recharger(fn); };
    $('#n-per').onchange = e => { N.periodeId = e.target.value; N.evalId = null; recharger(fn); };
  }

  // ---------- Onglet Notes ----------
  function statsEval(ev) {
    const l = notesDe(ev.id), v = l.filter(n => n.statut === 'note').map(n => Number(n.valeur));
    const moy = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    return { n: l.length, nbNotes: v.length, moy, min: v.length ? Math.min(...v) : null, max: v.length ? Math.max(...v) : null, abs: l.filter(n => n.statut === 'absent').length,
      haut: v.filter(x => v20(x, ev.bareme) >= N.params.haut).length, bas: v.filter(x => v20(x, ev.bareme) < N.params.bas).length };
  }
  function barreStats(ev) {
    const s = statsEval(ev), total = elevesClasse().length;
    if (!s.nbNotes) return `<div class="stat"><span class="doux">Aucune note saisie (${s.n}/${total} lignes).</span></div>`;
    return `<div class="stat" id="n-stats"><span>Moyenne ${pastilleEval(s.moy, ev.bareme)}</span><span>Min ${pastilleEval(s.min, ev.bareme)}</span><span>Max ${pastilleEval(s.max, ev.bareme)}</span>
      <span class="doux">${s.nbNotes}/${total} notés${s.abs ? ` · ${s.abs} absent${s.abs > 1 ? 's' : ''}` : ''}</span>
      <span title="Notes à ${fmt(N.params.haut)} ou plus">${s.haut} <span class="note haut">★</span></span><span title="Notes sous ${fmt(N.params.bas)}">${s.bas} <span class="note bas">▼</span></span></div>`;
  }
  function vueNotes() {
    if (!S.classes.length) return `<div class="carte"><h2>Notes</h2><p class="doux">Crée d’abord des classes et des élèves.</p></div>`;
    const nav = `<div class="sousnav"><button data-vue="evals" class="${N.vue !== 'releve' ? 'on' : ''}">Évaluations</button><button data-vue="releve" class="${N.vue === 'releve' ? 'on' : ''}">Relevé de classe</button>${estAdm() ? `<button data-vue="reglages" class="${N.vue === 'reglages' ? 'on' : ''}">Réglages</button>` : ''}</div>`;
    if (N.vue === 'reglages' && estAdm()) return `${msgNotes()}<div class="carte"><h2>Notes</h2>${nav}${vueReglages()}</div>`;
    if (N.vue === 'releve') return `${msgNotes()}<div class="carte"><h2>Notes</h2>${nav}${selecteurs(false)}${vueReleve()}</div>`;
    const ev = N.evalId && evalCourante();
    return `${msgNotes()}<div class="carte"><h2>Notes</h2>${nav}${selecteurs(true)}${ev ? vueSaisie(ev) : vueListeEvals()}</div>`;
  }
  function vueReglages() {
    return `<p class="petit">Réglages réservés à la direction. Ils s’appliquent à toutes les classes.</p>
      <div class="carte" style="background:#faf7ef"><h3>Qui voit les notes</h3>
        <label><input type="checkbox" id="r-vis" ${N.params.visTout ? 'checked' : ''}> Tout le personnel voit toutes les notes</label>
        <p class="petit">Décoché (conseillé) : chaque professeur voit les notes de ses matières, le professeur principal celles de sa classe, la direction tout.</p></div>
      <div class="carte" style="background:#faf7ef"><h3>Couleurs des notes</h3><div class="barre">
        <label class="petit">Jaune pétillant à partir de <input id="r-haut" inputmode="decimal" style="width:70px" value="${fmt(N.params.haut)}"> /20</label>
        <label class="petit">Rouge écarlate sous <input id="r-bas" inputmode="decimal" style="width:70px" value="${fmt(N.params.bas)}"> /20</label></div></div>
      <div class="carte" style="background:#faf7ef"><h3>Moyennes</h3>
        <label><input type="checkbox" id="r-nr" ${N.params.nonRendu !== false ? 'checked' : ''}> Un devoir « non rendu » compte 0</label></div>
      <div class="carte" style="background:#faf7ef"><h3>Niveaux de compétence</h3><div class="barre">
        ${N.niveaux.map((n, i) => `<label class="petit">${i + 1} <input class="r-niv" value="${esc(n)}" style="width:190px"></label>`).join('')}</div></div>
      <button class="b" id="r-enreg">Enregistrer les réglages</button>`;
  }
  function liensReglages() {
    const non = m => { dire('err', m); refaire(); };
    const nb = t => Number(String(t).replace(',', '.'));
    $('#r-enreg').onclick = async () => {
      const haut = nb($('#r-haut').value), bas = nb($('#r-bas').value), niv = [...document.querySelectorAll('.r-niv')].map(x => x.value.trim());
      if (!(haut >= 0 && haut <= 20 && bas >= 0 && bas <= 20)) return non( 'Les seuils doivent être des notes entre 0 et 20.');
      if (!(bas < haut)) return non( 'Le seuil rouge doit être plus bas que le seuil jaune.');
      if (niv.some(x => !x)) return non( 'Les 4 niveaux de compétence doivent avoir un nom.');
      const vis = $('#r-vis').checked, nr = $('#r-nr').checked;
      const maj = (cle, valeur) => sb.from('parametres').update({ valeur }).eq('cle', cle);
      const rs = await Promise.all([maj('note_seuil_haut', haut), maj('note_seuil_bas', bas), maj('notes_visibles_tout_personnel', vis), maj('note_non_rendu_compte_zero', nr), maj('niveaux_competences', niv)]);
      const e = rs.find(r => r.error);
      if (e) return non( e.error.message);
      Object.assign(N.params, { haut, bas, visTout: vis, nonRendu: nr }); N.niveaux = niv;
      dire('ok', 'Réglages enregistrés.'); refaire();
    };
  }
  function vueListeEvals() {
    const c = classe(), cy = c ? cycleDe(c.niveau) : 4, cat = N.competences.filter(x => x.cycle === cy && x.actif);
    const lignes = N.evals.map(ev => {
      const s = statsEval(ev), nbc = N.evalComps.filter(x => x.evaluation_id === ev.id).length;
      return `<tr><td>${jourFr(ev.date_eval + 'T12:00:00')}</td><td><strong>${esc(ev.titre)}</strong></td><td>${esc(ev.type)}</td><td>/${fmt(ev.bareme)}</td><td>×${fmt(ev.coefficient)}</td>
        <td>${s.nbNotes}/${elevesClasse().length}</td><td>${s.moy == null ? '—' : pastilleEval(s.moy, ev.bareme)}</td><td>${s.moy == null ? '' : `${fmt(s.min)} – ${fmt(s.max)}`}</td>
        <td>${nbc ? `<span class="tag">${nbc} compétence${nbc > 1 ? 's' : ''}</span>` : ''}</td>
        <td style="white-space:nowrap"><button class="b" data-saisir="${ev.id}">${monEns() ? 'Saisir' : 'Voir'}</button>
        ${monEns() ? `<button class="b danger" data-suppr="${ev.id}">${N.confirmer === ev.id ? 'Confirmer la suppression' : 'Supprimer'}</button>` : ''}</td></tr>`;
    }).join('');
    const form = N.creation ? `<div class="carte" style="background:#faf7ef"><h3>Nouvelle évaluation</h3><div class="barre">
        <input id="e-titre" placeholder="Titre (ex. Contrôle chapitre 3)" style="flex:1;min-width:200px">
        <label class="petit">Date <input type="date" id="e-date" value="${aujourdhui()}"></label>
        <select id="e-type">${[['devoir', 'Devoir'], ['controle', 'Contrôle'], ['oral', 'Oral'], ['tp', 'TP'], ['projet', 'Projet'], ['autre', 'Autre']].map(([k, l]) => opt(k, l)).join('')}</select>
        <label class="petit">Barème /<input id="e-bareme" value="20" style="width:64px"></label><label class="petit">Coef. <input id="e-coef" value="1" style="width:64px"></label></div>
        ${cat.length ? `<details><summary class="petit" style="cursor:pointer">Compétences évaluées (cycle ${cy}) — facultatif</summary>${cat.map(x => `<label class="petit" style="display:block;margin:4px 0"><input type="checkbox" data-comp="${x.id}"> <strong>${esc(x.code)}</strong> ${esc(x.libelle)}</label>`).join('')}</details>` : ''}
        <p class="petit">La période est déduite de la date. La note est comptée sur 20 dans la moyenne, quel que soit le barème.</p>
        <button class="b" id="e-creer">Créer l’évaluation</button> <button class="b sec" id="e-annuler">Annuler</button></div>`
      : (monEns() ? `<button class="b" id="e-nouvelle">＋ Nouvelle évaluation</button>` : `<p class="petit">Lecture seule : cette matière n’est pas la vôtre.</p>`);
    return `${form}<div class="tablewrap" style="margin-top:10px">${lignes ? `<table><tr><th>Date</th><th>Évaluation</th><th>Type</th><th>Barème</th><th>Coef.</th><th>Notées</th><th>Moyenne</th><th>Min – max</th><th></th><th></th></tr>${lignes}</table>`
      : '<p class="doux">Aucune évaluation pour cette matière et cette période.</p>'}</div>`;
  }
  function vueSaisie(ev) {
    const per = periodeDe(ev.periode_id);
    const lecture = !monEns() || !!(per && per.verrouillee && !estAdm());
    const lignes = elevesClasse().map(e => {
      const n = N.notes.find(x => x.evaluation_id === ev.id && x.eleve_id === e.id), st = n ? n.statut : null;
      const val = !n ? '' : st === 'note' ? fmt(n.valeur) : statutTxt[st];
      const aCom = n && n.commentaire;
      return `<div class="nl" data-e="${e.id}"><span class="n"><button class="lien" data-fiche="${e.id}">${esc(nomEleve(e))}</button></span>
        <input class="ni" ${lecture ? 'disabled' : ''} inputmode="decimal" autocomplete="off" value="${esc(val)}" aria-label="Note de ${esc(nomEleve(e))}">
        <span class="np">${n && st === 'note' ? pastilleEval(n.valeur, ev.bareme) : ''}</span>
        <span class="chips">${Object.entries(statutTxt).map(([k, l]) => `<button data-ch="${k}" ${lecture ? 'disabled' : ''} class="${st === k ? 'on' : ''}" title="${{ absent: 'Absent', dispense: 'Dispensé', non_rendu: 'Non rendu (compte 0)' }[k]}">${l}</button>`).join('')}</span>
        <button class="obs-btn" data-com="${e.id}" title="Commentaire">💬</button><span class="etat"></span>
        ${aCom || N.ouvertCom.has(e.id) ? `<input class="com" placeholder="Commentaire sur cette note" value="${esc(n ? n.commentaire || '' : '')}">` : ''}</div>`;
    }).join('');
    return `<div class="barre"><button class="b sec" id="s-retour">← Évaluations</button><strong>${esc(ev.titre)}</strong><span class="petit">${jourFr(ev.date_eval + 'T12:00:00')} · sur ${fmt(ev.bareme)} · coef. ${fmt(ev.coefficient)} · ${esc(per ? per.libelle : '')}${per && per.verrouillee ? ' 🔒 verrouillée' : ''}</span></div>
      ${per && per.verrouillee ? '<div class="msg info">Période verrouillée : seule la direction peut encore modifier les notes.</div>' : (!monEns() ? '<div class="msg info">Lecture seule : cette matière n’est pas la vôtre.</div>' : '')}
      <div id="n-file"></div>
      <div id="n-barre">${barreStats(ev)}</div>
      <p class="petit">Tape la note (14,5). Entrée = élève suivant. <strong>Abs</strong> absent · <strong>Disp</strong> dispensé · <strong>NR</strong> non rendu (compte 0). Vide = effacer. Enregistrement automatique.</p>
      <div id="n-lignes">${lignes}</div>
      <details style="margin-top:12px"><summary class="petit" style="cursor:pointer">Modifier l’évaluation</summary><div class="barre" style="margin-top:8px">
        <input id="m-titre" value="${esc(ev.titre)}" style="flex:1;min-width:180px"><input type="date" id="m-date" value="${ev.date_eval}">
        <label class="petit">/<input id="m-bareme" value="${fmt(ev.bareme)}" style="width:64px"></label><label class="petit">Coef.<input id="m-coef" value="${fmt(ev.coefficient)}" style="width:64px"></label>
        <button class="b" id="m-ok">Enregistrer</button></div></details>`;
  }
  function vueReleve() {
    const ens = ensDeClasse(), els = elevesClasse();
    const mm = new Map(N.moyM.map(x => [x.eleve_id + x.enseignement_id, x])), gg = new Map(N.moyG.map(x => [x.eleve_id, x]));
    const cl = new Map(N.moyM.map(x => [x.enseignement_id, x]));
    const per = periodeDe(N.periodeId);
    const tete = ens.map(x => `<th class="c">${esc(nomMatiere(x.matiere_id))}<br><span class="petit">×${fmt(x.coefficient)}</span></th>`).join('');
    const corps = els.map(e => { const g = gg.get(e.id);
      return `<tr><td><button class="lien" data-fiche="${e.id}">${esc(nomEleve(e))}</button></td>${ens.map(x => { const m = mm.get(e.id + x.id); return `<td class="c">${m ? pastille(Number(m.moyenne)) : '<span class="note vide">—</span>'}</td>`; }).join('')}
        <td class="c">${g ? pastille(Number(g.moyenne)) : '—'}</td><td class="c">${g ? g.rang : ''}</td></tr>`; }).join('');
    const g0 = N.moyG[0];
    const pied = `<tfoot><tr><td>Moyenne de la classe</td>${ens.map(x => `<td class="c">${cl.get(x.id) ? fmt(cl.get(x.id).moyenne_classe) : '—'}</td>`).join('')}<td class="c">${g0 ? fmt(g0.moyenne_classe) : '—'}</td><td></td></tr>
      <tr><td>Plus basse – plus haute</td>${ens.map(x => `<td class="c">${cl.get(x.id) ? `${fmt(cl.get(x.id).minimum)} – ${fmt(cl.get(x.id).maximum)}` : '—'}</td>`).join('')}<td class="c">${g0 ? `${fmt(g0.minimum)} – ${fmt(g0.maximum)}` : '—'}</td><td></td></tr></tfoot>`;
    return `<div class="barre"><button class="b sec" id="r-csv">Exporter en CSV</button>
      ${per && estAdm() ? `<button class="b sec" id="r-verrou">${per.verrouillee ? '🔓 Déverrouiller la période' : '🔒 Verrouiller la période'}</button>` : ''}
      <span class="petit">Notes ramenées sur 20 et pondérées par les coefficients. ${per ? '' : 'Toute l’année : toutes les notes comptées ensemble.'}</span></div>
      ${N.moyG.length ? '' : '<p class="doux">Aucune note pour cette période.</p>'}
      <div class="tablewrap"><table class="rel"><tr><th>Élève</th>${tete}<th class="c">Moyenne générale</th><th class="c">Rang</th></tr>${corps}${pied}</table></div>`;
  }

  // ---------- Liens de l'onglet Notes ----------
  function majLigne(el, ev) {
    const n = N.notes.find(x => x.evaluation_id === ev.id && x.eleve_id === el.dataset.e), st = n ? n.statut : null;
    el.querySelector('.np').innerHTML = n && st === 'note' ? pastilleEval(n.valeur, ev.bareme) : '';
    el.querySelector('.ni').value = !n ? '' : st === 'note' ? fmt(n.valeur) : statutTxt[st];
    el.querySelectorAll('[data-ch]').forEach(b => b.classList.toggle('on', b.dataset.ch === st));
    $('#n-barre').innerHTML = barreStats(ev);
  }
  async function enregistrerLigne(el, ev, ligne) {
    const etat = el.querySelector('.etat'), eleve = el.dataset.e;
    etat.className = 'etat'; etat.textContent = '…';
    const brut = await sb.rpc('saisir_notes', { p_eval: ev.id, p_lignes: [{ eleve_id: eleve, ...ligne }] });
    const hors = !!(brut.error && estReseau(brut.error));
    if (brut.error && !hors) { etat.className = 'etat err'; etat.textContent = brut.error.message; return false; }
    if (hors) mettreEnFile(ev.id, eleve, ligne);
    N.notes = N.notes.filter(x => !(x.evaluation_id === ev.id && x.eleve_id === eleve));
    if (ligne.statut || String(ligne.valeur ?? '').trim()) {
      const st = ligne.statut || 'note';
      N.notes.push({ evaluation_id: ev.id, eleve_id: eleve, statut: st, valeur: st === 'note' ? num(ligne.valeur) : null, commentaire: ligne.commentaire || null });
    }
    majLigne(el, ev);
    if (hors) { etat.className = 'etat att'; etat.textContent = '⏳'; etat.title = 'Gardée sur l’appareil, envoi au retour du réseau'; return true; }
    etat.textContent = '✓'; setTimeout(() => { if (etat.textContent === '✓') etat.textContent = ''; }, 1800);
    return true;
  }
  function liensNotes() {
    document.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => { N.vue = b.dataset.vue; N.evalId = null; recharger(chargerNotes); });
    if (N.vue === 'reglages') return liensReglages();
    if (N.vue === 'releve') return liensReleve();
    majFile();
    liensSelecteurs(chargerNotes, true); lienFiche();
    const nouvelle = $('#e-nouvelle'); if (nouvelle) nouvelle.onclick = () => { N.creation = true; refaire(); };
    const annuler = $('#e-annuler'); if (annuler) annuler.onclick = () => { N.creation = false; refaire(); };
    const creer = $('#e-creer'); if (creer) creer.onclick = async () => {
      const titre = $('#e-titre').value.trim(), date = $('#e-date').value, bareme = num($('#e-bareme').value), coef = num($('#e-coef').value);
      if (!titre) { dire('err', 'Donne un titre à l’évaluation.'); return refaire(); }
      if (!(bareme > 0) || !(coef > 0)) { dire('err', 'Le barème et le coefficient doivent être des nombres positifs.'); return refaire(); }
      const id = crypto.randomUUID();
      const r = await sb.from('evaluations').insert({ id, enseignement_id: N.ensId, titre, date_eval: date, type: $('#e-type').value, bareme, coefficient: coef });
      if (r.error) { dire('err', r.error.message); return refaire(); }
      const comps = [...document.querySelectorAll('[data-comp]:checked')].map(c => ({ evaluation_id: id, competence_id: c.dataset.comp }));
      if (comps.length) { const rc = await sb.from('evaluation_competences').insert(comps); if (rc.error) { dire('err', 'Évaluation créée, mais pas ses compétences : ' + rc.error.message); } }
      const p = N.periodes.find(x => date >= x.debut && date <= x.fin); if (p) N.periodeId = p.id;
      if (!S.message) dire('ok', `Évaluation créée${p ? ' dans ' + p.libelle : ''}.`);
      N.creation = false; N.evalId = id; recharger(chargerNotes);
    };
    document.querySelectorAll('[data-saisir]').forEach(b => b.onclick = () => { N.evalId = b.dataset.saisir; S.message = null; refaire(); });
    document.querySelectorAll('[data-suppr]').forEach(b => b.onclick = async () => {
      if (N.confirmer !== b.dataset.suppr) { N.confirmer = b.dataset.suppr; return refaire(); }
      N.confirmer = null; const r = await sb.from('evaluations').delete().eq('id', b.dataset.suppr);
      dire(r.error ? 'err' : 'ok', r.error ? r.error.message : 'Évaluation supprimée avec ses notes.'); recharger(chargerNotes);
    });
    const ev = N.evalId && evalCourante(); if (!ev) return;
    $('#s-retour').onclick = () => { N.evalId = null; S.message = null; recharger(chargerNotes); };
    const m = $('#m-ok'); if (m) m.onclick = async () => {
      const r = await sb.from('evaluations').update({ titre: $('#m-titre').value.trim(), date_eval: $('#m-date').value, bareme: num($('#m-bareme').value), coefficient: num($('#m-coef').value) }).eq('id', ev.id);
      dire(r.error ? 'err' : 'ok', r.error ? r.error.message : 'Évaluation modifiée.'); recharger(chargerNotes);
    };
    document.querySelectorAll('#n-lignes .nl').forEach(el => {
      const inp = el.querySelector('.ni'), com = () => (el.querySelector('.com') || {}).value || '';
      inp.onfocus = () => inp.select();
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const tous = [...document.querySelectorAll('#n-lignes .ni')]; const nx = tous[tous.indexOf(inp) + 1]; if (nx) nx.focus(); else inp.blur(); } };
      inp.onchange = async () => {
        const t = inp.value.trim().toLowerCase();
        const code = { a: 'absent', abs: 'absent', d: 'dispense', disp: 'dispense', nr: 'non_rendu', n: 'non_rendu' }[t];
        if (!t) return enregistrerLigne(el, ev, {});
        if (code) return enregistrerLigne(el, ev, { statut: code, commentaire: com() });
        const v = num(t); const etat = el.querySelector('.etat');
        if (Number.isNaN(v)) { etat.className = 'etat err'; etat.textContent = `« ${inp.value} » n’est pas une note.`; return; }
        if (v < 0 || v > Number(ev.bareme)) { etat.className = 'etat err'; etat.textContent = `La note doit être entre 0 et ${fmt(ev.bareme)}.`; return; }
        enregistrerLigne(el, ev, { valeur: String(v), commentaire: com() });
      };
      el.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => {
        const actuel = N.notes.find(x => x.evaluation_id === ev.id && x.eleve_id === el.dataset.e);
        enregistrerLigne(el, ev, actuel && actuel.statut === b.dataset.ch ? {} : { statut: b.dataset.ch, commentaire: com() });
      });
      el.querySelector('[data-com]').onclick = () => {
        let c = el.querySelector('.com');
        if (!c) { c = document.createElement('input'); c.className = 'com'; c.placeholder = 'Commentaire sur cette note'; el.appendChild(c); bindCom(el, ev, c); }
        c.focus();
      };
      const c0 = el.querySelector('.com'); if (c0) bindCom(el, ev, c0);
    });
  }
  function bindCom(el, ev, c) {
    c.onchange = () => {
      const n = N.notes.find(x => x.evaluation_id === ev.id && x.eleve_id === el.dataset.e);
      if (!n) { const etat = el.querySelector('.etat'); etat.className = 'etat err'; etat.textContent = 'Saisis d’abord la note.'; return; }
      enregistrerLigne(el, ev, { statut: n.statut, valeur: n.statut === 'note' ? String(n.valeur) : undefined, commentaire: c.value });
    };
  }
  function liensReleve() {
    liensSelecteurs(chargerNotes, false); lienFiche();
    $('#r-csv').onclick = () => {
      const ens = ensDeClasse(), mm = new Map(N.moyM.map(x => [x.eleve_id + x.enseignement_id, x])), gg = new Map(N.moyG.map(x => [x.eleve_id, x]));
      const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"', f = v => v == null ? '' : String(v).replace('.', ',');
      const lignes = [['Élève', ...ens.map(x => nomMatiere(x.matiere_id)), 'Moyenne générale', 'Rang'],
        ...elevesClasse().map(e => [nomEleve(e), ...ens.map(x => f((mm.get(e.id + x.id) || {}).moyenne)), f((gg.get(e.id) || {}).moyenne), (gg.get(e.id) || {}).rang ?? ''])];
      const blob = new Blob(['﻿' + lignes.map(l => l.map(q).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `releve-${(classe() || {}).nom || 'classe'}-${(periodeDe(N.periodeId) || { libelle: 'annee' }).libelle}.csv`.replace(/\s+/g, '-'); a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    const v = $('#r-verrou'); if (v) v.onclick = async () => {
      const p = periodeDe(N.periodeId); const r = await sb.from('periodes').update({ verrouillee: !p.verrouillee }).eq('id', p.id);
      if (r.error) dire('err', r.error.message); else { p.verrouillee = !p.verrouillee; dire('ok', p.verrouillee ? `${p.libelle} verrouillée : seules les modifications de la direction sont encore possibles.` : `${p.libelle} déverrouillée.`); }
      refaire();
    };
  }

  // ---------- Onglet Compétences ----------
  const nivBtn = (cls, valeur, niveau, data) => `<span class="niv">${[1, 2, 3, 4].map(k => `<button style="--c:${COULEURS_NIV[k - 1]}" class="${niveau === k ? 'on' : ''}" ${data} data-n="${k}" title="${esc(N.niveaux[k - 1])}">${k}</button>`).join('')}</span>`;
  const chipNiv = k => k ? `<span class="nv" style="--c:${COULEURS_NIV[k - 1]}" title="${esc(N.niveaux[k - 1])}">${k}</span>` : '<span class="note vide">—</span>';
  function vueCompetences() {
    if (!S.classes.length) return `<div class="carte"><h2>Compétences</h2><p class="doux">Crée d’abord des classes et des élèves.</p></div>`;
    const nav = `<div class="sousnav">${[['saisie', 'Saisie par évaluation'], ['bilan', 'Bilan de période'], ['catalogue', 'Catalogue du socle']].map(([k, l]) => `<button data-sub="${k}" class="${N.sub === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const legende = `<p class="petit">${N.niveaux.map((l, i) => `<span class="nv" style="--c:${COULEURS_NIV[i]}">${i + 1}</span> ${esc(l)}`).join(' &nbsp; ')}</p>`;
    let corps = '';
    if (N.sub === 'saisie') corps = selecteurs(true) + vueCompSaisie();
    else if (N.sub === 'bilan') corps = selecteurs(false) + vueBilan();
    else corps = vueCatalogue();
    return `${msgNotes()}<div class="carte"><h2>Compétences</h2>${nav}${N.sub === 'catalogue' ? '' : legende}${corps}</div>`;
  }
  const compsDe = evId => N.evalComps.filter(x => x.evaluation_id === evId).map(x => N.competences.find(c => c.id === x.competence_id)).filter(Boolean);
  function vueCompSaisie() {
    const avec = N.evals.filter(ev => compsDe(ev.id).length);
    if (!N.evalId || !avec.some(e => e.id === N.evalId)) N.evalId = (avec[0] || {}).id || null;
    const ev = avec.find(e => e.id === N.evalId);
    if (!ev) return '<p class="doux">Aucune évaluation avec compétences pour cette matière et cette période. Coche des compétences en créant une évaluation (onglet Notes).</p>';
    const cs = compsDe(ev.id);
    const lignes = elevesClasse().map(e => `<tr><td><button class="lien" data-fiche="${e.id}">${esc(nomEleve(e))}</button></td>${cs.map(c => {
      const a = N.acqs.find(x => x.evaluation_id === ev.id && x.competence_id === c.id && x.eleve_id === e.id);
      return `<td>${nivBtn('', 0, a ? a.niveau : 0, `data-e="${e.id}" data-c="${c.id}"`)}</td>`; }).join('')}</tr>`).join('');
    return `<div class="barre"><select id="c-eval">${avec.map(x => opt(x.id, `${x.titre} (${jourFr(x.date_eval + 'T12:00:00')})`, x.id === ev.id)).join('')}</select><span class="petit">Touche un niveau ; touche le même pour l’effacer.</span></div>
      <div class="tablewrap"><table><tr><th>Élève</th>${cs.map(c => `<th title="${esc(c.libelle)}">${esc(c.code)}<br><span class="petit" style="text-transform:none;font-weight:400">${esc(c.libelle.slice(0, 38))}…</span></th>`).join('')}</tr>${lignes}</table></div>`;
  }
  function vueBilan() {
    const c = classe(), cy = c ? cycleDe(c.niveau) : 4, cs = N.competences.filter(x => x.cycle === cy && x.actif);
    const per = periodeDe(N.periodeId), m = new Map(N.bilan.map(x => [x.eleve_id + x.competence_id, x]));
    const lignes = elevesClasse().map(e => `<tr><td><button class="lien" data-fiche="${e.id}">${esc(nomEleve(e))}</button></td>${cs.map(x => {
      const b = m.get(e.id + x.id), retenu = b ? b.niveau_retenu : null;
      return `<td>${per && estPP() ? `<select data-bil data-e="${e.id}" data-c="${x.id}" style="width:64px;padding:5px"><option value="">${b && b.niveau_propose ? '(' + b.niveau_propose + ')' : '—'}</option>${[1, 2, 3, 4].map(k => `<option value="${k}" ${b && b.modifie && retenu === k ? 'selected' : ''}>${k}</option>`).join('')}</select>` : ''} ${chipNiv(retenu)}${b && b.modifie ? ' <span class="petit" title="Corrigé à la main">✎</span>' : ''}</td>`; }).join('')}</tr>`).join('');
    return `<p class="petit">Niveau proposé = moyenne arrondie des niveaux saisis dans la période (entre parenthèses). Le professeur principal ou la direction peut le corriger : ✎ = corrigé à la main.${per ? '' : ' Choisis une période pour corriger.'}</p>
      <div class="tablewrap"><table><tr><th>Élève</th>${cs.map(x => `<th title="${esc(x.libelle)}">${esc(x.code)}</th>`).join('')}</tr>${lignes}</table></div>`;
  }
  function vueCatalogue() {
    const lignes = N.competences.map(c => `<tr><td>Cycle ${c.cycle}</td><td><strong>${esc(c.code)}</strong></td><td>${esc(c.domaine)}</td><td>${esc(c.libelle)}</td>
      <td>${c.officiel ? `<span class="tag ok" title="${esc(c.source_ref || '')}">Officielle</span>${c.source_url ? ` <a class="petit" href="${esc(c.source_url)}" target="_blank" rel="noopener">source</a>` : ''}` : '<span class="tag" style="background:#fde2e0;color:#8a1a10">Ajout du collège · non officielle</span>'}</td>
      <td>${c.actif ? '<span class="tag ok">Active</span>' : '<span class="tag">Désactivée</span>'}</td><td>${estAdm() ? `<button class="b sec" data-actif="${c.id}">${c.actif ? 'Désactiver' : 'Réactiver'}</button>` : ''}</td></tr>`).join('');
    return `<p class="petit">Les 8 composantes du socle commun sont préchargées avec le texte officiel (décret n° 2015-372 du 31 mars 2015, BO n° 17 du 23 avril 2015), pour le cycle 3 (6e) et le cycle 4 (5e à 3e). Leur texte ne peut pas être modifié. L’administration peut désactiver une composante ou ajouter une compétence propre au collège, qui est alors signalée comme non officielle.</p>
      ${estAdm() ? '' : '<p class="petit">Lecture seule : seule la direction modifie le catalogue.</p>'}
      ${estAdm() ? `<div class="barre"><select id="k-cycle">${opt(3, 'Cycle 3 (6e)')}${opt(4, 'Cycle 4 (5e à 3e)', true)}</select><input id="k-code" placeholder="Code (ex. C1)" style="width:110px"><input id="k-domaine" placeholder="Domaine" style="width:170px"><input id="k-lib" placeholder="Intitulé de la compétence" style="flex:1;min-width:200px"><button class="b" id="k-ajout">Ajouter</button></div>` : ''}
      <div class="tablewrap"><table><tr><th>Cycle</th><th>Code</th><th>Domaine</th><th>Compétence</th><th>Source</th><th></th><th></th></tr>${lignes}</table></div>`;
  }
  function liensCompetences() {
    document.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => { N.sub = b.dataset.sub; N.evalId = null; S.message = null; recharger(chargerCompetences); });
    lienFiche();
    if (N.sub !== 'catalogue') liensSelecteurs(chargerCompetences, N.sub === 'saisie');
    const ce = $('#c-eval'); if (ce) ce.onchange = () => { N.evalId = ce.value; refaire(); };
    document.querySelectorAll('.niv button[data-e]').forEach(b => b.onclick = async () => {
      const ev = evalCourante(), el = b.dataset.e, co = b.dataset.c, k = Number(b.dataset.n);
      const actuel = N.acqs.find(x => x.evaluation_id === ev.id && x.competence_id === co && x.eleve_id === el);
      const niveau = actuel && actuel.niveau === k ? null : k;
      const r = await appeler('saisir_acquisitions', { p_eval: ev.id, p_lignes: [{ eleve_id: el, competence_id: co, niveau }] });
      if (r.error) { dire('err', r.error); return refaire(); }
      N.acqs = N.acqs.filter(x => !(x.evaluation_id === ev.id && x.competence_id === co && x.eleve_id === el));
      if (niveau) N.acqs.push({ evaluation_id: ev.id, competence_id: co, eleve_id: el, niveau });
      b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', Number(x.dataset.n) === niveau));
    });
    document.querySelectorAll('[data-bil]').forEach(s => s.onchange = async () => {
      const el = s.dataset.e, co = s.dataset.c, per = N.periodeId;
      const base = () => sb.from('bilans_competences');
      const r = !s.value ? await base().delete().eq('eleve_id', el).eq('competence_id', co).eq('periode_id', per)
        : N.bilan.some(x => x.eleve_id === el && x.competence_id === co && x.modifie)
          ? await base().update({ niveau: Number(s.value) }).eq('eleve_id', el).eq('competence_id', co).eq('periode_id', per)
          : await base().insert({ eleve_id: el, competence_id: co, periode_id: per, niveau: Number(s.value) });
      if (r.error) dire('err', r.error.message); else dire('ok', 'Bilan corrigé.');
      recharger(chargerBilan);
    });
    document.querySelectorAll('[data-actif]').forEach(b => b.onclick = async () => {
      const c = N.competences.find(x => x.id === b.dataset.actif); const r = await sb.from('competences').update({ actif: !c.actif }).eq('id', c.id);
      if (r.error) dire('err', r.error.message); recharger(chargerCompetences);
    });
    const aj = $('#k-ajout'); if (aj) aj.onclick = async () => {
      const code = $('#k-code').value.trim(), lib = $('#k-lib').value.trim(), dom = $('#k-domaine').value.trim() || 'Établissement';
      if (!code || !lib) { dire('err', 'Indique le code et l’intitulé.'); return refaire(); }
      const r = await sb.from('competences').insert({ cycle: Number($('#k-cycle').value), code, domaine: dom, libelle: lib, ordre: 50 });
      dire(r.error ? 'err' : 'ok', r.error ? (/duplicate|unique/i.test(r.error.message) ? 'Ce code existe déjà pour ce cycle.' : r.error.message) : 'Compétence ajoutée.');
      recharger(chargerCompetences);
    };
  }


  // ---------- Fiche élève : courbe d'évolution et camembert des niveaux de compétence ----------
  const G = { id: null, mat: '', pts: [], niv: [0, 0, 0, 0], niveauxVisibles: true };
  async function chargerGraphiquesEleve() {
    const id = (window.__LC.W || {}).ficheId; G.id = id; G.pts = []; G.niv = [0, 0, 0, 0]; G.niveauxVisibles = true;
    if (!id) return;
    await chargerBase();
    const mine = await sb.from('notes').select('evaluation_id,statut,valeur').eq('eleve_id', id);
    const lignes = (mine.data || []).filter(x => x.statut === 'note' && x.valeur != null);
    if (lignes.length) {
      const ids = lignes.map(x => x.evaluation_id);
      const [ev, tous] = await Promise.all([sb.from('evaluations').select('id,titre,date_eval,bareme,enseignement_id').in('id', ids), sb.from('notes').select('evaluation_id,statut,valeur').in('evaluation_id', ids)]);
      const evs = new Map((ev.data || []).map(x => [x.id, x]));
      const moy = new Map();
      (tous.data || []).filter(x => x.statut === 'note' && x.valeur != null).forEach(x => { const e = evs.get(x.evaluation_id); if (!e) return; const m = moy.get(x.evaluation_id) || { s: 0, n: 0 }; m.s += v20(x.valeur, e.bareme); m.n++; moy.set(x.evaluation_id, m); });
      G.pts = lignes.map(x => { const e = evs.get(x.evaluation_id); if (!e) return null; const en = S.ens.find(y => y.id === e.enseignement_id); const m = moy.get(x.evaluation_id);
        return { date: e.date_eval, titre: e.titre, mat: en ? en.matiere_id : '', note: v20(x.valeur, e.bareme), brut: x.valeur, bareme: e.bareme, classe: m && m.n ? m.s / m.n : null }; })
        .filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
    }
    const el = S.eleves.find(x => x.id === id);
    if (el) {
      const b = await sb.rpc('bilan_competences', { p_classe: el.classe_id, p_periode: null });
      const mien = (b.data || []).filter(x => x.eleve_id === id && x.niveau_retenu);
      mien.forEach(x => { if (x.niveau_retenu >= 1 && x.niveau_retenu <= 4) G.niv[x.niveau_retenu - 1]++; });
      G.niveauxVisibles = !b.error && ((b.data || []).length > 0 || N.droits.admin || N.droits.pp.includes(el.classe_id));
    }
  }
  function svgCourbe(pts) {
    const W = 640, H = 240, gx = 44, gy = 16, dx = W - gx - 16, dy = H - gy - 34;
    const X = i => gx + (pts.length === 1 ? dx / 2 : i * dx / (pts.length - 1)), Y = v => gy + dy - Math.max(0, Math.min(20, v)) / 20 * dy;
    const grille = [0, 5, 10, 15, 20].map(v => `<line x1="${gx}" x2="${W - 16}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e5dfcf"/><text x="${gx - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="#6b6b6b">${v}</text>`).join('');
    const seuils = `<line x1="${gx}" x2="${W - 16}" y1="${Y(N.params.haut)}" y2="${Y(N.params.haut)}" stroke="#e6c800" stroke-dasharray="2 4"/><line x1="${gx}" x2="${W - 16}" y1="${Y(N.params.bas)}" y2="${Y(N.params.bas)}" stroke="#e11d00" stroke-dasharray="2 4"/>`;
    const cl = pts.map((p, i) => p.classe == null ? null : [X(i), Y(p.classe)]).filter(Boolean);
    const ligneClasse = cl.length > 1 ? `<polyline fill="none" stroke="#8a8a8a" stroke-width="2" stroke-dasharray="6 5" points="${cl.map(q => q.join(',')).join(' ')}"/>` : '';
    const ligne = pts.length > 1 ? `<polyline fill="none" stroke="#0b5d4b" stroke-width="2.5" points="${pts.map((p, i) => X(i) + ',' + Y(p.note)).join(' ')}"/>` : '';
    const points = pts.map((p, i) => { const c = p.note >= N.params.haut ? '#ffe600' : p.note < N.params.bas ? '#e11d00' : '#0b5d4b';
      return `<circle cx="${X(i)}" cy="${Y(p.note)}" r="6.5" fill="${c}" stroke="#0b5d4b" stroke-width="1.5"><title>${esc(p.titre)} · ${jourFr(p.date + 'T12:00:00')} : ${fmt(p.brut)}/${fmt(p.bareme)}${p.classe != null ? ' (classe ' + fmt(p.classe) + '/20)' : ''}</title></circle>
        <text x="${X(i)}" y="${Y(p.note) - 11}" text-anchor="middle" font-size="11" font-weight="700" fill="#222">${fmt(Math.round(p.note * 10) / 10)}</text>`; }).join('');
    const etiq = pts.map((p, i) => (pts.length <= 8 || i % Math.ceil(pts.length / 8) === 0) ? `<text x="${X(i)}" y="${H - 10}" text-anchor="middle" font-size="10" fill="#6b6b6b">${esc(p.date.slice(8, 10) + '/' + p.date.slice(5, 7))}</text>` : '').join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution des notes sur 20" style="width:100%;max-width:680px;height:auto">${grille}${seuils}${ligneClasse}${ligne}${points}${etiq}</svg>`;
  }
  function svgCamembert(niv) {
    const tot = niv.reduce((a, b) => a + b, 0); if (!tot) return '';
    const cols = ['#c9d3d8', '#8fa7b3', '#3f8f7a', '#0b5d4b'], R = 70, C = 80; let a0 = -Math.PI / 2;
    const arcs = niv.map((n, i) => { if (!n) return ''; const a1 = a0 + n / tot * 2 * Math.PI;
      if (n === tot) { a0 = a1; return `<circle cx="${C}" cy="${C}" r="${R}" fill="${cols[i]}"/>`; }
      const d = `M${C},${C} L${C + R * Math.cos(a0)},${C + R * Math.sin(a0)} A${R},${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${C + R * Math.cos(a1)},${C + R * Math.sin(a1)} Z`; a0 = a1;
      return `<path d="${d}" fill="${cols[i]}" stroke="#fff" stroke-width="2"><title>${esc(N.niveaux[i])} : ${n}</title></path>`; }).join('');
    const legende = niv.map((n, i) => `<div style="display:flex;gap:8px;align-items:center;margin:3px 0"><span style="width:14px;height:14px;border-radius:3px;background:${cols[i]};display:inline-block"></span><span><strong>${n}</strong> · ${i + 1} ${esc(N.niveaux[i])}</span></div>`).join('');
    return `<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap"><svg viewBox="0 0 160 160" role="img" aria-label="Répartition des niveaux de compétence" style="width:160px;height:160px">${arcs}</svg><div>${legende}</div></div>`;
  }
  function vueGraphiquesEleve() {
    if (!G.id) return '';
    const mats = [...new Set(G.pts.map(p => p.mat).filter(Boolean))];
    const pts = G.mat ? G.pts.filter(p => p.mat === G.mat) : G.pts;
    const sel = mats.length > 1 ? `<select id="g-mat" style="max-width:260px">${opt('', 'Toutes les matières', !G.mat)}${mats.map(m => opt(m, nomMatiere(m), G.mat === m)).join('')}</select>` : '';
    const courbe = pts.length ? `<div class="barre">${sel}<span class="petit">Ligne pleine : l’élève · pointillés gris : moyenne de la classe · points jaunes ≥ ${fmt(N.params.haut)} · rouges < ${fmt(N.params.bas)}</span></div>${svgCourbe(pts)}`
      : '<p class="doux">Aucune note visible pour cet élève.</p>';
    const tot = G.niv.reduce((a, b) => a + b, 0);
    const camembert = tot ? svgCamembert(G.niv) : `<p class="doux">${G.niveauxVisibles ? 'Aucun niveau de compétence évalué pour le moment.' : 'La répartition des compétences est réservée au professeur principal et à la direction.'}</p>`;
    return `<div class="carte"><h2>Évolution des notes</h2>${courbe}</div><div class="carte"><h2>Compétences du socle : répartition des niveaux</h2>${camembert}</div>`;
  }
  function liensGraphiquesEleve() { const m = $('#g-mat'); if (m) m.onchange = () => { G.mat = m.value; refaire(); }; }
  const baseFiche = { vue: VUES.fiche, liens: LIENS.fiche, load: LOAD.fiche };
  if (baseFiche.vue) {
    VUES.fiche = () => { const h = baseFiche.vue(); return h.includes('Absences, retards, sorties') ? h + vueGraphiquesEleve() : h; };
    LIENS.fiche = () => { baseFiche.liens(); liensGraphiquesEleve(); };
    LOAD.fiche = async () => { await baseFiche.load(); try { await chargerGraphiquesEleve(); } catch { G.pts = []; } };
  }

  // ---------- Branchement ----------
  insererOnglet('notes', 'Notes', 'fiche');
  insererOnglet('competences', 'Compétences', 'notes');
  Object.assign(VUES, { notes: vueNotes, competences: vueCompetences });
  Object.assign(LIENS, { notes: liensNotes, competences: liensCompetences });
  Object.assign(LOAD, { notes: chargerNotes, competences: chargerCompetences });
})();
