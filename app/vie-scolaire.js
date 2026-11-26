// Luqmân Campus — étape 2 : vie scolaire du quotidien (appel, suivi du jour, téléphones, punitions)
// Chargé après le script principal de index.html : il ajoute ses onglets (ONGLETS, VUES, LIENS).
(function () {
  const STATUTS = [['present', 'Présent', '#1b7a4b'], ['absent', 'Absent', '#b3261e'], ['retard', 'Retard', '#b26a00'], ['sortie', 'Sortie', '#6a3fa0'], ['dispense', 'Dispensé', '#0D9488']];
  const LIBELLE = Object.fromEntries(STATUTS.map(([k, l]) => [k, l]));
  const TYPES_OBS = [['travail', 'Travail'], ['comportement', 'Comportement'], ['oubli', 'Oubli de matériel'], ['telephone', 'Téléphone'], ['felicitation', 'Félicitations'], ['autre', 'Autre']];
  const V = { cours: [], ouvert: null, presences: [], edit: null, recap: null, manquants: [], suivi: [], coffre: {}, punitions: [], obs: [], classeTel: '', charge: false };

  const css = document.createElement('style');
  css.textContent = `
    .cours { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:10px 0; border-bottom:1px solid var(--filet); }
    .cours:last-child { border-bottom:0; }
    .cours .h { font-weight:700; min-width:92px; }
    .cours .q { flex:1; min-width:150px; }
    .tag { display:inline-block; border-radius:999px; padding:2px 10px; font-size:12px; font-weight:700; background:#eef5f4; color:#215a55; }
    .tag.ok { background:#e3f4ea; color:var(--ok); } .tag.att { background:#fff4d6; color:#6a4e00; } .tag.err { background:#fdeceb; color:var(--rouge); }
    .eleve { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:8px 0; border-bottom:1px solid var(--filet); }
    .eleve .n { flex:1 1 150px; font-weight:500; min-width:140px; }
    .sts { display:flex; gap:4px; flex-wrap:wrap; }
    .sts button { font:inherit; font-size:13px; font-weight:700; padding:9px 10px; min-width:64px; border-radius:8px; border:2px solid var(--c); background:#fff; color:var(--c); cursor:pointer; }
    .sts button.on { background:var(--c); color:#fff; }
    .edit { flex-basis:100%; background:#f7f3e8; border-radius:8px; padding:8px; display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
    .petit { font-size:12px; color:var(--doux); }
    .grosbtn { font-size:16px; padding:12px 18px; }
  `;
  document.head.appendChild(css);

  const heure = iso => new Date(iso).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
  const jourParis = d => new Date(d).toLocaleDateString('sv', { timeZone: 'Europe/Paris' });
  const nomEleve = e => `${e.nom} ${e.prenom}`;
  const eleveParId = id => S.eleves.find(e => e.id === id);
  const rpc = async (nom, args) => { const r = await sb.rpc(nom, args || {}); if (r.error) { dire('err', r.error.message); } return r; };
  const refaire = () => dessiner();

  async function chargerCours() {
    const depuis = new Date(Date.now() - 2 * 86400000).toISOString();
    const r = await sb.from('cours').select('id,debut,fin,salle,enseignements(classe_id,matiere_id)').gte('debut', depuis).order('debut');
    if (r.error) { dire('err', r.error.message); return; }
    const auj = jourParis(new Date());
    V.cours = r.data.filter(c => jourParis(c.debut) === auj);
    const a = await sb.from('appels').select('cours_id,valide_a').in('cours_id', V.cours.map(c => c.id));
    const map = Object.fromEntries((a.data || []).map(x => [x.cours_id, x]));
    V.cours.forEach(c => { c.appel = map[c.id] || null; });
    V.charge = true;
  }
  async function chargerPresences() {
    const r = await sb.from('presences').select('*').eq('cours_id', V.ouvert);
    if (r.error) { dire('err', r.error.message); return; }
    V.presences = r.data;
  }

  // ---------- Appel ----------
  function vueAppel() {
    if (V.ouvert) return vueFaireAppel();
    const test = window.LC.modeTest ? `<button class="b sec" id="v-fictifs">Créer les cours fictifs du jour</button>` : '';
    const lignes = V.cours.map(c => {
      const cl = nomClasse(c.enseignements.classe_id), ma = nomMatiere(c.enseignements.matiere_id);
      const etat = c.appel?.valide_a ? '<span class="tag ok">Appel validé</span>' : c.appel ? '<span class="tag att">Appel en cours</span>' : '<span class="tag">À faire</span>';
      return `<div class="cours"><div class="h">${heure(c.debut)}–${heure(c.fin)}</div><div class="q"><strong>${esc(cl)}</strong> · ${esc(ma)} <span class="petit">${esc(c.salle || '')}</span></div>${etat}
        <button class="b" data-ouvrir="${c.id}">${c.appel?.valide_a ? 'Revoir' : 'Faire l’appel'}</button></div>`;
    }).join('');
    return `${msg()}<div class="carte"><div class="barre"><h2 style="margin:0;flex:1">Cours du jour</h2>${test}</div>
      ${V.cours.length ? lignes : '<p class="doux">Aucun cours aujourd’hui. En mode test, crée des cours fictifs avec le bouton ci-dessus.</p>'}</div>`;
  }
  function vueFaireAppel() {
    const c = V.cours.find(x => x.id === V.ouvert);
    const cl = nomClasse(c.enseignements.classe_id), ma = nomMatiere(c.enseignements.matiere_id);
    const valide = !!c.appel?.valide_a;
    const parEleve = Object.fromEntries(V.presences.map(p => [p.eleve_id, p]));
    const eleves = S.eleves.filter(e => e.classe_id === c.enseignements.classe_id);
    const cnt = k => V.presences.filter(p => p.statut === k).length;
    const lignes = eleves.map(e => {
      const p = parEleve[e.id]; const st = p ? p.statut : 'present';
      const boutons = STATUTS.map(([k, l, col]) => `<button style="--c:${col}" class="${st === k ? 'on' : ''}" data-st="${k}" data-e="${e.id}">${l}</button>`).join('');
      let info = '';
      if (p?.statut === 'retard') info = `<span class="petit">${p.minutes_retard} min (arrivé à ${heure(p.heure_evenement)})</span>`;
      if (p?.statut === 'absent' || p?.statut === 'dispense') info = `<span class="petit">${heure(p.heure_evenement)}</span>`;
      if (p?.statut === 'sortie') info = `<span class="petit">sorti à ${heure(p.heure_evenement)} · autorisé : ${esc(p.autorise_par || '—')} · récupéré par : ${esc(p.recupere_par || '—')}</span>`;
      let edit = '';
      if (V.edit && V.edit.eleve === e.id && V.edit.mode === 'sortie') edit = `<div class="edit"><input id="v-aut" placeholder="Qui a autorisé ?" value="${esc(p?.autorise_par || '')}"><input id="v-rec" placeholder="Qui vient le chercher ?" value="${esc(p?.recupere_par || '')}"><button class="b" id="v-ok-sortie">Enregistrer la sortie</button></div>`;
      if (V.edit && V.edit.eleve === e.id && V.edit.mode === 'obs') edit = `<div class="edit"><select id="v-otype">${TYPES_OBS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><input id="v-otexte" placeholder="Observation" style="flex:1;min-width:160px"><button class="b" id="v-ok-obs">Ajouter</button></div>`;
      return `<div class="eleve"><div class="n">${esc(nomEleve(e))}<br>${info}</div><div class="sts">${valide ? `<span class="tag">${LIBELLE[st]}</span>` : boutons}</div>
        ${valide ? '' : `<button class="b sec" style="padding:7px 10px" data-obs="${e.id}">＋ Obs.</button>`}${edit}</div>`;
    }).join('');
    const recap = V.recap ? `<div class="msg ok"><strong>Appel validé.</strong> Présents : ${V.recap.presents} · Absents : ${V.recap.absents} · Retards : ${V.recap.retards} · Sorties : ${V.recap.sorties} · Dispensés : ${V.recap.dispenses}</div>` : '';
    return `${msg()}${recap}<div class="carte"><div class="barre"><button class="b sec" id="v-retour">← Retour</button><h2 style="margin:0;flex:1">${esc(cl)} · ${esc(ma)} · ${heure(c.debut)}</h2>
      ${valide ? '<span class="tag ok">Appel validé</span>' : `<button class="b grosbtn" id="v-valider">Valider l’appel</button>`}</div>
      <p class="doux">${eleves.length} élèves · tous « présents » par défaut, touche seulement les exceptions. Absents : ${cnt('absent')} · Retards : ${cnt('retard')} · Sorties : ${cnt('sortie')} · Dispensés : ${cnt('dispense')}</p>${lignes}</div>`;
  }
  function liensAppel() {
    const f = $('#v-fictifs');
    if (f) f.onclick = async () => { f.disabled = true; const r = await rpc('dev_creer_cours_du_jour'); if (!r.error) dire('ok', `${r.data} cours fictifs créés pour aujourd’hui.`); await chargerCours(); refaire(); };
    document.querySelectorAll('[data-ouvrir]').forEach(b => b.onclick = async () => {
      const r = await rpc('ouvrir_appel', { p_cours: b.dataset.ouvrir }); if (r.error) return refaire();
      V.ouvert = b.dataset.ouvrir; V.recap = null; V.edit = null; S.message = null; await chargerPresences(); refaire();
    });
    if (!V.ouvert) return;
    const retour = $('#v-retour'); if (retour) retour.onclick = async () => { V.ouvert = null; V.edit = null; V.recap = null; await chargerCours(); refaire(); };
    const valider = $('#v-valider'); if (valider) valider.onclick = async () => {
      valider.disabled = true; const r = await rpc('valider_appel', { p_cours: V.ouvert }); if (r.error) return refaire();
      V.recap = r.data; S.message = null; await chargerCours(); await chargerPresences(); refaire();
    };
    document.querySelectorAll('[data-st]').forEach(b => b.onclick = async () => {
      const id = b.dataset.e, st = b.dataset.st;
      const r = await sb.from('presences').update({ statut: st }).eq('cours_id', V.ouvert).eq('eleve_id', id);
      if (r.error) { dire('err', r.error.message); return refaire(); }
      S.message = null; V.edit = st === 'sortie' ? { eleve: id, mode: 'sortie' } : null; await chargerPresences(); refaire();
    });
    document.querySelectorAll('[data-obs]').forEach(b => b.onclick = () => { V.edit = { eleve: b.dataset.obs, mode: 'obs' }; refaire(); });
    const so = $('#v-ok-sortie'); if (so) so.onclick = async () => {
      const r = await sb.from('presences').update({ autorise_par: $('#v-aut').value.trim() || null, recupere_par: $('#v-rec').value.trim() || null }).eq('cours_id', V.ouvert).eq('eleve_id', V.edit.eleve);
      if (r.error) dire('err', r.error.message); V.edit = null; await chargerPresences(); refaire();
    };
    const oo = $('#v-ok-obs'); if (oo) oo.onclick = async () => {
      const texte = $('#v-otexte').value.trim(); if (!texte) return;
      const r = await sb.from('observations').insert({ eleve_id: V.edit.eleve, cours_id: V.ouvert, type: $('#v-otype').value, texte });
      dire(r.error ? 'err' : 'ok', r.error ? r.error.message : 'Observation ajoutée.'); V.edit = null; refaire();
    };
  }

  // ---------- Suivi du jour ----------
  async function chargerSuivi() {
    const m = await sb.rpc('appels_manquants'); V.manquants = m.error ? [] : m.data;
    if (m.error) dire('err', m.error.message);
    if (!V.charge) await chargerCours();
    const ids = V.cours.map(c => c.id);
    const p = ids.length ? await sb.from('presences').select('*').in('cours_id', ids).neq('statut', 'present') : { data: [] };
    V.suivi = (p.data || []).sort((a, b) => (a.heure_evenement || '').localeCompare(b.heure_evenement || ''));
  }
  function vueSuivi() {
    const man = V.manquants.map(m => `<tr><td>${heure(m.debut)}</td><td>${esc(m.classe)} · ${esc(m.matiere)}</td><td>${m.minutes_ecoulees} min</td>
      <td>${m.niveau === 'vie_scolaire' ? '<span class="tag err">Alerte vie scolaire</span>' : '<span class="tag att">Rappel au professeur</span>'}</td></tr>`).join('');
    const coursDe = id => V.cours.find(c => c.id === id);
    const sv = V.suivi.map(p => { const e = eleveParId(p.eleve_id), c = coursDe(p.cours_id); if (!e || !c) return '';
      const det = p.statut === 'retard' ? `${p.minutes_retard} min` : p.statut === 'sortie' ? `autorisé : ${esc(p.autorise_par || '—')} · récupéré par : ${esc(p.recupere_par || '—')}` : '';
      return `<tr><td>${p.heure_evenement ? heure(p.heure_evenement) : ''}</td><td>${esc(nomEleve(e))}</td><td>${esc(nomClasse(e.classe_id))}</td><td>${esc(nomMatiere(c.enseignements.matiere_id))}</td><td><strong>${LIBELLE[p.statut]}</strong> ${det}</td></tr>`; }).join('');
    return `${msg()}<div class="carte"><div class="barre"><h2 style="margin:0;flex:1">Appels non faits</h2><button class="b sec" id="v-rafraichir">Rafraîchir</button></div>
      ${man ? `<div class="tablewrap"><table><tr><th>Cours</th><th>Classe</th><th>Depuis</th><th>Niveau</th></tr>${man}</table></div>` : '<p class="doux">Aucun appel en retard.</p>'}
      <p class="petit">Rappel au professeur après le délai réglé (appel_delai_min), puis alerte vie scolaire un peu plus tard (appel_alerte_vs_min). Les notifications sur téléphone arriveront plus tard ; ici, la liste se rafraîchit à la demande.</p></div>
      <div class="carte"><h2>Absences, retards, sorties et dispenses du jour</h2>
      ${sv ? `<div class="tablewrap"><table><tr><th>Heure</th><th>Élève</th><th>Classe</th><th>Matière</th><th>Statut</th></tr>${sv}</table></div>` : '<p class="doux">Rien à signaler pour l’instant.</p>'}</div>`;
  }
  function liensSuivi() { const b = $('#v-rafraichir'); if (b) b.onclick = async () => { await chargerCours(); await chargerSuivi(); refaire(); }; }

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

  // ---------- Punitions et observations ----------
  async function chargerPun() {
    const [p, o] = await Promise.all([
      sb.from('punitions').select('*').order('created_at', { ascending: false }).limit(50),
      sb.from('observations').select('*').order('created_at', { ascending: false }).limit(30)]);
    V.punitions = p.data || []; V.obs = o.data || [];
  }
  const jourFr = iso => new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
  function vuePun() {
    const optsE = S.eleves.map(e => `<option value="${e.id}">${esc(nomEleve(e))} (${esc(nomClasse(e.classe_id))})</option>`).join('');
    const lp = V.punitions.map(p => { const e = eleveParId(p.eleve_id);
      return `<tr><td>${jourFr(p.created_at)}</td><td>${e ? esc(nomEleve(e)) : '—'}</td><td>${p.nature === 'sanction' ? '<span class="tag err">Sanction</span>' : 'Punition'} · ${esc(p.type)}${p.duree_heures ? ' · ' + String(Number(p.duree_heures)).replace('.', ',') + ' h' : ''}</td><td>${esc(p.motif)}</td><td>${p.echeance ? fr(p.echeance) : ''}</td>
      <td><select data-pst="${p.id}">${[['a_faire', 'À faire'], ['faite', 'Faite'], ['annulee', 'Annulée']].map(([k, l]) => `<option value="${k}" ${p.statut === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td></tr>`; }).join('');
    const lo = V.obs.map(o => { const e = eleveParId(o.eleve_id);
      return `<tr><td>${jourFr(o.created_at)}</td><td>${e ? esc(nomEleve(e)) : '—'}</td><td>${esc((TYPES_OBS.find(t => t[0] === o.type) || [])[1] || o.type)}</td><td>${esc(o.texte)}</td></tr>`; }).join('');
    return `${msg()}<div class="carte"><h2>Nouvelle punition ou sanction</h2><div class="barre">
      <select id="p-eleve" style="max-width:260px"><option value="">Élève…</option>${optsE}</select>
      <select id="p-nature"><option value="punition">Punition</option><option value="sanction">Sanction</option></select>
      <input id="p-type" placeholder="Type (retenue, devoir…)" list="p-types"><datalist id="p-types"><option>Devoir supplémentaire</option><option>Retenue</option><option>Avertissement</option><option>Exclusion de cours</option></datalist>
      <input id="p-duree" type="number" min="0.5" step="0.5" placeholder="Heures" style="width:90px;display:none" title="Nombre d'heures de retenue"><input id="p-motif" placeholder="Motif" style="flex:1;min-width:160px"><input id="p-ech" type="date"><button class="b" id="p-ajout">Ajouter</button></div></div>
      <div class="carte"><h2>Punitions et sanctions</h2>${lp ? `<div class="tablewrap"><table><tr><th>Date</th><th>Élève</th><th>Nature</th><th>Motif</th><th>Échéance</th><th>Statut</th></tr>${lp}</table></div>` : '<p class="doux">Aucune pour l’instant.</p>'}</div>
      <div class="carte"><h2>Dernières observations</h2>${lo ? `<div class="tablewrap"><table><tr><th>Date</th><th>Élève</th><th>Type</th><th>Observation</th></tr>${lo}</table></div>` : '<p class="doux">Aucune pour l’instant.</p>'}</div>`;
  }
  function liensPun() {
    const typeIn = $('#p-type'), dureeIn = $('#p-duree');
    const montrer = () => { dureeIn.style.display = /retenue/i.test(typeIn.value) ? '' : 'none'; };
    typeIn.oninput = montrer; typeIn.onchange = montrer; montrer();
    $('#p-ajout').onclick = async () => {
      const row = { eleve_id: $('#p-eleve').value, nature: $('#p-nature').value, type: $('#p-type').value.trim(), motif: $('#p-motif').value.trim(), echeance: $('#p-ech').value || null };
      if (!row.eleve_id || !row.type || !row.motif) { dire('err', 'Choisis un élève, un type et un motif.'); return refaire(); }
      if (/retenue/i.test(row.type)) {
        const h = parseFloat($('#p-duree').value.replace(',', '.'));
        if (!(h > 0)) { dire('err', 'Pour une retenue, indique le nombre d’heures.'); return refaire(); }
        row.duree_heures = h;
      }
      const r = await sb.from('punitions').insert(row); dire(r.error ? 'err' : 'ok', r.error ? r.error.message : 'Ajoutée.'); await chargerPun(); refaire();
    };
    document.querySelectorAll('[data-pst]').forEach(s => s.onchange = async () => { const r = await sb.from('punitions').update({ statut: s.value }).eq('id', s.dataset.pst); if (r.error) dire('err', r.error.message); await chargerPun(); refaire(); });
  }

  // ---------- Branchement ----------
  const LOAD = { appel: chargerCours, suivi: async () => { await chargerCours(); await chargerSuivi(); }, tel: chargerCoffre, pun: chargerPun };
  ONGLETS.unshift(['appel', 'Appel'], ['suivi', 'Suivi du jour'], ['tel', 'Téléphones'], ['pun', 'Punitions']);
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
      LOAD[k]().finally(() => { occupe = false; dessinerBase(); });
      return;
    }
    dessinerBase();
  };
  document.addEventListener('click', e => { const b = e.target.closest('#nav button'); if (b && LOAD[b.dataset.k]) V['pret_' + b.dataset.k] = false; }, true);
  window.__LC.V = V;
})();
