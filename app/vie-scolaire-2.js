// Luqmân Campus — étape 2 (compléments) : fiche élève, tableau de bord, incidents, infirmerie,
// calendrier (jours sans cours) et groupes. S'appuie sur window.LCVS (vie-scolaire.js).
(function () {
  const { V, LOAD, insererOnglet, aller } = window.LCVS;
  const { heure, jourParis, jourFr, nomEleve, eleveParId, estReseau, rpc, refaire, lienFiche, LIBELLE, TYPES_OBS, ECHELLE, TYPES_PREVUE, heuresTxt } = window.LCVS.outils;
  const W = { ficheId: null, fiche: null, recherche: '', selJustif: new Set(), periodes: [], du: null, au: null, stats: [], incidents: [], incEleves: [], nouveauxImpliques: [], passages: [], fermetures: [], groupes: [], membres: [], classeGrp: '', groupeOuvert: null };
  window.__LC.W = W;
  const opt = (v, l, sel) => `<option value="${v}" ${sel ? 'selected' : ''}>${esc(l)}</option>`;
  const optsEleves = (sel) => S.eleves.map(e => opt(e.id, `${nomEleve(e)} (${nomClasse(e.classe_id)})`, e.id === sel)).join('');
  const localISO = (d, h) => new Date(`${d}T${h || '00:00'}:00`).toISOString();
  const maintenantLocal = () => { const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
  const demiJournee = iso => jourParis(iso) + (heure(iso) < '12:30' ? 'M' : 'A');

  async function chargerPeriodes() {
    if (W.periodes.length) return;
    const r = await sb.from('periodes').select('id,libelle,debut,fin,annees_scolaires!inner(active)').eq('annees_scolaires.active', true).order('numero');
    W.periodes = r.data || [];
  }
  const periodeDe = iso => { const d = jourParis(iso); return W.periodes.find(p => d >= p.debut && d <= p.fin); };

  // ---------- Fiche élève ----------
  window.LCVS.ouvrirFiche = id => { W.ficheId = id; W.selJustif = new Set(); aller('fiche'); };
  async function chargerFiche() {
    await chargerPeriodes();
    if (!W.ficheId) { W.fiche = null; return; }
    const id = W.ficheId;
    const [p, o, u, t, i, f, a] = await Promise.all([
      sb.from('presences').select('id,statut,heure_evenement,minutes_retard,justifiee,justificatif_recu,motif,autorise_par,recupere_par,saisie_hors_ligne,cours(debut,enseignements(matiere_id))').eq('eleve_id', id).neq('statut', 'present'),
      sb.from('observations').select('*').eq('eleve_id', id).order('created_at', { ascending: false }),
      sb.from('punitions').select('*').eq('eleve_id', id).order('created_at', { ascending: false }),
      sb.from('coffre_telephone').select('*').eq('eleve_id', id).order('jour', { ascending: false }),
      sb.from('incident_eleves').select('role,incidents(id,survenu_a,lieu,description,statut,suites)').eq('eleve_id', id),
      sb.from('passages_infirmerie').select('*').eq('eleve_id', id).order('arrivee_a', { ascending: false }),
      sb.from('absences_prevues').select('*').eq('eleve_id', id).order('debut', { ascending: false })]);
    if (p.error) dire('err', estReseau(p.error) ? 'Pas de connexion : la fiche a besoin du réseau.' : p.error.message);
    W.fiche = { presences: (p.data || []).filter(x => x.cours).sort((x, y) => y.cours.debut.localeCompare(x.cours.debut)), obs: o.data || [], pun: u.data || [], tel: t.data || [],
      inc: (i.data || []).filter(x => x.incidents), inf: f.data || [], prevues: a.data || [], infirmerieVisible: !f.error };
  }
  function bilan(liste) {
    const abs = liste.filter(p => p.statut === 'absent');
    return { dj: new Set(abs.map(p => demiJournee(p.cours.debut))).size, djNJ: new Set(abs.filter(p => !p.justifiee).map(p => demiJournee(p.cours.debut))).size,
      heures: abs.length, retards: liste.filter(p => p.statut === 'retard').length, sorties: liste.filter(p => p.statut === 'sortie').length, dispenses: liste.filter(p => p.statut === 'dispense').length };
  }
  function vueFiche() {
    const choix = `<div class="barre"><select id="f-eleve" style="flex:1;max-width:360px"><option value="">Choisir un élève…</option>${optsEleves(W.ficheId)}</select></div>`;
    if (!W.ficheId || !W.fiche) return `${msg()}<div class="carte"><h2>Fiche élève</h2>${choix}<p class="doux">Tout le suivi d’un élève sur une page : absences, retards, sorties, observations, punitions, téléphones, incidents, infirmerie.</p></div>`;
    const e = eleveParId(W.ficheId), F = W.fiche;
    const groupes = W.periodes.length ? W.periodes.map(per => ({ l: per.libelle, items: F.presences.filter(p => periodeDe(p.cours.debut)?.id === per.id) })) : [{ l: 'Année', items: F.presences }];
    const tb = groupes.map(g => { const b = bilan(g.items); return `<tr><td>${esc(g.l)}</td><td>${b.dj}</td><td>${b.djNJ ? `<span class="tag err">${b.djNJ}</span>` : 0}</td><td>${b.heures}</td><td>${b.retards}</td><td>${b.sorties}</td><td>${b.dispenses}</td></tr>`; }).join('');
    const total = bilan(F.presences);
    const ev = F.presences.map(p => {
      const just = ['absent', 'retard'].includes(p.statut);
      return `<tr><td>${just && !p.justifiee ? `<input type="checkbox" data-sel="${p.id}" ${W.selJustif.has(p.id) ? 'checked' : ''}>` : ''}</td><td>${jourFr(p.cours.debut)} ${heure(p.cours.debut)}</td><td>${esc(nomMatiere(p.cours.enseignements?.matiere_id))}</td>
        <td><strong>${LIBELLE[p.statut]}</strong>${p.statut === 'retard' ? ' ' + p.minutes_retard + ' min' : ''}${p.statut === 'sortie' ? ` · ${esc(p.autorise_par || '—')} / ${esc(p.recupere_par || '—')}` : ''}</td>
        <td>${esc(p.motif || '')}</td><td>${just ? (p.justifiee ? `<span class="tag ok">Justifiée${p.justificatif_recu ? ' · justificatif' : ''}</span>` : '<span class="tag err">Non justifiée</span>') : ''}</td></tr>`; }).join('');
    const prev = F.prevues.map(a => `<tr><td>${jourFr(a.debut)} ${heure(a.debut)} → ${jourFr(a.fin)} ${heure(a.fin)}</td><td>${TYPES_PREVUE[a.type] || a.type}</td><td>${esc(a.motif)}${a.justificatif_recu ? ' <span class="tag ok">justificatif</span>' : ''}</td>
      <td>${a.annulee ? '<span class="tag">Annulée</span>' : `<button class="b danger" data-annprev="${a.id}">Annuler</button>`}</td></tr>`).join('');
    const obs = F.obs.map(o => `<tr><td>${jourFr(o.created_at)}</td><td>${esc((TYPES_OBS.find(t => t[0] === o.type) || [])[1] || o.type)}${o.confidentielle ? ' <span class="tag vio">Confidentielle</span>' : ''}</td><td>${esc(o.texte)}</td></tr>`).join('');
    const pun = F.pun.map(p => `<tr><td>${jourFr(p.created_at)}</td><td>${p.nature === 'sanction' ? '<span class="tag err">Sanction</span>' : 'Punition'} · ${esc(p.type)} ${heuresTxt(p.duree_heures)}</td><td>${esc(p.motif)}</td><td>${esc(p.statut)}</td></tr>`).join('');
    const tel = F.tel.filter(t => t.non_depose).length;
    const inc = F.inc.map(x => `<tr><td>${jourFr(x.incidents.survenu_a)}</td><td>${esc(x.role)}</td><td>${esc(x.incidents.description)}</td><td>${x.incidents.statut === 'traite' ? 'Traité' : 'Ouvert'}</td></tr>`).join('');
    const inf = F.inf.map(x => `<tr><td>${jourFr(x.arrivee_a)} ${heure(x.arrivee_a)}–${heure(x.depart_a)}</td><td>${esc(x.motif || '')}</td><td>${esc(SUITES[x.suite] || 'En cours')}${x.recupere_par ? ' · ' + esc(x.recupere_par) : ''}</td></tr>`).join('');
    const sanctions = F.pun.filter(p => p.nature === 'sanction').length;
    return `${msg()}<div class="carte"><h2>Fiche élève</h2>${choix}
      <h3 style="margin-top:6px">${esc(nomEleve(e))} · ${esc(nomClasse(e.classe_id))}</h3>
      <p class="doux">Demi-journées d’absence : <strong>${total.dj}</strong> (dont ${total.djNJ} non justifiées) · Retards : <strong>${total.retards}</strong> · Punitions : ${F.pun.length - sanctions} · Sanctions : ${sanctions} · Téléphones non déposés : ${tel}</p>
      <div class="tablewrap"><table><tr><th>Période</th><th>Demi-journées</th><th>Non justifiées</th><th>Heures manquées</th><th>Retards</th><th>Sorties</th><th>Dispenses</th></tr>${tb}</table></div></div>
      <div class="carte"><h2>Absences, retards, sorties</h2>
      ${ev ? `<div class="edit" style="margin-bottom:8px"><span class="petit">Cocher puis :</span><input id="f-jmotif" placeholder="Motif (maladie, transport…)" style="flex:1;min-width:150px"><label class="petit"><input type="checkbox" id="f-jrecu"> justificatif reçu</label><button class="b" id="f-justifier">Justifier la sélection</button></div>
        <div class="tablewrap"><table><tr><th></th><th>Cours</th><th>Matière</th><th>Statut</th><th>Motif</th><th>Justification</th></tr>${ev}</table></div>` : '<p class="doux">Rien depuis le début de l’année.</p>'}</div>
      <div class="carte"><h2>Absences prévues</h2><div class="barre">
        <select id="a-type">${Object.entries(TYPES_PREVUE).map(([k, l]) => opt(k, l)).join('')}</select>
        <label class="petit">Du <input type="datetime-local" id="a-debut"></label><label class="petit">au <input type="datetime-local" id="a-fin"></label>
        <input id="a-motif" placeholder="Motif" style="flex:1;min-width:140px"><label class="petit"><input type="checkbox" id="a-recu"> justificatif reçu</label><button class="b" id="a-ajout">Ajouter</button></div>
        <p class="petit">L’élève sera noté « absent justifié » automatiquement dans les appels de ces créneaux.</p>
        ${prev ? `<div class="tablewrap"><table><tr><th>Quand</th><th>Type</th><th>Motif</th><th></th></tr>${prev}</table></div>` : ''}</div>
      <div class="carte"><h2>Observations</h2>${obs ? `<div class="tablewrap"><table><tr><th>Date</th><th>Type</th><th>Observation</th></tr>${obs}</table></div>` : '<p class="doux">Aucune.</p>'}</div>
      <div class="carte"><h2>Punitions et sanctions</h2>${pun ? `<div class="tablewrap"><table><tr><th>Date</th><th>Nature</th><th>Motif</th><th>Statut</th></tr>${pun}</table></div>` : '<p class="doux">Aucune.</p>'}</div>
      <div class="carte"><h2>Incidents</h2>${inc ? `<div class="tablewrap"><table><tr><th>Date</th><th>Rôle</th><th>Description</th><th>Statut</th></tr>${inc}</table></div>` : '<p class="doux">Aucun.</p>'}</div>
      ${F.infirmerieVisible ? `<div class="carte"><h2>Passages à l’infirmerie</h2>${inf ? `<div class="tablewrap"><table><tr><th>Quand</th><th>Motif</th><th>Suite</th></tr>${inf}</table></div>` : '<p class="doux">Aucun.</p>'}</div>` : ''}`;
  }
  function liensFiche() {
    const s = $('#f-eleve'); if (s) s.onchange = () => window.LCVS.ouvrirFiche(s.value || null);
    document.querySelectorAll('[data-sel]').forEach(c => c.onchange = () => { c.checked ? W.selJustif.add(c.dataset.sel) : W.selJustif.delete(c.dataset.sel); });
    const j = $('#f-justifier'); if (j) j.onclick = async () => {
      if (!W.selJustif.size) { dire('err', 'Coche au moins une absence ou un retard.'); return refaire(); }
      const r = await rpc('justifier_absences', { p_presences: [...W.selJustif], p_justifiee: true, p_motif: $('#f-jmotif').value, p_justificatif: $('#f-jrecu').checked });
      if (!r.error) { dire('ok', `${r.data} absence(s) ou retard(s) justifié(s).`); W.selJustif = new Set(); }
      await chargerFiche(); refaire();
    };
    const a = $('#a-ajout'); if (a) a.onclick = async () => {
      const d = $('#a-debut').value, f = $('#a-fin').value, m = $('#a-motif').value.trim();
      if (!d || !f || !m) { dire('err', 'Indique le début, la fin et le motif.'); return refaire(); }
      const r = await sb.from('absences_prevues').insert({ eleve_id: W.ficheId, type: $('#a-type').value, debut: new Date(d).toISOString(), fin: new Date(f).toISOString(), motif: m, justificatif_recu: $('#a-recu').checked });
      dire(r.error ? 'err' : 'ok', r.error ? r.error.message : 'Absence prévue enregistrée.'); await chargerFiche(); refaire();
    };
    document.querySelectorAll('[data-annprev]').forEach(b => b.onclick = async () => { const r = await sb.from('absences_prevues').update({ annulee: true }).eq('id', b.dataset.annprev); if (r.error) dire('err', r.error.message); await chargerFiche(); refaire(); });
  }

  // ---------- Tableau de bord ----------
  async function chargerTdb() {
    await chargerPeriodes();
    if (!W.du) { const p = W.periodes.find(x => jourParis(new Date()) >= x.debut && jourParis(new Date()) <= x.fin); W.du = p ? p.debut : jourParis(Date.now() - 30 * 86400000); W.au = jourParis(new Date()); }
    const [s, w] = await Promise.all([sb.rpc('stats_absenteisme', { p_debut: W.du, p_fin: W.au }), sb.rpc('eleves_a_surveiller')]);
    W.stats = s.data || []; V.surveiller = w.data || [];
    if (s.error) dire('err', estReseau(s.error) ? 'Pas de connexion.' : s.error.message);
  }
  function vueTdb() {
    const st = W.stats.map(x => `<tr><td>${esc(x.classe)}</td><td>${x.saisies}</td><td>${x.absences}</td><td>${x.non_justifiees ? `<span class="tag err">${x.non_justifiees}</span>` : 0}</td><td>${x.retards}</td><td><strong>${x.taux_absence == null ? '—' : String(x.taux_absence).replace('.', ',') + ' %'}</strong></td></tr>`).join('');
    const ws = V.surveiller.map(w => { const e = eleveParId(w.eleve_id); if (!e) return '';
      return `<tr><td><button class="lien" data-fiche="${e.id}">${esc(nomEleve(e))}</button></td><td>${esc(nomClasse(e.classe_id))}</td><td>${w.retards_periode}</td><td>${w.demi_journees_mois}</td><td>${w.non_depots}</td><td>${w.motifs.map(m => `<span class="tag err">${{ retards: 'Retards', absences: 'Absences', telephone: 'Téléphone' }[m]}</span>`).join('')}</td></tr>`; }).join('');
    return `${msg()}<div class="carte"><h2>Absentéisme par classe</h2><div class="barre"><label class="petit">Du <input type="date" id="t-du" value="${W.du}"></label><label class="petit">au <input type="date" id="t-au" value="${W.au}"></label>
      <button class="b sec" id="t-ok">Actualiser</button><button class="b" id="t-export">Exporter le relevé (CSV)</button></div>
      ${st ? `<div class="tablewrap"><table><tr><th>Classe</th><th>Présences saisies</th><th>Absences (cours)</th><th>Non justifiées</th><th>Retards</th><th>Taux d’absence</th></tr>${st}</table></div>` : '<p class="doux">Aucune donnée sur cette période.</p>'}
      <p class="petit">Taux = absences / présences saisies, cours annulés exclus.</p></div>
      <div class="carte"><h2>Élèves à surveiller</h2>${ws ? `<div class="tablewrap"><table><tr><th>Élève</th><th>Classe</th><th>Retards (période)</th><th>Demi-journées non justifiées (mois)</th><th>Téléphones non déposés</th><th>Seuils</th></tr>${ws}</table></div>` : '<p class="doux">Aucun seuil atteint.</p>'}
      <p class="petit">Seuils réglables : retards dans la période, demi-journées d’absence non justifiées dans le mois (4 par défaut), non-dépôts de téléphone.</p></div>`;
  }
  function liensTdb() {
    lienFiche();
    $('#t-ok').onclick = async () => { W.du = $('#t-du').value; W.au = $('#t-au').value; S.message = null; await chargerTdb(); refaire(); };
    $('#t-export').onclick = async () => {
      const r = await sb.from('presences').select('statut,heure_evenement,minutes_retard,justifiee,justificatif_recu,motif,autorise_par,recupere_par,eleve_id,cours!inner(debut,enseignements(classe_id,matiere_id))')
        .neq('statut', 'present').gte('cours.debut', localISO($('#t-du').value)).lt('cours.debut', localISO(jourParis(new Date($('#t-au').value + 'T12:00:00').getTime() + 86400000)));
      if (r.error) { dire('err', r.error.message); return refaire(); }
      const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lignes = [['Date', 'Heure du cours', 'Classe', 'Élève', 'Matière', 'Statut', 'Minutes de retard', 'Justifiée', 'Justificatif reçu', 'Motif', 'Autorisé par', 'Récupéré par']]
        .concat(r.data.sort((a, b) => a.cours.debut.localeCompare(b.cours.debut)).map(p => { const e = eleveParId(p.eleve_id) || { nom: '?', prenom: '' };
          return [jourFr(p.cours.debut), heure(p.cours.debut), nomClasse(p.cours.enseignements?.classe_id), nomEleve(e), nomMatiere(p.cours.enseignements?.matiere_id), LIBELLE[p.statut], p.minutes_retard ?? '', p.justifiee ? 'oui' : 'non', p.justificatif_recu ? 'oui' : 'non', p.motif, p.autorise_par, p.recupere_par]; }));
      const blob = new Blob(['﻿' + lignes.map(l => l.map(q).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `releve-absences-${$('#t-du').value}-${$('#t-au').value}.csv`; a.click();
      dire('ok', `${r.data.length} ligne(s) exportée(s).`); refaire();
    };
  }

  // ---------- Incidents ----------
  async function chargerIncidents() {
    const [i, e] = await Promise.all([sb.from('incidents').select('*').order('survenu_a', { ascending: false }).limit(50), sb.from('incident_eleves').select('*')]);
    W.incidents = i.data || []; W.incEleves = e.data || [];
    if (i.error) dire('err', estReseau(i.error) ? 'Pas de connexion.' : i.error.message);
  }
  const ROLES = { auteur: 'Auteur', victime: 'Victime', temoin: 'Témoin' };
  function vueIncidents() {
    const imp = W.nouveauxImpliques.map((x, i) => `<span class="tag">${esc(nomEleve(eleveParId(x.eleve_id)))} · ${ROLES[x.role]} <button class="lien" data-retirer="${i}">×</button></span>`).join('');
    const liste = W.incidents.map(inc => {
      const el = W.incEleves.filter(x => x.incident_id === inc.id);
      const auteurs = el.filter(x => x.role === 'auteur');
      return `<div class="carte" style="margin:10px 0 0"><div class="barre"><strong style="flex:1">${jourFr(inc.survenu_a)} ${heure(inc.survenu_a)}${inc.lieu ? ' · ' + esc(inc.lieu) : ''}</strong>
        <span class="tag ${inc.statut === 'traite' ? 'ok' : 'att'}">${inc.statut === 'traite' ? 'Traité' : 'Ouvert'}</span></div>
        <p>${esc(inc.description)}</p><p>${el.map(x => { const e = eleveParId(x.eleve_id); return e ? `<span class="tag">${esc(nomEleve(e))} · ${ROLES[x.role]}</span>` : ''; }).join('')}</p>
        <div class="edit"><textarea data-suites="${inc.id}" placeholder="Suites données (appel aux familles, réunion…)" style="min-height:60px">${esc(inc.suites || '')}</textarea>
          <button class="b sec" data-sauver="${inc.id}">Enregistrer</button><button class="b sec" data-statut-inc="${inc.id}">${inc.statut === 'traite' ? 'Rouvrir' : 'Marquer traité'}</button></div>
        ${auteurs.length ? `<div class="edit"><span class="petit">Sanction (direction) :</span><select data-sanc-eleve="${inc.id}">${auteurs.map(x => opt(x.eleve_id, nomEleve(eleveParId(x.eleve_id) || { nom: '?', prenom: '' }))).join('')}</select>
          <select data-sanc-type="${inc.id}">${ECHELLE.map(x => opt(x, x)).join('')}</select><button class="b danger" data-sanctionner="${inc.id}">Prononcer</button></div>` : ''}</div>`;
    }).join('');
    return `${msg()}<div class="carte"><h2>Nouveau rapport d’incident</h2><div class="barre"><label class="petit">Quand <input type="datetime-local" id="i-quand" value="${maintenantLocal()}"></label><input id="i-lieu" placeholder="Lieu (cour, couloir…)"></div>
      <textarea id="i-desc" placeholder="Description des faits" style="min-height:80px"></textarea>
      <div class="barre" style="margin-top:8px"><select id="i-eleve" style="max-width:260px"><option value="">Élève impliqué…</option>${optsEleves()}</select><select id="i-role">${Object.entries(ROLES).map(([k, l]) => opt(k, l)).join('')}</select><button class="b sec" id="i-plus">Ajouter l’élève</button></div>
      <p>${imp || '<span class="petit">Aucun élève ajouté.</span>'}</p><button class="b" id="i-ok">Enregistrer le rapport</button>
      <p class="petit">Un rapport est visible par son auteur et par la vie scolaire / direction.</p></div>
      <div class="carte"><h2>Incidents</h2>${liste || '<p class="doux">Aucun incident.</p>'}</div>`;
  }
  function liensIncidents() {
    $('#i-plus').onclick = () => { const id = $('#i-eleve').value; if (!id) return; W.nouveauxImpliques = W.nouveauxImpliques.filter(x => x.eleve_id !== id).concat([{ eleve_id: id, role: $('#i-role').value }]); W.brouillon = { q: $('#i-quand').value, l: $('#i-lieu').value, d: $('#i-desc').value }; refaire(); };
    if (W.brouillon) { $('#i-quand').value = W.brouillon.q; $('#i-lieu').value = W.brouillon.l; $('#i-desc').value = W.brouillon.d; }
    document.querySelectorAll('[data-retirer]').forEach(b => b.onclick = () => { W.nouveauxImpliques.splice(+b.dataset.retirer, 1); W.brouillon = { q: $('#i-quand').value, l: $('#i-lieu').value, d: $('#i-desc').value }; refaire(); });
    $('#i-ok').onclick = async () => {
      const desc = $('#i-desc').value.trim(); if (!desc) { dire('err', 'Décris les faits.'); return refaire(); }
      const id = crypto.randomUUID();
      const r = await sb.from('incidents').insert({ id, survenu_a: new Date($('#i-quand').value).toISOString(), lieu: $('#i-lieu').value.trim() || null, description: desc });
      if (r.error) { dire('err', r.error.message); return refaire(); }
      if (W.nouveauxImpliques.length) { const e = await sb.from('incident_eleves').insert(W.nouveauxImpliques.map(x => ({ incident_id: id, ...x }))); if (e.error) dire('err', e.error.message); else dire('ok', 'Rapport enregistré.'); }
      else dire('ok', 'Rapport enregistré.');
      W.nouveauxImpliques = []; W.brouillon = null; await chargerIncidents(); refaire();
    };
    document.querySelectorAll('[data-sauver]').forEach(b => b.onclick = async () => { const r = await sb.from('incidents').update({ suites: document.querySelector(`[data-suites="${b.dataset.sauver}"]`).value }).eq('id', b.dataset.sauver); dire(r.error ? 'err' : 'ok', r.error ? r.error.message : 'Suites enregistrées.'); await chargerIncidents(); refaire(); });
    document.querySelectorAll('[data-statut-inc]').forEach(b => b.onclick = async () => { const inc = W.incidents.find(x => x.id === b.dataset.statutInc); const r = await sb.from('incidents').update({ statut: inc.statut === 'traite' ? 'ouvert' : 'traite' }).eq('id', inc.id); if (r.error) dire('err', r.error.message); await chargerIncidents(); refaire(); });
    document.querySelectorAll('[data-sanctionner]').forEach(b => b.onclick = async () => {
      const inc = W.incidents.find(x => x.id === b.dataset.sanctionner);
      const r = await sb.from('punitions').insert({ eleve_id: document.querySelector(`[data-sanc-eleve="${inc.id}"]`).value, nature: 'sanction', type: document.querySelector(`[data-sanc-type="${inc.id}"]`).value, motif: inc.description.slice(0, 200), incident_id: inc.id });
      dire(r.error ? 'err' : 'ok', r.error ? r.error.message : 'Sanction enregistrée (visible dans Punitions et dans la fiche élève).'); refaire();
    });
  }

  // ---------- Infirmerie ----------
  const SUITES = { retour_classe: 'Retour en classe', famille_prevenue: 'Famille prévenue', recupere_famille: 'Récupéré par la famille', urgence: 'Urgence (15 / 112)' };
  async function chargerInfirmerie() {
    const j = jourParis(new Date());
    const r = await sb.from('passages_infirmerie').select('*').or(`depart_a.is.null,arrivee_a.gte.${new Date(j + 'T00:00:00').toISOString()}`).order('arrivee_a', { ascending: false });
    W.passages = r.data || []; W.infErreur = r.error ? r.error.message : null;
  }
  function vueInfirmerie() {
    const enCours = W.passages.filter(p => !p.depart_a), finis = W.passages.filter(p => p.depart_a);
    const lc = enCours.map(p => { const e = eleveParId(p.eleve_id); return `<div class="eleve"><div class="n">${e ? `<button class="lien" data-fiche="${e.id}">${esc(nomEleve(e))}</button> · ${esc(nomClasse(e.classe_id))}` : '—'}<br><span class="petit">Arrivé à ${heure(p.arrivee_a)}${p.motif ? ' · ' + esc(p.motif) : ''}</span></div>
      <div class="sts"><select data-suite="${p.id}">${Object.entries(SUITES).map(([k, l]) => opt(k, l)).join('')}</select><input data-recup="${p.id}" placeholder="Récupéré par" style="width:130px"><button class="b" data-depart="${p.id}">Départ</button></div></div>`; }).join('');
    const lf = finis.map(p => { const e = eleveParId(p.eleve_id); return `<tr><td>${heure(p.arrivee_a)}–${heure(p.depart_a)}</td><td>${e ? esc(nomEleve(e)) : '—'}</td><td>${esc(p.motif || '')}</td><td>${esc(SUITES[p.suite] || '')}${p.recupere_par ? ' · ' + esc(p.recupere_par) : ''}</td></tr>`; }).join('');
    return `${msg()}<div class="carte"><h2>Envoyer à l’infirmerie</h2><div class="barre"><select id="n-eleve" style="max-width:280px"><option value="">Élève…</option>${optsEleves()}</select><input id="n-motif" placeholder="Motif court (mal de ventre, chute…)" style="flex:1;min-width:160px"><button class="b" id="n-ok">Arrivée</button></div>
      <p class="petit">Heure d’arrivée et de départ : celles du serveur. Si l’élève est récupéré par sa famille, il est noté « sorti » dans le cours en cours. Le registre n’est visible que par la vie scolaire et la direction.</p></div>
      ${W.infErreur ? `<div class="msg info">Registre réservé à la vie scolaire et à la direction.</div>` : `<div class="carte"><h2>À l’infirmerie maintenant</h2>${lc || '<p class="doux">Personne.</p>'}</div>
      <div class="carte"><h2>Passages du jour</h2>${lf ? `<div class="tablewrap"><table><tr><th>Horaire</th><th>Élève</th><th>Motif</th><th>Suite</th></tr>${lf}</table></div>` : '<p class="doux">Aucun.</p>'}</div>`}`;
  }
  function liensInfirmerie() {
    lienFiche();
    $('#n-ok').onclick = async () => {
      const id = $('#n-eleve').value; if (!id) { dire('err', 'Choisis un élève.'); return refaire(); }
      const e = eleveParId(id), maintenant = new Date();
      const c = V.cours.find(x => x.enseignements.classe_id === e.classe_id && new Date(x.debut) <= maintenant && new Date(x.fin) > maintenant && !x.annule);
      const r = await sb.from('passages_infirmerie').insert({ eleve_id: id, motif: $('#n-motif').value.trim() || null, cours_id: c ? c.id : null });
      dire(r.error ? 'err' : 'ok', r.error ? r.error.message : 'Arrivée enregistrée.'); await chargerInfirmerie(); refaire();
    };
    document.querySelectorAll('[data-depart]').forEach(b => b.onclick = async () => {
      const id = b.dataset.depart;
      const r = await rpc('infirmerie_depart', { p_passage: id, p_suite: document.querySelector(`[data-suite="${id}"]`).value, p_recupere_par: document.querySelector(`[data-recup="${id}"]`).value });
      if (!r.error) dire('ok', 'Départ enregistré.'); await chargerInfirmerie(); refaire();
    });
  }

  // ---------- Calendrier ----------
  async function chargerFermetures() { const r = await sb.from('fermetures').select('*').order('debut'); W.fermetures = r.data || []; if (r.error) dire('err', r.error.message); }
  function vueCalendrier() {
    const l = W.fermetures.map(f => `<tr><td>${fr(f.debut)}${f.fin !== f.debut ? ' → ' + fr(f.fin) : ''}</td><td>${esc(f.motif)}</td><td><button class="b danger" data-suppr-f="${f.id}">Supprimer</button></td></tr>`).join('');
    return `${msg()}<div class="carte"><h2>Jours sans cours</h2><div class="barre"><label class="petit">Du <input type="date" id="c-du"></label><label class="petit">au <input type="date" id="c-au"></label>
      <input id="c-motif" placeholder="Motif (vacances, férié, pont…)" style="flex:1;min-width:160px"><button class="b" id="c-ok">Ajouter</button></div>
      <p class="petit">Ces jours-là, aucun appel n’est réclamé. L’emploi du temps (étape 6) ne générera pas de cours. Saint-Étienne : académie de Lyon, zone A.</p>
      ${l ? `<div class="tablewrap"><table><tr><th>Dates</th><th>Motif</th><th></th></tr>${l}</table></div>` : '<p class="doux">Aucune date saisie.</p>'}</div>`;
  }
  function liensCalendrier() {
    $('#c-ok').onclick = async () => {
      const d = $('#c-du').value, f = $('#c-au').value || d, m = $('#c-motif').value.trim();
      if (!d || !m) { dire('err', 'Indique au moins la date de début et le motif.'); return refaire(); }
      const r = await sb.from('fermetures').insert({ debut: d, fin: f, motif: m }); dire(r.error ? 'err' : 'ok', r.error ? r.error.message : 'Ajouté.'); await chargerFermetures(); refaire();
    };
    document.querySelectorAll('[data-suppr-f]').forEach(b => b.onclick = async () => { const r = await sb.from('fermetures').delete().eq('id', b.dataset.supprF); if (r.error) dire('err', r.error.message); await chargerFermetures(); refaire(); });
  }

  // ---------- Groupes ----------
  async function chargerGroupes() {
    const [g, m] = await Promise.all([sb.from('groupes').select('*').order('nom'), sb.from('groupe_eleves').select('*')]);
    W.groupes = g.data || []; W.membres = m.data || [];
    if (g.error) dire('err', g.error.message);
  }
  function vueGroupes() {
    const opts = S.classes.map(c => opt(c.id, c.nom, W.classeGrp === c.id)).join('');
    const gs = W.groupes.filter(g => g.classe_id === W.classeGrp);
    const eleves = S.eleves.filter(e => e.classe_id === W.classeGrp);
    const liste = gs.map(g => {
      const ids = new Set(W.membres.filter(m => m.groupe_id === g.id).map(m => m.eleve_id));
      const detail = W.groupeOuvert === g.id ? `<div class="edit">${eleves.map(e => `<label style="min-width:180px"><input type="checkbox" data-membre="${e.id}" data-g="${g.id}" ${ids.has(e.id) ? 'checked' : ''}> ${esc(nomEleve(e))}</label>`).join('')}</div>` : '';
      return `<div class="cours"><div class="q"><strong>${esc(g.nom)}</strong> <span class="petit">${ids.size} élève(s)</span></div><button class="b sec" data-ouvrir-g="${g.id}">${W.groupeOuvert === g.id ? 'Fermer' : 'Élèves'}</button><button class="b danger" data-suppr-g="${g.id}">Supprimer</button></div>${detail}`;
    }).join('');
    return `${msg()}<div class="carte"><h2>Groupes (demi-groupes, langues, EPS)</h2><div class="barre"><select id="g-classe"><option value="">Choisir une classe…</option>${opts}</select>
      ${W.classeGrp ? `<input id="g-nom" placeholder="Nom du groupe (ex. Groupe 1)"><button class="b" id="g-ok">Créer</button>` : ''}</div>
      ${W.classeGrp ? (liste || '<p class="doux">Aucun groupe pour cette classe.</p>') : ''}
      <p class="petit">Un cours affecté à un groupe (bouton ⋯ dans Appel) n’affiche que ses élèves à l’appel.</p></div>`;
  }
  function liensGroupes() {
    const s = $('#g-classe'); s.onchange = () => { W.classeGrp = s.value; W.groupeOuvert = null; refaire(); };
    const ok = $('#g-ok'); if (ok) ok.onclick = async () => { const nom = $('#g-nom').value.trim(); if (!nom) return; const r = await sb.from('groupes').insert({ classe_id: W.classeGrp, nom }); dire(r.error ? 'err' : 'ok', r.error ? r.error.message : 'Groupe créé.'); await chargerGroupes(); refaire(); };
    document.querySelectorAll('[data-ouvrir-g]').forEach(b => b.onclick = () => { W.groupeOuvert = W.groupeOuvert === b.dataset.ouvrirG ? null : b.dataset.ouvrirG; refaire(); });
    document.querySelectorAll('[data-suppr-g]').forEach(b => b.onclick = async () => { const r = await sb.from('groupes').delete().eq('id', b.dataset.supprG); if (r.error) dire('err', r.error.message); await chargerGroupes(); refaire(); });
    document.querySelectorAll('[data-membre]').forEach(c => c.onchange = async () => {
      const r = c.checked ? await sb.from('groupe_eleves').insert({ groupe_id: c.dataset.g, eleve_id: c.dataset.membre })
        : await sb.from('groupe_eleves').delete().eq('groupe_id', c.dataset.g).eq('eleve_id', c.dataset.membre);
      if (r.error) dire('err', r.error.message); await chargerGroupes(); refaire();
    });
  }

  // ---------- Branchement ----------
  insererOnglet('fiche', 'Fiche élève', 'suivi');
  insererOnglet('incidents', 'Incidents', 'pun');
  insererOnglet('infirmerie', 'Infirmerie', 'tel');
  insererOnglet('tdb', 'Tableau de bord', 'infirmerie');
  insererOnglet('groupes', 'Groupes', 'classes');
  insererOnglet('calendrier', 'Calendrier', 'groupes');
  Object.assign(VUES, { fiche: vueFiche, tdb: vueTdb, incidents: vueIncidents, infirmerie: vueInfirmerie, calendrier: vueCalendrier, groupes: vueGroupes });
  Object.assign(LIENS, { fiche: liensFiche, tdb: liensTdb, incidents: liensIncidents, infirmerie: liensInfirmerie, calendrier: liensCalendrier, groupes: liensGroupes });
  Object.assign(LOAD, { fiche: chargerFiche, tdb: chargerTdb, incidents: chargerIncidents, infirmerie: async () => { if (!V.cours.length) await window.LCVS.outils.chargerCours(); await chargerInfirmerie(); }, calendrier: chargerFermetures, groupes: chargerGroupes });
})();
