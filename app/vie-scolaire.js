// Luqmân Campus — étape 2 : vie scolaire du quotidien
// Appel (fonctionne hors ligne), suivi du jour, téléphones, punitions et retenues.
// Chargé après le script principal de index.html : il ajoute ses onglets (ONGLETS, VUES, LIENS)
// et expose window.LCVS pour les modules suivants (vie-scolaire-2.js).
(function () {
  const STATUTS = [['present', 'Présent', '#1b7a4b'], ['absent', 'Absent', '#b3261e'], ['retard', 'Retard', '#b26a00'], ['sortie', 'Sortie', '#6a3fa0'], ['dispense', 'Dispensé', '#0D9488']];
  const LIBELLE = Object.fromEntries(STATUTS.map(([k, l]) => [k, l]));
  const TYPES_OBS = [['travail', 'Travail'], ['comportement', 'Comportement'], ['oubli', 'Oubli de matériel'], ['telephone', 'Téléphone'], ['felicitation', 'Félicitations'], ['autre', 'Autre']];
  const ECHELLE = ['Avertissement', 'Blâme', 'Mesure de responsabilisation', 'Exclusion temporaire de la classe', 'Exclusion temporaire de l’établissement', 'Exclusion définitive'];
  const STATUTS_PUN = [['demandee', 'Demandée'], ['a_faire', 'À faire'], ['faite', 'Faite'], ['non_faite', 'Non faite'], ['annulee', 'Annulée']];
  const TYPES_PREVUE = { absence: 'Absence', rendez_vous: 'Rendez-vous', sortie_pedagogique: 'Sortie pédagogique', autre: 'Autre' };
  const V = { cours: [], ouvert: null, presences: [], corrections: {}, edit: null, editCours: null, recap: null, manquants: [], suivi: [], prevues: [], surveiller: [],
    coffre: {}, punitions: [], obs: [], seances: [], seanceOuverte: null, classeTel: '', profs: [], groupes: [], membres: {}, editJustif: null };

  const css = document.createElement('style');
  css.textContent = `
    .cours { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:10px 0; border-bottom:1px solid var(--filet); }
    .cours:last-child { border-bottom:0; }
    .cours .h { font-weight:700; min-width:92px; }
    .cours .q { flex:1; min-width:150px; }
    .cours.annule .q, .cours.annule .h { text-decoration:line-through; color:var(--doux); }
    .tag { display:inline-block; border-radius:999px; padding:2px 10px; font-size:12px; font-weight:700; background:#eef5f4; color:#215a55; margin:1px 2px; }
    .tag.ok { background:#e3f4ea; color:var(--ok); } .tag.att { background:#fff4d6; color:#6a4e00; } .tag.err { background:#fdeceb; color:var(--rouge); } .tag.vio { background:#efe7f7; color:#6a3fa0; }
    .eleve { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:8px 0; border-bottom:1px solid var(--filet); }
    .eleve .n { flex:1 1 150px; font-weight:500; min-width:140px; }
    .sts { display:flex; gap:4px; flex-wrap:wrap; align-items:center; }
    .sts button { font:inherit; font-size:13px; font-weight:700; padding:10px 10px; min-width:66px; border-radius:8px; border:2px solid var(--c); background:#fff; color:var(--c); cursor:pointer; touch-action:manipulation; }
    .sts button.on { background:var(--c); color:#fff; }
    .edit { flex-basis:100%; background:#f7f3e8; border-radius:8px; padding:8px; display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
    .petit { font-size:12px; color:var(--doux); }
    .grosbtn { font-size:16px; padding:12px 18px; }
    .lien { background:none; border:0; padding:0; font:inherit; color:var(--sarcelle); font-weight:700; cursor:pointer; text-decoration:underline; text-align:left; }
    .hl { padding:8px 16px; font-size:13px; font-weight:700; background:#fdeceb; color:var(--rouge); border-bottom:1px solid #f1c3bf; }
    .hl.att { background:#fff4d6; color:#6a4e00; border-color:#f0dca0; }
    .obs-btn { margin-left:6px; font-size:12px; font-weight:700; color:var(--doux); background:none; border:1px solid var(--filet); border-radius:999px; padding:2px 8px; cursor:pointer; }
    @media (max-width: 640px) {
      .appel .eleve { padding:6px 0; gap:4px; }
      .appel .eleve .n { flex-basis:100%; }
      .appel .eleve .sts { flex:1 1 100%; flex-wrap:nowrap; }
      .appel .sts button { flex:1; min-width:0; padding:11px 2px; font-size:12.5px; }
    }
  `;
  document.head.appendChild(css);

  // ---------- Outils ----------
  const heure = iso => iso ? new Date(iso).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }) : '';
  const jourParis = d => new Date(d).toLocaleDateString('sv', { timeZone: 'Europe/Paris' });
  const jourFr = iso => new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
  const nomEleve = e => `${e.nom} ${e.prenom}`;
  const eleveParId = id => S.eleves.find(e => e.id === id);
  const nomProf = id => { const p = V.profs.find(x => x.id === id); return p ? `${p.prenom} ${p.nom}` : 'un remplaçant'; };
  const lire = (k, def) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? def; } catch { return def; } };
  const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } };
  const estReseau = err => !navigator.onLine || /fetch|network|load failed|timeout|timed out|abort/i.test(String(err && (err.message || err)));
  const rpc = async (nom, args) => { const r = await sb.rpc(nom, args || {}); if (r.error) dire('err', estReseau(r.error) ? 'Pas de connexion : réessaie quand le réseau revient.' : r.error.message); return r; };
  const refaire = () => dessiner();
  const coursDe = id => V.cours.find(c => c.id === id);
  const elevesDuCours = c => {
    const l = S.eleves.filter(e => e.classe_id === c.enseignements.classe_id);
    return c.groupe_id ? l.filter(e => (V.membres[c.groupe_id] || []).includes(e.id)) : l;
  };
  const nomGroupe = id => (V.groupes.find(g => g.id === id) || {}).nom || '';
  const lienFiche = () => document.querySelectorAll('[data-fiche]').forEach(x => x.onclick = () => window.LCVS.ouvrirFiche && window.LCVS.ouvrirFiche(x.dataset.fiche));

  // ---------- Hors ligne : file d'attente des saisies ----------
  const FILE = 'lc_file';
  const file = () => lire(FILE, []);
  function enfiler(it) {
    let f = file();
    const avant = f.find(x => x.t === it.t && x.cours === it.cours && x.eleve_id === it.eleve_id);
    if (avant && it.t === 'pres' && avant.statut === it.statut) it.heure = avant.heure;   // compléter une sortie garde l'heure de sortie
    f = f.filter(x => !(x.t === it.t && x.cours === it.cours && x.eleve_id === it.eleve_id)); f.push(it); ecrire(FILE, f); majBandeau();
  }
  const bandeau = document.createElement('div'); bandeau.className = 'hl'; bandeau.hidden = true;
  document.getElementById('nav').before(bandeau);
  function majBandeau() {
    const n = file().length;
    bandeau.hidden = navigator.onLine && n === 0;
    bandeau.className = navigator.onLine ? 'hl att' : 'hl';
    bandeau.textContent = navigator.onLine
      ? `${n} saisie${n > 1 ? 's' : ''} en attente de synchronisation…`
      : `Hors ligne : l’appel continue de fonctionner${n ? `, ${n} saisie${n > 1 ? 's' : ''} en attente` : ''}. Tout sera envoyé au retour du réseau.`;
  }
  let syncEnCours = false;
  async function synchroniser() {
    majBandeau();
    if (syncEnCours || !navigator.onLine || !file().length) return;
    syncEnCours = true; let erreur = null;
    try {
      const parCours = {};
      file().filter(x => x.t === 'pres').forEach(x => (parCours[x.cours] = parCours[x.cours] || []).push(x));
      for (const [cours, l] of Object.entries(parCours)) {
        const r = await sb.rpc('synchroniser_presences', { p_cours: cours, p_changements: l.map(x => ({ eleve_id: x.eleve_id, statut: x.statut, autorise_par: x.autorise_par || '', recupere_par: x.recupere_par || '', heure: x.heure })) });
        if (r.error && estReseau(r.error)) return;
        if (r.error) erreur = r.error.message; else if (r.data && r.data.raison) erreur = r.data.raison;
        ecrire(FILE, file().filter(x => !(x.t === 'pres' && x.cours === cours)));
      }
      for (const x of file().filter(x => x.t === 'valider')) {
        const r = await sb.rpc('valider_appel', { p_cours: x.cours });
        if (r.error && estReseau(r.error)) return;
        if (r.error) erreur = r.error.message;
        ecrire(FILE, file().filter(y => !(y.t === 'valider' && y.cours === x.cours)));
      }
      dire(erreur ? 'err' : 'ok', erreur ? 'Synchronisation : ' + erreur : 'Saisies faites hors ligne envoyées.');
      if (['appel', 'suivi'].includes(S.tab)) { await chargerCours(); if (V.ouvert) await chargerPresences(); refaire(); }
    } finally { syncEnCours = false; majBandeau(); }
  }
  window.addEventListener('online', synchroniser);
  window.addEventListener('offline', majBandeau);
  setInterval(synchroniser, 20000);
  setTimeout(synchroniser, 1500);

  // ---------- Chargements ----------
  async function chargerProfs() { if (V.profs.length) return; const r = await sb.rpc('liste_professeurs'); if (!r.error) V.profs = r.data || []; }
  async function chargerCours() {
    const depuis = new Date(Date.now() - 2 * 86400000).toISOString();
    const r = await sb.from('cours').select('id,debut,fin,salle,lieu,hors_etablissement,annule,motif_annulation,remplacant_id,groupe_id,enseignements(classe_id,matiere_id,professeur_id)').gte('debut', depuis).order('debut');
    if (r.error) {
      if (!estReseau(r.error)) dire('err', r.error.message);
      V.cours = lire('lc_cache_cours', []); V.groupes = lire('lc_cache_groupes', []); V.membres = lire('lc_cache_membres', {});
    } else {
      const auj = jourParis(new Date());
      V.cours = r.data.filter(c => jourParis(c.debut) === auj);
      const ids = V.cours.map(c => c.id);
      const [a, g] = await Promise.all([
        ids.length ? sb.from('appels').select('cours_id,valide_a').in('cours_id', ids) : { data: [] },
        sb.from('groupes').select('id,classe_id,nom').order('nom')]);
      const map = Object.fromEntries((a.data || []).map(x => [x.cours_id, x]));
      V.cours.forEach(c => { c.appel = map[c.id] || null; });
      V.groupes = g.data || [];
      const gids = [...new Set(V.cours.map(c => c.groupe_id).filter(Boolean))];
      V.membres = {};
      if (gids.length) { const m = await sb.from('groupe_eleves').select('groupe_id,eleve_id').in('groupe_id', gids); (m.data || []).forEach(x => (V.membres[x.groupe_id] = V.membres[x.groupe_id] || []).push(x.eleve_id)); }
      ecrire('lc_cache_cours', V.cours); ecrire('lc_cache_groupes', V.groupes); ecrire('lc_cache_membres', V.membres);
    }
    file().filter(x => x.t === 'valider').forEach(x => { const c = coursDe(x.cours); if (c) c.appel = { valide_a: x.heure, local: true }; });
  }
  function appliquerFileLocale() {
    file().filter(x => x.t === 'pres' && x.cours === V.ouvert).forEach(x => {
      let p = V.presences.find(y => y.eleve_id === x.eleve_id);
      if (!p) { p = { id: null, cours_id: x.cours, eleve_id: x.eleve_id }; V.presences.push(p); }
      Object.assign(p, { statut: x.statut, heure_evenement: x.statut === 'present' ? null : x.heure, autorise_par: x.autorise_par, recupere_par: x.recupere_par, attente: true });
      if (x.statut === 'retard') { const c = coursDe(x.cours); p.minutes_retard = Math.max(5, Math.ceil((new Date(x.heure) - new Date(c.debut)) / 300000) * 5); p.estime = true; }
    });
  }
  async function chargerPresences() {
    const r = await sb.from('presences').select('*').eq('cours_id', V.ouvert);
    if (r.error) {
      if (!estReseau(r.error)) dire('err', r.error.message);
      V.presences = lire('lc_cache_pres_' + V.ouvert, null) || elevesDuCours(coursDe(V.ouvert)).map(e => ({ id: null, cours_id: V.ouvert, eleve_id: e.id, statut: 'present' }));
    } else {
      V.presences = r.data; V.corrections = {};
      const ids = r.data.map(p => p.id);
      if (ids.length) { const k = await sb.from('corrections_presence').select('presence_id,motif,created_at').in('presence_id', ids).order('created_at'); (k.data || []).forEach(x => { V.corrections[x.presence_id] = x; }); }
      ecrire('lc_cache_pres_' + V.ouvert, V.presences);
    }
    appliquerFileLocale();
  }

  // ---------- Appel ----------
  function vueAppel() {
    if (V.ouvert) return vueFaireAppel();
    const test = window.LC.modeTest ? `<button class="b sec" id="v-fictifs">Créer les cours fictifs du jour</button>` : '';
    const lignes = V.cours.map(c => {
      const cl = nomClasse(c.enseignements.classe_id), ma = nomMatiere(c.enseignements.matiere_id);
      const etat = c.annule ? `<span class="tag err">Annulé${c.motif_annulation ? ' : ' + esc(c.motif_annulation) : ''}</span>`
        : c.appel?.local ? '<span class="tag att">Validé (hors ligne)</span>' : c.appel?.valide_a ? '<span class="tag ok">Appel validé</span>' : c.appel ? '<span class="tag att">Appel en cours</span>' : '<span class="tag">À faire</span>';
      const infos = [c.salle, c.lieu].filter(Boolean).map(esc).join(' · ');
      const tags = (c.groupe_id ? `<span class="tag">${esc(nomGroupe(c.groupe_id))}</span>` : '') + (c.hors_etablissement ? '<span class="tag vio">Hors établissement</span>' : '')
        + (c.remplacant_id ? `<span class="tag vio">Remplacé par ${esc(nomProf(c.remplacant_id))}</span>` : '');
      let gestion = '';
      if (V.editCours === c.id) {
        const gs = V.groupes.filter(g => g.classe_id === c.enseignements.classe_id);
        gestion = `<div class="edit">
          ${c.annule ? `<button class="b sec" data-retablir="${c.id}">Rétablir le cours</button>` : `<input id="v-motif-annul" placeholder="Motif de l’annulation" style="flex:1;min-width:150px"><button class="b danger" data-annuler="${c.id}">Annuler le cours</button>`}
          ${V.profs.length ? `<select id="v-remp"><option value="">Pas de remplaçant</option>${V.profs.map(p => `<option value="${p.id}" ${c.remplacant_id === p.id ? 'selected' : ''}>${esc(p.prenom + ' ' + p.nom)}</option>`).join('')}</select><button class="b sec" data-remp="${c.id}">Remplaçant</button>` : '<span class="petit">Remplaçant : disponible une fois connecté.</span>'}
          ${gs.length ? `<select id="v-grp"><option value="">Classe entière</option>${gs.map(g => `<option value="${g.id}" ${c.groupe_id === g.id ? 'selected' : ''}>${esc(g.nom)}</option>`).join('')}</select><button class="b sec" data-grp="${c.id}">Groupe</button>` : ''}
        </div>`;
      }
      return `<div class="cours ${c.annule ? 'annule' : ''}"><div class="h">${heure(c.debut)}–${heure(c.fin)}</div><div class="q"><strong>${esc(cl)}</strong> · ${esc(ma)} <span class="petit">${infos}</span> ${tags}</div>${etat}
        ${c.annule ? '' : `<button class="b" data-ouvrir="${c.id}">${c.appel?.valide_a ? 'Revoir' : 'Faire l’appel'}</button>`}
        <button class="b sec" style="padding:8px 10px" data-gerer="${c.id}" title="Annuler, remplaçant, groupe">⋯</button>${gestion}</div>`;
    }).join('');
    return `${msg()}<div class="carte"><div class="barre"><h2 style="margin:0;flex:1">Cours du jour</h2>${test}</div>
      ${V.cours.length ? lignes : '<p class="doux">Aucun cours aujourd’hui. En mode test, crée des cours fictifs avec le bouton ci-dessus.</p>'}</div>`;
  }

  function infoPresence(p) {
    if (!p) return '';
    const t = [];
    if (p.statut === 'retard') t.push(`${p.estime ? '≈ ' : ''}${p.minutes_retard} min (arrivé à ${heure(p.heure_evenement)})`);
    if (p.statut === 'absent' || p.statut === 'dispense') t.push(heure(p.heure_evenement));
    if (p.statut === 'sortie') t.push(`sorti à ${heure(p.heure_evenement)} · autorisé : ${esc(p.autorise_par || '—')} · récupéré par : ${esc(p.recupere_par || '—')}`);
    if (p.motif) t.push(esc(p.motif));
    let tags = '';
    if (p.justifiee) tags += `<span class="tag ok">Justifiée${p.justificatif_recu ? ' · justificatif reçu' : ''}</span>`;
    if (p.attente) tags += '<span class="tag att">En attente d’envoi</span>';
    if (p.saisie_hors_ligne) tags += '<span class="tag">Saisi hors ligne</span>';
    if (p.id && V.corrections[p.id]) tags += `<span class="tag vio">Corrigé : ${esc(V.corrections[p.id].motif)}</span>`;
    return `<span class="petit">${t.join(' · ')}</span>${tags}`;
  }

  function vueFaireAppel() {
    const c = coursDe(V.ouvert);
    const cl = nomClasse(c.enseignements.classe_id), ma = nomMatiere(c.enseignements.matiere_id);
    const valide = !!c.appel?.valide_a;
    const parEleve = Object.fromEntries(V.presences.map(p => [p.eleve_id, p]));
    const ids = new Set(V.presences.map(p => p.eleve_id));
    const eleves = S.eleves.filter(e => ids.has(e.id)).concat(elevesDuCours(c).filter(e => !ids.has(e.id)));
    const cnt = k => V.presences.filter(p => p.statut === k).length;
    const lignes = eleves.map(e => {
      const p = parEleve[e.id]; const st = p ? p.statut : 'present';
      const boutons = STATUTS.map(([k, l, col]) => `<button style="--c:${col}" class="${st === k ? 'on' : ''}" data-st="${k}" data-e="${e.id}">${l}</button>`).join('');
      let edit = '';
      if (V.edit && V.edit.eleve === e.id && V.edit.mode === 'sortie') edit = `<div class="edit"><input id="v-aut" placeholder="Qui a autorisé ?" value="${esc(p?.autorise_par || '')}"><input id="v-rec" placeholder="Qui vient le chercher ?" value="${esc(p?.recupere_par || '')}"><button class="b" id="v-ok-sortie">Enregistrer la sortie</button></div>`;
      if (V.edit && V.edit.eleve === e.id && V.edit.mode === 'obs') edit = `<div class="edit"><select id="v-otype">${TYPES_OBS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><input id="v-otexte" placeholder="Observation" style="flex:1;min-width:160px"><label class="petit"><input type="checkbox" id="v-oconf"> confidentielle</label><button class="b" id="v-ok-obs">Ajouter</button></div>`;
      if (V.edit && V.edit.eleve === e.id && V.edit.mode === 'corriger') edit = `<div class="edit"><select id="v-cst">${STATUTS.map(([k, l]) => `<option value="${k}" ${st === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <label class="petit">Heure réelle <input type="time" id="v-ch"></label><input id="v-caut" placeholder="Autorisé par (sortie)" value="${esc(p?.autorise_par || '')}"><input id="v-crec" placeholder="Récupéré par (sortie)" value="${esc(p?.recupere_par || '')}">
        <input id="v-cmotif" placeholder="Motif de la correction (obligatoire)" style="flex:1;min-width:180px"><button class="b" id="v-ok-corr">Corriger</button></div>`;
      const actions = valide
        ? `<span class="tag">${LIBELLE[st]}</span>${p && p.id && !c.appel.local ? `<button class="b sec" style="padding:7px 10px" data-corr="${e.id}">Corriger</button>` : ''}`
        : boutons;
      const info = infoPresence(p);
      return `<div class="eleve"><div class="n"><button class="lien" data-fiche="${e.id}">${esc(nomEleve(e))}</button>${valide ? '' : `<button class="obs-btn" data-obs="${e.id}">＋ obs.</button>`}${info ? '<br>' + info : ''}</div><div class="sts">${actions}</div>${edit}</div>`;
    }).join('');
    const recap = V.recap ? `<div class="msg ok"><strong>Appel validé${V.recap.local ? ' (hors ligne, envoi au retour du réseau)' : ''}.</strong> Présents : ${V.recap.presents} · Absents : ${V.recap.absents} · Retards : ${V.recap.retards} · Sorties : ${V.recap.sorties} · Dispensés : ${V.recap.dispenses}</div>` : '';
    const titre = `${esc(cl)}${c.groupe_id ? ' (' + esc(nomGroupe(c.groupe_id)) + ')' : ''} · ${esc(ma)} · ${heure(c.debut)}`;
    return `${msg()}${recap}<div class="carte"><div class="barre"><button class="b sec" id="v-retour">← Retour</button><h2 style="margin:0;flex:1">${titre}</h2>
      ${valide ? '<span class="tag ok">Appel validé</span>' : `<button class="b grosbtn" id="v-valider">Valider l’appel</button>`}</div>
      <p class="doux">${eleves.length} élèves · tous « présents » par défaut, touche seulement les exceptions. Absents : ${cnt('absent')} · Retards : ${cnt('retard')} · Sorties : ${cnt('sortie')} · Dispensés : ${cnt('dispense')}</p>
      ${valide ? '<p class="petit">Appel validé : une modification passe par « Corriger » (vie scolaire), avec un motif. Elle reste tracée.</p>' : ''}<div class="appel">${lignes}</div></div>`;
  }

  async function changerStatut(eleve, champs) {
    if (navigator.onLine && !file().some(x => x.cours === V.ouvert)) {
      const r = await sb.from('presences').update(champs).eq('cours_id', V.ouvert).eq('eleve_id', eleve);
      if (!r.error) return true;
      if (!estReseau(r.error)) { dire('err', r.error.message); return false; }
    }
    const p = V.presences.find(x => x.eleve_id === eleve) || {};
    enfiler({ t: 'pres', cours: V.ouvert, eleve_id: eleve, statut: champs.statut || p.statut || 'present', autorise_par: champs.autorise_par ?? p.autorise_par, recupere_par: champs.recupere_par ?? p.recupere_par, heure: new Date().toISOString() });
    return true;
  }
  async function apresChangement() {
    if (navigator.onLine && !file().some(x => x.cours === V.ouvert)) await chargerPresences();
    else { appliquerFileLocale(); ecrire('lc_cache_pres_' + V.ouvert, V.presences); synchroniser(); }
    refaire();
  }

  function liensAppel() {
    const f = $('#v-fictifs');
    if (f) f.onclick = async () => { f.disabled = true; const r = await rpc('dev_creer_cours_du_jour'); if (!r.error) dire('ok', `${r.data} cours fictifs créés pour aujourd’hui.`); await chargerCours(); refaire(); };
    lienFiche();
    document.querySelectorAll('[data-gerer]').forEach(b => b.onclick = async () => { V.editCours = V.editCours === b.dataset.gerer ? null : b.dataset.gerer; S.message = null; if (V.editCours) await chargerProfs(); refaire(); });
    document.querySelectorAll('[data-annuler]').forEach(b => b.onclick = async () => { const r = await rpc('annuler_cours', { p_cours: b.dataset.annuler, p_annule: true, p_motif: $('#v-motif-annul').value }); if (!r.error) { dire('ok', 'Cours annulé : il ne sera plus réclamé dans les appels manquants.'); V.editCours = null; } await chargerCours(); refaire(); });
    document.querySelectorAll('[data-retablir]').forEach(b => b.onclick = async () => { const r = await rpc('annuler_cours', { p_cours: b.dataset.retablir, p_annule: false, p_motif: '' }); if (!r.error) { dire('ok', 'Cours rétabli.'); V.editCours = null; } await chargerCours(); refaire(); });
    document.querySelectorAll('[data-remp]').forEach(b => b.onclick = async () => { const r = await rpc('remplacer_cours', { p_cours: b.dataset.remp, p_prof: $('#v-remp').value || null }); if (!r.error) { dire('ok', 'Remplaçant enregistré : il peut faire l’appel de ce cours.'); V.editCours = null; } await chargerCours(); refaire(); });
    document.querySelectorAll('[data-grp]').forEach(b => b.onclick = async () => { const r = await sb.from('cours').update({ groupe_id: $('#v-grp').value || null }).eq('id', b.dataset.grp); dire(r.error ? 'err' : 'ok', r.error ? r.error.message : 'Groupe du cours enregistré.'); V.editCours = null; await chargerCours(); refaire(); });
    document.querySelectorAll('[data-ouvrir]').forEach(b => b.onclick = async () => {
      const r = await sb.rpc('ouvrir_appel', { p_cours: b.dataset.ouvrir });
      if (r.error && !estReseau(r.error)) { dire('err', r.error.message); return refaire(); }
      V.ouvert = b.dataset.ouvrir; V.recap = null; V.edit = null; S.message = null; await chargerPresences(); refaire();
    });
    if (!V.ouvert) return;
    const retour = $('#v-retour'); if (retour) retour.onclick = async () => { V.ouvert = null; V.edit = null; V.recap = null; await chargerCours(); refaire(); };
    const valider = $('#v-valider'); if (valider) valider.onclick = async () => {
      valider.disabled = true;
      const c = coursDe(V.ouvert); const cnt = k => V.presences.filter(p => p.statut === k).length;
      if (navigator.onLine && !file().some(x => x.cours === V.ouvert)) {
        const r = await sb.rpc('valider_appel', { p_cours: V.ouvert });
        if (!r.error) { V.recap = r.data; S.message = null; await chargerCours(); await chargerPresences(); return refaire(); }
        if (!estReseau(r.error)) { dire('err', r.error.message); return refaire(); }
      }
      enfiler({ t: 'valider', cours: V.ouvert, heure: new Date().toISOString() });
      c.appel = { valide_a: new Date().toISOString(), local: true };
      V.recap = { local: true, presents: cnt('present') + Math.max(0, elevesDuCours(c).length - V.presences.length), absents: cnt('absent'), retards: cnt('retard'), sorties: cnt('sortie'), dispenses: cnt('dispense') };
      ecrire('lc_cache_cours', V.cours); synchroniser(); refaire();
    };
    document.querySelectorAll('[data-st]').forEach(b => b.onclick = async () => {
      const id = b.dataset.e, st = b.dataset.st;
      if (!(await changerStatut(id, { statut: st }))) return refaire();
      S.message = null; V.edit = st === 'sortie' ? { eleve: id, mode: 'sortie' } : null; await apresChangement();
    });
    document.querySelectorAll('[data-obs]').forEach(b => b.onclick = () => { V.edit = { eleve: b.dataset.obs, mode: 'obs' }; refaire(); });
    document.querySelectorAll('[data-corr]').forEach(b => b.onclick = () => { V.edit = { eleve: b.dataset.corr, mode: 'corriger' }; S.message = null; refaire(); });
    const so = $('#v-ok-sortie'); if (so) so.onclick = async () => {
      await changerStatut(V.edit.eleve, { autorise_par: $('#v-aut').value.trim() || null, recupere_par: $('#v-rec').value.trim() || null });
      V.edit = null; await apresChangement();
    };
    const oo = $('#v-ok-obs'); if (oo) oo.onclick = async () => {
      const texte = $('#v-otexte').value.trim(); if (!texte) return;
      const r = await sb.from('observations').insert({ eleve_id: V.edit.eleve, cours_id: V.ouvert, type: $('#v-otype').value, texte, confidentielle: $('#v-oconf').checked });
      dire(r.error ? 'err' : 'ok', r.error ? (estReseau(r.error) ? 'Pas de connexion : l’observation n’est pas enregistrée, réessaie plus tard.' : r.error.message) : 'Observation ajoutée.'); V.edit = null; refaire();
    };
    const oc = $('#v-ok-corr'); if (oc) oc.onclick = async () => {
      const p = V.presences.find(x => x.eleve_id === V.edit.eleve), c = coursDe(V.ouvert);
      const h = $('#v-ch').value; const quand = h ? new Date(`${jourParis(c.debut)}T${h}:00`).toISOString() : null;
      const r = await rpc('corriger_presence', { p_presence: p.id, p_statut: $('#v-cst').value, p_motif: $('#v-cmotif').value, p_heure: quand, p_autorise: $('#v-caut').value, p_recupere: $('#v-crec').value });
      if (!r.error) { dire('ok', 'Correction enregistrée et tracée.'); V.edit = null; }
      await chargerPresences(); refaire();
    };
  }

  // ---------- Suivi du jour ----------
  async function chargerSuivi() {
    const [m, w] = await Promise.all([sb.rpc('appels_manquants'), sb.rpc('eleves_a_surveiller')]);
    V.manquants = m.error ? [] : m.data; V.surveiller = w.error ? [] : w.data;
    if (m.error) dire('err', estReseau(m.error) ? 'Pas de connexion : le suivi du jour a besoin du réseau.' : m.error.message);
    const ids = V.cours.map(c => c.id);
    const j = jourParis(new Date());
    const debutJour = new Date(j + 'T00:00:00').toISOString(), finJour = new Date(j + 'T23:59:59').toISOString();
    const [p, a] = await Promise.all([
      ids.length ? sb.from('presences').select('*').in('cours_id', ids).neq('statut', 'present') : { data: [] },
      sb.from('absences_prevues').select('*').eq('annulee', false).lt('debut', finJour).gt('fin', debutJour)]);
    V.suivi = (p.data || []).sort((x, y) => (x.heure_evenement || '').localeCompare(y.heure_evenement || ''));
    V.prevues = a.data || [];
  }
  function vueSuivi() {
    const man = V.manquants.map(m => `<tr><td>${heure(m.debut)}</td><td>${esc(m.classe)} · ${esc(m.matiere)}</td><td>${m.minutes_ecoulees} min</td>
      <td>${m.niveau === 'vie_scolaire' ? '<span class="tag err">Alerte vie scolaire</span>' : '<span class="tag att">Rappel au professeur</span>'}</td></tr>`).join('');
    const sv = V.suivi.map(p => { const e = eleveParId(p.eleve_id), c = coursDe(p.cours_id); if (!e || !c) return '';
      const det = p.statut === 'retard' ? `${p.minutes_retard} min` : p.statut === 'sortie' ? `autorisé : ${esc(p.autorise_par || '—')} · récupéré par : ${esc(p.recupere_par || '—')}` : '';
      const justif = ['absent', 'retard'].includes(p.statut)
        ? (p.justifiee ? `<span class="tag ok">Justifiée${p.justificatif_recu ? ' · justificatif' : ''}</span>` : `<span class="tag err">Non justifiée</span> <button class="lien" data-justif="${p.id}">Justifier</button>`) : '';
      const form = V.editJustif === p.id ? `<tr><td colspan="6"><div class="edit"><input id="j-motif" placeholder="Motif (maladie, transport…)" style="flex:1;min-width:160px"><label class="petit"><input type="checkbox" id="j-recu"> justificatif reçu</label><button class="b" id="j-ok">Justifier</button></div></td></tr>` : '';
      return `<tr><td>${p.heure_evenement ? heure(p.heure_evenement) : ''}</td><td><button class="lien" data-fiche="${e.id}">${esc(nomEleve(e))}</button></td><td>${esc(nomClasse(e.classe_id))}</td><td>${esc(nomMatiere(c.enseignements.matiere_id))}</td><td><strong>${LIBELLE[p.statut]}</strong> ${det} ${p.motif ? '<span class="petit">' + esc(p.motif) + '</span>' : ''}</td><td>${justif}</td></tr>${form}`; }).join('');
    const pv = V.prevues.map(a => { const e = eleveParId(a.eleve_id); return `<tr><td>${heure(a.debut)}–${heure(a.fin)}</td><td>${e ? `<button class="lien" data-fiche="${e.id}">${esc(nomEleve(e))}</button>` : '—'}</td><td>${TYPES_PREVUE[a.type] || a.type}</td><td>${esc(a.motif)}</td></tr>`; }).join('');
    const ws = V.surveiller.slice(0, 8).map(w => { const e = eleveParId(w.eleve_id); if (!e) return '';
      return `<tr><td><button class="lien" data-fiche="${e.id}">${esc(nomEleve(e))}</button></td><td>${esc(nomClasse(e.classe_id))}</td><td>${w.motifs.map(m => `<span class="tag err">${{ retards: w.retards_periode + ' retards', absences: w.demi_journees_mois + ' demi-journées non justifiées', telephone: w.non_depots + ' téléphones non déposés' }[m]}</span>`).join('')}</td></tr>`; }).join('');
    return `${msg()}<div class="carte"><div class="barre"><h2 style="margin:0;flex:1">Appels non faits</h2><button class="b sec" id="v-rafraichir">Rafraîchir</button></div>
      ${man ? `<div class="tablewrap"><table><tr><th>Cours</th><th>Classe</th><th>Depuis</th><th>Niveau</th></tr>${man}</table></div>` : '<p class="doux">Aucun appel en retard.</p>'}
      <p class="petit">Rappel au professeur après le délai réglé, puis alerte vie scolaire. Cours annulés et jours fermés exclus. Les notifications sur téléphone viendront plus tard.</p></div>
      <div class="carte"><h2>Absences, retards, sorties et dispenses du jour</h2>
      ${sv ? `<div class="tablewrap"><table><tr><th>Heure</th><th>Élève</th><th>Classe</th><th>Matière</th><th>Statut</th><th>Justification</th></tr>${sv}</table></div>` : '<p class="doux">Rien à signaler pour l’instant.</p>'}</div>
      <div class="carte"><h2>Absences prévues aujourd’hui</h2>${pv ? `<div class="tablewrap"><table><tr><th>Horaire</th><th>Élève</th><th>Type</th><th>Motif</th></tr>${pv}</table></div>` : '<p class="doux">Aucune. Elles se saisissent depuis la fiche de l’élève.</p>'}</div>
      <div class="carte"><h2>Élèves à surveiller</h2>${ws ? `<div class="tablewrap"><table><tr><th>Élève</th><th>Classe</th><th>Seuils atteints</th></tr>${ws}</table></div>${V.surveiller.length > 8 ? `<p class="petit">${V.surveiller.length - 8} autres dans le tableau de bord.</p>` : ''}` : '<p class="doux">Aucun seuil atteint.</p>'}</div>`;
  }
  function liensSuivi() {
    const b = $('#v-rafraichir'); if (b) b.onclick = async () => { S.message = null; await chargerCours(); await chargerSuivi(); refaire(); };
    lienFiche();
    document.querySelectorAll('[data-justif]').forEach(x => x.onclick = () => { V.editJustif = x.dataset.justif; refaire(); });
    const ok = $('#j-ok'); if (ok) ok.onclick = async () => {
      const r = await rpc('justifier_absences', { p_presences: [V.editJustif], p_justifiee: true, p_motif: $('#j-motif').value, p_justificatif: $('#j-recu').checked });
      if (!r.error) { dire('ok', 'Absence justifiée.'); V.editJustif = null; }
      await chargerSuivi(); refaire();
    };
  }

  // ---------- Téléphones ----------
  async function chargerCoffre() {
    const r = await sb.from('coffre_telephone').select('*').eq('jour', jourParis(new Date()));
    V.coffre = Object.fromEntries((r.data || []).map(x => [x.eleve_id, x]));
  }
  function vueTel() {
    const opts = S.classes.map(c => `<option value="${c.id}" ${V.classeTel === c.id ? 'selected' : ''}>${esc(c.nom)}</option>`).join('');
    const eleves = S.eleves.filter(e => e.classe_id === V.classeTel);
    const lignes = eleves.map(e => {
      const x = V.coffre[e.id]; let etat = '<span class="tag">—</span>', act = '';
      if (x?.non_depose) etat = '<span class="tag err">Non déposé</span>';
      else if (x?.restitue_a) etat = `<span class="tag ok">Restitué à ${heure(x.restitue_a)}</span>`;
      else if (x?.depose_a) etat = `<span class="tag att">Au coffre depuis ${heure(x.depose_a)}${x.casier ? ' · casier ' + esc(x.casier) : ''}</span>`;
      if (x?.depose_a && !x.restitue_a) act = `<button class="b" data-rest="${e.id}">Restituer</button>`;
      else if (!x?.depose_a) act = `<input size="5" placeholder="Casier" data-cas="${e.id}"><button class="b" data-dep="${e.id}">Déposé</button><button class="b danger" data-nd="${e.id}">Non déposé</button>`;
      return `<div class="eleve"><div class="n">${esc(nomEleve(e))}</div>${etat}<div class="sts">${act}</div></div>`;
    }).join('');
    return `${msg()}<div class="carte"><div class="barre"><h2 style="margin:0;flex:1">Coffre à téléphones</h2><select id="v-classe-tel"><option value="">Choisir une classe…</option>${opts}</select></div>
      ${V.classeTel ? lignes : '<p class="doux">Choisis une classe.</p>'}</div>`;
  }
  function liensTel() {
    const sel = $('#v-classe-tel'); sel.onchange = async () => { V.classeTel = sel.value; S.message = null; await chargerCoffre(); refaire(); };
    document.querySelectorAll('[data-dep]').forEach(b => b.onclick = async () => { const cas = document.querySelector(`[data-cas="${b.dataset.dep}"]`).value; const r = await rpc('deposer_telephone', { p_eleve: b.dataset.dep, p_casier: cas }); if (!r.error) S.message = null; await chargerCoffre(); refaire(); });
    document.querySelectorAll('[data-rest]').forEach(b => b.onclick = async () => { await rpc('restituer_telephone', { p_eleve: b.dataset.rest }); await chargerCoffre(); refaire(); });
    document.querySelectorAll('[data-nd]').forEach(b => b.onclick = async () => {
      const r = await rpc('signaler_non_depot', { p_eleve: b.dataset.nd });
      if (!r.error) dire(r.data.sanction_a_prevoir ? 'err' : 'info', r.data.sanction_a_prevoir ? `Non-dépôt n°${r.data.total} : le seuil (${r.data.seuil}) est atteint, une sanction est à prévoir.` : `Non-dépôt n°${r.data.total} enregistré (seuil de sanction : ${r.data.seuil}).`);
      await chargerCoffre(); refaire();
    });
  }

  // ---------- Punitions, sanctions et retenues ----------
  async function chargerPun() {
    const [p, o, s] = await Promise.all([
      sb.from('punitions').select('*').order('created_at', { ascending: false }).limit(100),
      sb.from('observations').select('*').order('created_at', { ascending: false }).limit(30),
      sb.from('seances_retenue').select('*').gte('fin', new Date(Date.now() - 7 * 86400000).toISOString()).order('debut')]);
    V.punitions = p.data || []; V.obs = o.data || []; V.seances = s.data || [];
    if (p.error) dire('err', estReseau(p.error) ? 'Pas de connexion.' : p.error.message);
  }
  const estRetenue = p => /retenue/i.test(p.type || '');
  const heuresTxt = h => h ? String(Number(h)).replace('.', ',') + ' h' : '';
  const libSeance = s => `${jourFr(s.debut)} ${heure(s.debut)}–${heure(s.fin)}${s.salle ? ' · ' + esc(s.salle) : ''}${s.surveillant ? ' · ' + esc(s.surveillant) : ''}`;
  function vuePun() {
    const optsE = S.eleves.map(e => `<option value="${e.id}">${esc(nomEleve(e))} (${esc(nomClasse(e.classe_id))})</option>`).join('');
    const nomE = id => { const e = eleveParId(id); return e ? `<button class="lien" data-fiche="${e.id}">${esc(nomEleve(e))}</button>` : '—'; };
    const aPlanifier = V.punitions.filter(p => estRetenue(p) && p.statut === 'demandee');
    const optsS = V.seances.filter(s => new Date(s.fin) > new Date()).map(s => `<option value="${s.id}">${libSeance(s)}</option>`).join('');
    const lPlan = aPlanifier.map(p => `<div class="eleve"><div class="n">${nomE(p.eleve_id)} <span class="petit">${heuresTxt(p.duree_heures)} · ${esc(p.motif)} · demandée le ${jourFr(p.created_at)}</span></div>
      <div class="sts">${optsS ? `<select data-seance-for="${p.id}">${optsS}</select><button class="b" data-planifier="${p.id}">Placer</button>` : '<span class="petit">Crée d’abord une séance ci-dessous.</span>'}<button class="b danger" data-refuser="${p.id}">Refuser</button></div></div>`).join('');
    const lSeances = V.seances.map(s => {
      const inscrits = V.punitions.filter(p => p.seance_id === s.id);
      const places = s.places ? ` · ${inscrits.length}/${s.places} places` : ` · ${inscrits.length} élève(s)`;
      const detail = V.seanceOuverte === s.id ? (inscrits.map(p => `<div class="eleve"><div class="n">${nomE(p.eleve_id)} <span class="petit">${heuresTxt(p.duree_heures)} · ${esc(p.motif)}</span></div>
        <div class="sts"><button style="--c:#1b7a4b" class="${p.presence_retenue === 'present' ? 'on' : ''}" data-pointer="${p.id}" data-v="present">Présent</button><button style="--c:#b3261e" class="${p.presence_retenue === 'absent' ? 'on' : ''}" data-pointer="${p.id}" data-v="absent">Absent</button></div></div>`).join('') || '<p class="petit">Aucun élève placé.</p>') : '';
      return `<div class="cours"><div class="q"><strong>${libSeance(s)}</strong><span class="petit">${places}</span></div><button class="b sec" data-ouvrir-seance="${s.id}">${V.seanceOuverte === s.id ? 'Fermer' : 'Liste et pointage'}</button></div>${detail}`;
    }).join('');
    const lp = V.punitions.map(p => { const s = p.seance_id && V.seances.find(x => x.id === p.seance_id);
      return `<tr><td>${jourFr(p.created_at)}</td><td>${nomE(p.eleve_id)}</td><td>${p.nature === 'sanction' ? '<span class="tag err">Sanction</span>' : 'Punition'} · ${esc(p.type)}${p.duree_heures ? ' · ' + heuresTxt(p.duree_heures) : ''}</td><td>${esc(p.motif)}</td>
      <td>${p.echeance ? fr(p.echeance) : ''}${s ? '<br><span class="petit">' + libSeance(s) + '</span>' : ''}</td>
      <td><select data-pst="${p.id}">${STATUTS_PUN.map(([k, l]) => `<option value="${k}" ${p.statut === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td></tr>`; }).join('');
    const lo = V.obs.map(o => `<tr><td>${jourFr(o.created_at)}</td><td>${nomE(o.eleve_id)}</td><td>${esc((TYPES_OBS.find(t => t[0] === o.type) || [])[1] || o.type)}${o.confidentielle ? ' <span class="tag vio">Confidentielle</span>' : ''}</td><td>${esc(o.texte)}</td></tr>`).join('');
    return `${msg()}<div class="carte"><h2>Nouvelle punition ou sanction</h2><div class="barre">
      <select id="p-eleve" style="max-width:260px"><option value="">Élève…</option>${optsE}</select>
      <select id="p-nature"><option value="punition">Punition</option><option value="sanction">Sanction (direction)</option></select>
      <input id="p-type" placeholder="Type (retenue, devoir…)" list="p-types"><datalist id="p-types"><option>Retenue</option><option>Devoir supplémentaire</option><option>Excuse écrite</option><option>Exclusion ponctuelle de cours</option></datalist>
      <select id="p-type-s" style="display:none">${ECHELLE.map(x => `<option>${esc(x)}</option>`).join('')}</select>
      <input id="p-duree" type="number" min="0.5" step="0.5" placeholder="Heures" style="width:90px;display:none" title="Nombre d'heures de retenue">
      <input id="p-motif" placeholder="Motif" style="flex:1;min-width:160px"><input id="p-ech" type="date" title="Échéance"><button class="b" id="p-ajout">Ajouter</button></div>
      <p class="petit">Une retenue donnée par un professeur arrive en « demandée » : la vie scolaire la place sur une séance. Une sanction est décidée par la direction.</p></div>
      <div class="carte"><h2>Retenues à placer</h2>${lPlan || '<p class="doux">Aucune demande en attente.</p>'}</div>
      <div class="carte"><h2>Séances de retenue</h2><div class="barre"><input type="date" id="s-jour"><input type="time" id="s-debut" value="13:00"><input type="time" id="s-fin" value="15:00">
        <input id="s-salle" placeholder="Salle" style="width:100px"><input id="s-surv" placeholder="Surveillant" style="width:130px"><input id="s-places" type="number" min="1" placeholder="Places" style="width:80px"><button class="b" id="s-ajout">Créer la séance</button></div>
        ${lSeances || '<p class="doux">Aucune séance à venir.</p>'}</div>
      <div class="carte"><h2>Punitions et sanctions</h2>${lp ? `<div class="tablewrap"><table><tr><th>Date</th><th>Élève</th><th>Nature</th><th>Motif</th><th>Échéance / séance</th><th>Statut</th></tr>${lp}</table></div>` : '<p class="doux">Aucune pour l’instant.</p>'}</div>
      <div class="carte"><h2>Dernières observations</h2>${lo ? `<div class="tablewrap"><table><tr><th>Date</th><th>Élève</th><th>Type</th><th>Observation</th></tr>${lo}</table></div>` : '<p class="doux">Aucune pour l’instant.</p>'}</div>`;
  }
  function liensPun() {
    lienFiche();
    const typeIn = $('#p-type'), typeS = $('#p-type-s'), dureeIn = $('#p-duree'), nat = $('#p-nature');
    const montrer = () => {
      const sanction = nat.value === 'sanction';
      typeIn.style.display = sanction ? 'none' : ''; typeS.style.display = sanction ? '' : 'none';
      dureeIn.style.display = !sanction && /retenue/i.test(typeIn.value) ? '' : 'none';
    };
    typeIn.oninput = montrer; typeIn.onchange = montrer; nat.onchange = montrer; montrer();
    $('#p-ajout').onclick = async () => {
      const sanction = nat.value === 'sanction';
      const row = { eleve_id: $('#p-eleve').value, nature: nat.value, type: (sanction ? typeS.value : typeIn.value).trim(), motif: $('#p-motif').value.trim(), echeance: $('#p-ech').value || null };
      if (!row.eleve_id || !row.type || !row.motif) { dire('err', 'Choisis un élève, un type et un motif.'); return refaire(); }
      if (!sanction && /retenue/i.test(row.type)) {
        const h = parseFloat(dureeIn.value.replace(',', '.'));
        if (!(h > 0)) { dire('err', 'Pour une retenue, indique le nombre d’heures.'); return refaire(); }
        row.duree_heures = h;
      }
      const r = await sb.from('punitions').insert(row); dire(r.error ? 'err' : 'ok', r.error ? r.error.message : 'Ajoutée.'); await chargerPun(); refaire();
    };
    document.querySelectorAll('[data-pst]').forEach(s => s.onchange = async () => { const r = await sb.from('punitions').update({ statut: s.value }).eq('id', s.dataset.pst); if (r.error) dire('err', r.error.message); await chargerPun(); refaire(); });
    document.querySelectorAll('[data-planifier]').forEach(b => b.onclick = async () => {
      const seance = document.querySelector(`[data-seance-for="${b.dataset.planifier}"]`).value;
      const r = await sb.from('punitions').update({ seance_id: seance, statut: 'a_faire' }).eq('id', b.dataset.planifier);
      dire(r.error ? 'err' : 'ok', r.error ? r.error.message : 'Retenue placée.'); await chargerPun(); refaire();
    });
    document.querySelectorAll('[data-refuser]').forEach(b => b.onclick = async () => { const r = await sb.from('punitions').update({ statut: 'annulee' }).eq('id', b.dataset.refuser); dire(r.error ? 'err' : 'info', r.error ? r.error.message : 'Demande refusée (statut « annulée »).'); await chargerPun(); refaire(); });
    document.querySelectorAll('[data-ouvrir-seance]').forEach(b => b.onclick = () => { V.seanceOuverte = V.seanceOuverte === b.dataset.ouvrirSeance ? null : b.dataset.ouvrirSeance; refaire(); });
    document.querySelectorAll('[data-pointer]').forEach(b => b.onclick = async () => {
      const present = b.dataset.v === 'present';
      const r = await sb.from('punitions').update({ presence_retenue: b.dataset.v, statut: present ? 'faite' : 'non_faite' }).eq('id', b.dataset.pointer);
      if (r.error) dire('err', r.error.message); else S.message = null; await chargerPun(); refaire();
    });
    $('#s-ajout').onclick = async () => {
      const j = $('#s-jour').value, d = $('#s-debut').value, f = $('#s-fin').value;
      if (!j || !d || !f) { dire('err', 'Indique le jour et les heures de la séance.'); return refaire(); }
      const r = await sb.from('seances_retenue').insert({ debut: new Date(`${j}T${d}:00`).toISOString(), fin: new Date(`${j}T${f}:00`).toISOString(), salle: $('#s-salle').value.trim() || null, surveillant: $('#s-surv').value.trim() || null, places: parseInt($('#s-places').value, 10) || null });
      dire(r.error ? 'err' : 'ok', r.error ? r.error.message : 'Séance créée.'); await chargerPun(); refaire();
    };
  }

  // ---------- Branchement ----------
  const LOAD = { appel: chargerCours, suivi: async () => { await chargerCours(); await chargerSuivi(); }, tel: chargerCoffre, pun: chargerPun };
  function insererOnglet(k, libelle, apres) {
    const i = apres ? ONGLETS.findIndex(o => o[0] === apres) : -1;
    if (i < 0) ONGLETS.push([k, libelle]); else ONGLETS.splice(i + 1, 0, [k, libelle]);
  }
  ONGLETS.unshift(['appel', 'Appel'], ['suivi', 'Suivi du jour'], ['pun', 'Punitions'], ['tel', 'Téléphones']);
  VUES.appel = vueAppel; VUES.suivi = vueSuivi; VUES.tel = vueTel; VUES.pun = vuePun;
  LIENS.appel = liensAppel; LIENS.suivi = liensSuivi; LIENS.tel = liensTel; LIENS.pun = liensPun;
  S.tab = 'appel';

  // Chaque changement d'onglet recharge ses données avant de dessiner.
  const dessinerBase = dessiner;
  let occupe = false;
  window.dessiner = dessiner = function () {
    const k = S.tab;
    if (LOAD[k] && !V['pret_' + k] && !occupe) {
      occupe = true; V['pret_' + k] = true;
      LOAD[k]().catch(e => dire('err', String(e.message || e))).finally(() => { occupe = false; dessinerBase(); });
      return;
    }
    dessinerBase();
  };
  document.addEventListener('click', e => { const b = e.target.closest('#nav button'); if (b && LOAD[b.dataset.k]) V['pret_' + b.dataset.k] = false; }, true);
  const aller = k => { S.tab = k; S.message = null; V['pret_' + k] = false; dessiner(); };

  window.LCVS = { V, LOAD, insererOnglet, aller, outils: { heure, jourParis, jourFr, nomEleve, eleveParId, lire, ecrire, estReseau, rpc, refaire, lienFiche, LIBELLE, STATUTS, TYPES_OBS, ECHELLE, TYPES_PREVUE, heuresTxt, chargerCours } };
  window.__LC.V = V;
  majBandeau();
})();
