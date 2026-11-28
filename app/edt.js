// Luqmân Campus — étape 6 : emploi du temps.
// Grille (par classe, professeur ou salle ; déplacer une séance d'un clic sur une case verte ; verrouiller),
// Générer (diagnostic, générateur dans un Web Worker, enregistrement en version), Contraintes (heures et séances,
// indisponibilités obligatoires / préférences, salles, grille horaire), Publier (crée les cours de l'année → appel).
// La base revérifie toutes les contraintes obligatoires (controler_edt) : rien d'incohérent ne peut être enregistré.
(function () {
  const { LOAD, insererOnglet } = window.LCVS;
  const { refaire, estReseau } = window.LCVS.outils;
  const O = window.LCVS.notesOutils, N = O.N, { opt } = O;
  const E = { sub: 'grille', D: null, err: '', versionId: '', vue: 'classe', cibleId: '', sel: '', libres: [], conflits: [], gen: { enCours: false, progres: null, res: null, nom: '', duree: 8000, garder: true },
    regleCible: 'professeur', confirmer: '' };
  window.__LC.E = E;
  const JOURS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

  const css = document.createElement('style');
  css.textContent = `
    .edt-grille { border-collapse:separate; border-spacing:3px; table-layout:fixed; min-width:640px; }
    .edt-grille th { text-align:center; } .edt-grille td { border:0; padding:0; height:46px; vertical-align:stretch; }
    .edt-grille td.h { width:62px; font-size:11px; color:var(--doux); text-align:right; padding-right:4px; vertical-align:middle; white-space:nowrap; }
    .edt-grille td.vide { background:#f6f1e7; border-radius:8px; } .edt-grille td.hors { background:repeating-linear-gradient(45deg,#eee7d6,#eee7d6 4px,#f6f1e7 4px,#f6f1e7 8px); border-radius:8px; }
    .edt-grille td.libre { background:#d7f2e2; outline:2px dashed var(--ok); outline-offset:-2px; cursor:pointer; border-radius:8px; }
    .edt-s { height:100%; border-radius:8px; padding:4px 6px; font-size:12px; line-height:1.2; cursor:pointer; color:#10231f; overflow:hidden; border-left:4px solid rgba(0,0,0,.25); }
    .edt-s b { display:block; font-size:12.5px; } .edt-s small { display:block; color:#33463f; } .edt-s.sel { outline:3px solid var(--or); }
    .edt-panneau { background:#faf7ef; border:1px solid var(--filet); border-radius:12px; padding:12px; margin-top:10px; }
    .edt-prog { height:10px; background:#eee7d6; border-radius:5px; overflow:hidden; } .edt-prog i { display:block; height:100%; background:var(--sarcelle); transition:width .3s; }
    .edt-diag li.grave { color:var(--rouge); font-weight:700; }
    td.edt-c select, td.edt-c input { padding:5px 6px; font-size:13px; } td.edt-c input[type=number] { width:64px; }
  `;
  document.head.appendChild(css);

  // ---------- Outils ----------
  const estAdm = () => !!N.droits.admin;
  const D = () => E.D;
  const V = () => (D() && D().versions.find(v => v.id === E.versionId)) || null;
  const ens = id => D().enseignements.find(e => e.id === id);
  const nomMat = id => (D().matieres.find(m => m.id === id) || {}).nom || '';
  const nomCl = id => (D().classes.find(c => c.id === id) || {}).nom || '';
  const nomProf = id => (D().professeurs.find(p => p.id === id) || {}).nom || '';
  const nomSalle = id => (D().salles.find(s => s.id === id) || {}).nom || '';
  const nomGroupe = id => (D().groupes.find(g => g.id === id) || {}).nom || '';
  const teinte = id => { const i = Math.max(0, D().matieres.findIndex(m => m.id === id)); return `hsl(${Math.round(i * 137.5) % 360} 62% 85%)`; };  // angle d'or : couleurs bien distinctes
  const creneauxTries = () => [...D().creneaux].sort((a, b) => a.jour - b.jour || a.debut.localeCompare(b.debut));
  const dureeSeance = s => s.duree || (ens(s.enseignement_id) || {}).bloc || 1;
  const cibleDe = s => { const e = ens(s.enseignement_id); if (!e) return null; return E.vue === 'classe' ? e.classe_id : E.vue === 'prof' ? e.professeur_id : (s.salle_id || e.salle_id); };
  const listeCibles = () => E.vue === 'classe' ? D().classes.map(c => [c.id, c.nom]) : E.vue === 'prof' ? D().professeurs.map(p => [p.id, p.nom]) : D().salles.map(s => [s.id, s.nom]);
  const erreur = e => estReseau(e) ? 'Pas de connexion : l’emploi du temps a besoin du réseau.' : (e.message || String(e)).replace(/^Conflit : |^Impossible : /, '');

  // ---------- Chargement ----------
  async function chargerEdt() {
    E.err = ''; await O.chargerBase();
    const r = await sb.rpc('edt_donnees', {});
    if (r.error) { E.err = /edt_donnees|function/.test(r.error.message) ? 'L’emploi du temps n’est pas encore installé (migration 0016).' : erreur(r.error); E.D = null; return; }
    E.D = r.data;
    if (!E.D.versions.some(v => v.id === E.versionId)) E.versionId = ((E.D.versions.find(v => v.statut === 'publie') || E.D.versions[0]) || {}).id || '';
    if (!listeCibles().some(([id]) => id === E.cibleId)) E.cibleId = (listeCibles()[0] || [])[0] || '';
    if (E.sel && !(V() && V().seances.some(s => s.id === E.sel))) { E.sel = ''; E.libres = []; }
    E.conflits = [];
    if (V() && E.sub === 'grille') { const c = await sb.rpc('controler_edt', { p_version: E.versionId }); if (!c.error) E.conflits = c.data || []; }
  }
  const recharger = async () => { try { await chargerEdt(); } catch (e) { dire('err', String(e.message || e)); } refaire(); };

  // ---------- Grille d'une semaine ----------
  function htmlGrille(seances, cible, cliquable) {
    const cr = creneauxTries(), jours = [...new Set(cr.map(c => c.jour))].sort(), heures = [...new Set(cr.map(c => c.debut + '|' + c.fin))].sort();
    const parCreneau = new Map(); const couvert = new Set();
    seances.filter(s => cibleDe(s) === cible).forEach(s => { const c0 = cr.find(c => c.id === s.creneau_id); if (!c0) return; parCreneau.set(c0.id, s);
      const duJour = cr.filter(c => c.jour === c0.jour), i = duJour.indexOf(c0); for (let k = 1; k < dureeSeance(s); k++) if (duJour[i + k]) couvert.add(duJour[i + k].id); });
    const ligne = h => { const [d, f] = h.split('|');
      return `<tr><td class="h">${d}<br>${f}</td>${jours.map(j => { const c = cr.find(x => x.jour === j && x.debut === d); if (!c) return '<td class="hors"></td>'; if (couvert.has(c.id)) return '';
        const s = parCreneau.get(c.id);
        if (!s) return `<td class="${cliquable && E.libres.includes(c.id) ? 'libre' : 'vide'}" ${cliquable && E.libres.includes(c.id) ? `data-vers="${c.id}" title="Déplacer ici"` : ''}></td>`;
        const e = ens(s.enseignement_id), L = dureeSeance(s), autre = E.vue === 'classe' ? nomProf(e.professeur_id) : nomCl(e.classe_id);
        return `<td rowspan="${L}"><div class="edt-s ${E.sel === s.id ? 'sel' : ''}" ${cliquable ? `data-seance="${s.id}"` : ''} style="background:${teinte(e.matiere_id)}">
          <b>${s.verrouillee ? '🔒 ' : ''}${esc(nomMat(e.matiere_id))}</b><small>${esc(autre || '')}${e.groupe_id ? ' · ' + esc(nomGroupe(e.groupe_id)) : ''}</small>${(s.salle_id || e.salle_id) && E.vue !== 'salle' ? `<small>${esc(nomSalle(s.salle_id || e.salle_id))}</small>` : ''}</div></td>`; }).join('')}</tr>`; };
    return `<div class="tablewrap"><table class="edt-grille"><thead><tr><th></th>${jours.map(j => `<th>${JOURS[j]}</th>`).join('')}</tr></thead><tbody>${heures.map(ligne).join('')}</tbody></table></div>`;
  }

  // ---------- Vues ----------
  function vueEdt() {
    const onglets = [['grille', 'Grille'], ...(estAdm() ? [['generer', 'Générer'], ['contraintes', 'Contraintes'], ['publier', 'Publier']] : [])];
    const nav = `<div class="sousnav">${onglets.map(([k, l]) => `<button data-esub="${k}" class="${E.sub === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    if (E.err) return `${msg()}<div class="carte"><h2>Emploi du temps</h2>${nav}<div class="msg err">${esc(E.err)}</div></div>`;
    if (!D()) return `${msg()}<div class="carte"><h2>Emploi du temps</h2>${nav}<p class="doux">Chargement…</p></div>`;
    const corps = E.sub === 'generer' && estAdm() ? vueGenerer() : E.sub === 'contraintes' && estAdm() ? vueContraintes() : E.sub === 'publier' && estAdm() ? vuePublier() : vueGrille();
    return `${msg()}<div class="carte"><h2>Emploi du temps ${D().annee ? `<span class="doux">${esc(D().annee.libelle)}</span>` : ''}</h2>${nav}${corps}</div>`;
  }
  const selVersion = () => `<select id="e-version">${D().versions.map(v => opt(v.id, v.nom + (v.statut === 'publie' ? ' ✓ publiée' : ''), v.id === E.versionId)).join('') || opt('', 'Aucune version')}</select>`;
  function vueGrille() {
    if (!D().versions.length) return `<p>Aucun emploi du temps pour l’instant.</p>${estAdm() ? '<p class="doux">Renseigne les heures dans « Contraintes », puis lance « Générer ».</p>' : ''}`;
    const v = V(), sel = v && v.seances.find(s => s.id === E.sel), ev = window.EDTSolveur && v ? window.EDTSolveur.evaluer(D(), v.seances) : null;
    const panneau = sel ? (() => { const e = ens(sel.enseignement_id);
      return `<div class="edt-panneau"><strong>${esc(nomCl(e.classe_id))} · ${esc(nomMat(e.matiere_id))}</strong> <span class="doux">${esc(nomProf(e.professeur_id) || 'sans professeur')} · ${dureeSeance(sel)} h</span>
        ${estAdm() ? `<p class="petit">${E.libres.length ? `Clique sur une case verte pour déplacer la séance (${E.libres.length} places possibles sans conflit).` : 'Aucune autre place possible sans conflit.'}</p>
        <div class="barre"><button class="b sec" id="e-verrou">${sel.verrouillee ? '🔓 Déverrouiller' : '🔒 Verrouiller (gardée à la génération)'}</button>
          <label class="petit">Salle <select id="e-salle">${opt('', '— aucune —', !sel.salle_id)}${D().salles.map(s => opt(s.id, s.nom, s.id === sel.salle_id)).join('')}</select></label>
          <button class="b sec" id="e-desel">Fermer</button></div>` : ''}</div>`; })() : '';
    return `<div class="barre">${selVersion()}
        <select id="e-vue">${opt('classe', 'Par classe', E.vue === 'classe')}${opt('prof', 'Par professeur', E.vue === 'prof')}${opt('salle', 'Par salle', E.vue === 'salle')}</select>
        <select id="e-cible">${listeCibles().map(([id, n]) => opt(id, n, id === E.cibleId)).join('') || opt('', '—')}</select>
        <button class="b sec" id="e-imp">🖨 Imprimer</button></div>
      ${E.conflits.length ? `<div class="msg err"><strong>${E.conflits.length} conflit${E.conflits.length > 1 ? 's' : ''} :</strong><br>${E.conflits.slice(0, 8).map(c => esc(c.message)).join('<br>')}</div>` : ''}
      ${ev ? `<p class="petit doux">Qualité (plus c’est bas, mieux c’est) : ${Math.round(ev.cout)} · ${v.seances.length} séances${v.statut === 'publie' ? ` · publiée du ${esc(v.publie_du)} au ${esc(v.publie_au)}` : ' · brouillon'}</p>` : ''}
      ${v ? htmlGrille(v.seances, E.cibleId, true) : ''}${panneau}`;
  }
  function vueGenerer() {
    const S = window.EDTSolveur; if (!S) return '<p class="doux">Générateur en cours de chargement…</p>';
    const dg = S.diagnostiquer(D()), g = E.gen, v = V();
    return `<h3>Avant de générer</h3><p class="petit">${dg.aPlacer} séances (${dg.heures} h) à placer sur ${dg.creneaux} créneaux par semaine.</p>
      ${dg.messages.length ? `<ul class="edt-diag petit">${dg.messages.slice(0, 15).map(m => `<li class="${m.grave ? 'grave' : ''}">${esc(m.texte)}</li>`).join('')}</ul>` : '<p class="msg ok">Rien d’impossible détecté.</p>'}
      <div class="barre"><input id="e-gnom" placeholder="Nom de la version" value="${esc(g.nom || 'Emploi du temps ' + new Date().toLocaleDateString('fr-FR'))}">
        <select id="e-gduree">${[[5000, 'Rapide (5 s)'], [8000, 'Normal (8 s)'], [20000, 'Approfondi (20 s)'], [60000, 'Très approfondi (1 min)']].map(([d, l]) => opt(d, l, Number(g.duree) === d)).join('')}</select>
        ${v ? `<label class="petit"><input type="checkbox" id="e-ggarder" ${g.garder ? 'checked' : ''}> Garder les séances verrouillées de « ${esc(v.nom)} » (${v.seances.filter(s => s.verrouillee).length})</label>` : ''}
        <button class="b" id="e-gen" ${g.enCours ? 'disabled' : ''}>▶ Générer</button></div>
      ${g.enCours ? `<div class="edt-prog"><i style="width:${Math.round(((g.progres || {}).avance || 0) * 100)}%"></i></div><p class="petit doux">Recherche en cours… ${g.progres ? `qualité ${Math.round(g.progres.cout)}, ${g.progres.nonPlacees} non placée(s)` : ''}</p>` : ''}
      ${g.res ? `<div class="edt-panneau"><strong>Résultat :</strong> ${g.res.seances.length} séances placées${g.res.nonPlacees.length ? `, <span style="color:var(--rouge)">${g.res.nonPlacees.length} non placée(s)</span>` : ', tout est placé'} · qualité ${Math.round(g.res.cout - g.res.nonPlacees.length * S.POIDS.nonPlacee)} · ${Math.round(g.res.dureeMs / 100) / 10} s
          ${g.res.nonPlacees.length ? `<p class="petit">Non placées (contraintes trop fortes) : ${g.res.nonPlacees.map(x => esc(x.texte)).join(', ')}.</p>` : ''}
          <div class="barre"><button class="b" id="e-gsave">Enregistrer comme nouvelle version</button>${v && v.statut !== 'publie' ? `<button class="b sec" id="e-gremp">Remplacer « ${esc(v.nom)} »</button>` : ''}</div></div>` : ''}`;
  }
  function vueContraintes() {
    const cl = E.cibleClasse || (D().classes[0] || {}).id || '';
    const liste = D().enseignements.filter(e => e.classe_id === cl).sort((a, b) => nomMat(a.matiere_id).localeCompare(nomMat(b.matiere_id), 'fr'));
    const tot = liste.reduce((a, e) => a + (Number(e.heures_hebdo) || 0), 0);
    const cibles = { professeur: D().professeurs.map(p => [p.id, p.nom]), classe: D().classes.map(c => [c.id, c.nom]), salle: D().salles.map(s => [s.id, s.nom]), matiere: D().matieres.map(m => [m.id, m.nom]) };
    const nomCible = r => (cibles[r.cible_type].find(([id]) => id === r.cible_id) || [, '?'])[1];
    const cr = creneauxTries();
    return `<h3>Heures et séances</h3><div class="barre"><select id="e-ccl">${D().classes.map(c => opt(c.id, c.nom, c.id === cl)).join('')}</select><span class="petit doux">${tot} h par semaine</span></div>
      <div class="tablewrap"><table><thead><tr><th>Matière</th><th>Professeur</th><th>Heures / sem.</th><th>Séance</th><th>Salle imposée</th><th>Groupe</th></tr></thead><tbody>
      ${liste.map(e => `<tr><td>${esc(nomMat(e.matiere_id))}</td><td>${esc(nomProf(e.professeur_id) || '—')}</td>
        <td class="edt-c"><input type="number" min="0" max="12" step="0.5" data-ens-h="${e.id}" value="${e.heures_hebdo ?? ''}"></td>
        <td class="edt-c"><select data-ens-bloc="${e.id}">${[1, 2, 3, 4].map(b => opt(b, b + ' h', e.bloc === b)).join('')}</select></td>
        <td class="edt-c"><select data-ens-salle="${e.id}">${opt('', '—', !e.salle_id)}${D().salles.map(s => opt(s.id, s.nom, s.id === e.salle_id)).join('')}</select></td>
        <td class="edt-c"><select data-ens-grp="${e.id}">${opt('', 'Classe entière', !e.groupe_id)}${D().groupes.filter(g => g.classe_id === cl).map(g => opt(g.id, g.nom, g.id === e.groupe_id)).join('')}</select></td></tr>`).join('') || '<tr><td colspan="6" class="doux">Aucune matière pour cette classe (onglet « Matières et coefficients »).</td></tr>'}
      </tbody></table></div>
      <p class="petit doux">« Séance » : durée d’une séance (ex. EPS 2 h). S’il reste des heures (EPS 3 h), une séance plus courte est ajoutée.</p>
      <h3 style="margin-top:16px">Indisponibilités et préférences</h3>
      <p class="petit doux">Obligatoire : jamais de cours à ce moment-là. Préférence : évité si possible (poids 1 à 5).</p>
      <div class="tablewrap"><table><tbody>${D().regles.map(r => `<tr><td>${esc({ professeur: 'Professeur', classe: 'Classe', salle: 'Salle', matiere: 'Matière' }[r.cible_type])} : <strong>${esc(nomCible(r))}</strong></td>
        <td>${r.jour ? JOURS[r.jour] : 'Tous les jours'}${r.debut ? ` ${r.debut}–${r.fin}` : ' (journée)'}</td><td>${r.obligatoire ? '<span class="tag">Obligatoire</span>' : `Préférence · poids ${r.poids}`}</td><td>${esc(r.motif || '')}</td>
        <td><button class="b danger" data-regle-suppr="${r.id}">Retirer</button></td></tr>`).join('') || '<tr><td class="doux">Aucune pour l’instant.</td></tr>'}</tbody></table></div>
      <div class="edt-panneau"><div class="barre">
        <select id="r-type">${Object.entries({ professeur: 'Professeur', classe: 'Classe', salle: 'Salle', matiere: 'Matière' }).map(([k, l]) => opt(k, l, E.regleCible === k)).join('')}</select>
        <select id="r-cible">${cibles[E.regleCible].map(([id, n]) => opt(id, n)).join('') || opt('', '— rien à choisir —')}</select>
        <select id="r-jour">${opt('', 'Tous les jours')}${[1, 2, 3, 4, 5, 6].filter(j => cr.some(c => c.jour === j)).map(j => opt(j, JOURS[j])).join('')}</select>
        <select id="r-plage">${opt('jour', 'Toute la journée')}${opt('matin', 'Le matin')}${opt('aprem', 'L’après-midi')}${opt('perso', 'Heures précises')}</select>
        <input id="r-debut" type="time" value="08:00" hidden><input id="r-fin" type="time" value="10:00" hidden></div>
        <div class="barre"><select id="r-oblig">${opt('1', 'Obligatoire')}${[5, 4, 3, 2, 1].map(p => opt('p' + p, 'Préférence, poids ' + p)).join('')}</select>
        <input id="r-motif" placeholder="Motif (facultatif), ex. formation" maxlength="200" style="flex:1"><button class="b" id="r-ajout">Ajouter</button></div></div>
      <h3 style="margin-top:16px">Salles</h3>
      <div class="barre">${D().salles.map(s => `<span class="tag">${esc(s.nom)}${s.type ? ' · ' + esc(s.type) : ''} <button class="b danger" data-salle-suppr="${s.id}" title="Retirer">×</button></span>`).join(' ') || '<span class="doux">Aucune salle (seules les salles imposées comptent pour les conflits).</span>'}</div>
      <div class="barre"><input id="s-nom" placeholder="Nom (ex. Gymnase)"><input id="s-type" placeholder="Type (facultatif)"><button class="b sec" id="s-ajout">Ajouter la salle</button></div>
      <h3 style="margin-top:16px">Grille horaire</h3>
      <div class="barre" style="align-items:flex-start">${[...new Set(cr.map(c => c.jour))].map(j => `<div class="petit"><strong>${JOURS[j]}</strong><br>${cr.filter(c => c.jour === j).map(c => `${c.debut}–${c.fin} <button class="b danger" data-cr-suppr="${c.id}" title="Retirer">×</button>`).join('<br>')}</div>`).join('')}</div>
      <div class="barre"><select id="g-jour">${[1, 2, 3, 4, 5, 6].map(j => opt(j, JOURS[j])).join('')}</select><input id="g-debut" type="time" value="16:35"><input id="g-fin" type="time" value="17:30"><button class="b sec" id="g-ajout">Ajouter le créneau</button></div>
      <div class="barre"><label class="petit">Maximum d’heures d’une même matière par jour (classe) <input id="e-maxj" type="number" min="1" max="6" value="${D().max_matiere_jour}" style="width:64px"></label></div>`;
  }
  function vuePublier() {
    const v = V(), an = D().annee || {}, auj = new Date().toISOString().slice(0, 10);
    const du = E.pubDu || (an.debut && an.debut > auj ? an.debut : auj), au = E.pubAu || an.fin || auj;
    return `<p>Publier fait de la version choisie l’emploi du temps officiel : les cours de chaque semaine sont créés (sauf les jours de fermeture du calendrier), et l’appel, les absences et le suivi du jour partent de là.</p>
      <div class="barre">${selVersion()}<label class="petit">Du <input type="date" id="p-du" value="${esc(du)}"></label><label class="petit">au <input type="date" id="p-au" value="${esc(au)}"></label>
        <button class="b" id="p-publier" ${v ? '' : 'disabled'}>${E.confirmer === 'publier' ? 'Confirmer la publication' : 'Publier'}</button></div>
      ${E.confirmer === 'publier' ? '<p class="msg info">Les cours à venir d’une publication précédente seront remplacés (ceux dont l’appel est déjà ouvert sont gardés). Clique à nouveau pour confirmer.</p>' : ''}
      ${D().versions.filter(x => x.statut === 'publie').map(x => `<p class="petit">Publiée : <strong>${esc(x.nom)}</strong> du ${esc(x.publie_du)} au ${esc(x.publie_au)}.</p>`).join('')}
      ${v && v.statut !== 'publie' ? `<div class="barre"><button class="b danger" id="p-suppr">${E.confirmer === 'suppr' ? 'Confirmer la suppression du brouillon' : 'Supprimer ce brouillon'}</button></div>` : ''}`;
  }

  // ---------- Actions ----------
  async function selectionner(id) {
    if (E.sel === id) { E.sel = ''; E.libres = []; return refaire(); }
    E.sel = id; E.libres = estAdm() && window.EDTSolveur ? window.EDTSolveur.creneauxLibres(D(), V().seances, id) : []; refaire();
  }
  async function modifier(params, ok) {
    const r = await sb.rpc('modifier_seance', Object.assign({ p_seance: E.sel, p_creneau: null, p_salle: null, p_verrouillee: null, p_sans_salle: false }, params));
    if (r.error) dire('err', erreur(r.error)); else dire('ok', ok);
    await chargerEdt(); if (E.sel) E.libres = window.EDTSolveur.creneauxLibres(D(), V().seances, E.sel); refaire();
  }
  function lancerGeneration() {
    const g = E.gen, v = V(); g.enCours = true; g.res = null; g.progres = null; S.message = null;
    const options = { graine: Math.floor(Math.random() * 1e9), dureeMs: Number(g.duree), seances: g.garder && v ? v.seances : [] };
    const fin = res => { g.enCours = false; g.res = res; refaire(); };
    try {
      const w = new Worker('edt-solveur.js?v=1');
      w.onmessage = ev => { const m = ev.data; if (m.type === 'progres') { g.progres = m; const b = document.querySelector('.edt-prog i'); if (b) b.style.width = Math.round(m.avance * 100) + '%'; }
        else if (m.type === 'fin') { w.terminate(); fin(m.resultat); } else { w.terminate(); g.enCours = false; dire('err', m.message); refaire(); } };
      w.onerror = () => { w.terminate(); setTimeout(() => fin(window.EDTSolveur.generer(D(), options)), 0); };
      w.postMessage({ donnees: D(), options });
    } catch (e) { setTimeout(() => fin(window.EDTSolveur.generer(D(), options)), 50); }
    refaire();
  }
  async function enregistrerResultat(version) {
    const g = E.gen, r = await sb.rpc('enregistrer_edt', { p_version: version || null, p_nom: g.nom || 'Emploi du temps', p_seances: g.res.seances, p_score: { cout: g.res.cout, nonPlacees: g.res.nonPlacees.length } });
    if (r.error) { dire('err', erreur(r.error)); return refaire(); }
    E.versionId = r.data; g.res = null; E.sub = 'grille'; dire('ok', 'Emploi du temps enregistré. Vérifie la grille puis publie-le.'); recharger();
  }

  function liensEdt() {
    document.querySelectorAll('[data-esub]').forEach(b => b.onclick = () => { E.sub = b.dataset.esub; E.confirmer = ''; S.message = null; recharger(); });
    const ver = $('#e-version'); if (ver) ver.onchange = () => { E.versionId = ver.value; E.sel = ''; E.libres = []; E.confirmer = ''; recharger(); };
    const vue = $('#e-vue'); if (vue) vue.onchange = () => { E.vue = vue.value; E.cibleId = (listeCibles()[0] || [])[0] || ''; E.sel = ''; E.libres = []; refaire(); };
    const ci = $('#e-cible'); if (ci) ci.onchange = () => { E.cibleId = ci.value; E.sel = ''; E.libres = []; refaire(); };
    document.querySelectorAll('[data-seance]').forEach(b => b.onclick = () => selectionner(b.dataset.seance));
    document.querySelectorAll('[data-vers]').forEach(c => c.onclick = () => modifier({ p_creneau: c.dataset.vers }, 'Séance déplacée.'));
    const vr = $('#e-verrou'); if (vr) vr.onclick = () => { const s = V().seances.find(x => x.id === E.sel); modifier({ p_verrouillee: !s.verrouillee }, s.verrouillee ? 'Séance déverrouillée.' : 'Séance verrouillée : la génération la gardera.'); };
    const sa = $('#e-salle'); if (sa) sa.onchange = () => modifier(sa.value ? { p_salle: sa.value } : { p_sans_salle: true }, 'Salle modifiée.');
    const ds = $('#e-desel'); if (ds) ds.onclick = () => { E.sel = ''; E.libres = []; refaire(); };
    const im = $('#e-imp'); if (im) im.onclick = () => { const t = listeCibles().find(([id]) => id === E.cibleId);
      window.LCVS.bulletinsOutils.imprimer(`<article class="bulletin"><div class="bu-tete"><div><h2>Emploi du temps · ${esc(t ? t[1] : '')}</h2><div>${esc(D().annee ? D().annee.libelle : '')} · ${esc(V().nom)}</div></div></div>${htmlGrille(V().seances, E.cibleId, false)}</article>`); };
    // Générer
    const gn = $('#e-gnom'); if (gn) gn.oninput = () => { E.gen.nom = gn.value; };
    const gd = $('#e-gduree'); if (gd) gd.onchange = () => { E.gen.duree = Number(gd.value); };
    const gg = $('#e-ggarder'); if (gg) gg.onchange = () => { E.gen.garder = gg.checked; };
    const ge = $('#e-gen'); if (ge) ge.onclick = () => { if (gn) E.gen.nom = gn.value; lancerGeneration(); };
    const gs = $('#e-gsave'); if (gs) gs.onclick = () => enregistrerResultat(null);
    const gr = $('#e-gremp'); if (gr) gr.onclick = () => enregistrerResultat(E.versionId);
    // Contraintes
    const ccl = $('#e-ccl'); if (ccl) ccl.onchange = () => { E.cibleClasse = ccl.value; refaire(); };
    const majEns = async (id, champs) => { const r = await sb.from('enseignements').update(champs).eq('id', id); if (r.error) dire('err', erreur(r.error)); else { Object.assign(ens(id), champs); dire('ok', 'Enregistré.'); } refaire(); };
    document.querySelectorAll('[data-ens-h]').forEach(i => i.onchange = () => { const v = Number(String(i.value).replace(',', '.')); if (i.value !== '' && !(v > 0 && v <= 12)) { dire('err', 'Heures : entre 0,5 et 12.'); return refaire(); } majEns(i.dataset.ensH, { heures_hebdo: i.value === '' ? null : v }); });
    document.querySelectorAll('[data-ens-bloc]').forEach(i => i.onchange = () => majEns(i.dataset.ensBloc, { bloc: Number(i.value) }));
    document.querySelectorAll('[data-ens-salle]').forEach(i => i.onchange = () => majEns(i.dataset.ensSalle, { salle_id: i.value || null }));
    document.querySelectorAll('[data-ens-grp]').forEach(i => i.onchange = () => majEns(i.dataset.ensGrp, { groupe_id: i.value || null }));
    const rt = $('#r-type'); if (rt) rt.onchange = () => { E.regleCible = rt.value; refaire(); };
    const rp = $('#r-plage'); if (rp) rp.onchange = () => { $('#r-debut').hidden = $('#r-fin').hidden = rp.value !== 'perso'; };
    const ra = $('#r-ajout'); if (ra) ra.onclick = async () => {
      const c = $('#r-cible').value; if (!c) { dire('err', 'Choisis à qui s’applique la règle.'); return refaire(); }
      const pl = $('#r-plage').value, [debut, fin] = pl === 'matin' ? ['07:00', '12:30'] : pl === 'aprem' ? ['12:30', '19:00'] : pl === 'perso' ? [$('#r-debut').value, $('#r-fin').value] : [null, null];
      if (pl === 'perso' && !(debut && fin && fin > debut)) { dire('err', 'Heures précises : la fin doit être après le début.'); return refaire(); }
      const ob = $('#r-oblig').value;
      const r = await sb.from('edt_regles').insert({ cible_type: E.regleCible, cible_id: c, jour: $('#r-jour').value ? Number($('#r-jour').value) : null, debut, fin, obligatoire: ob === '1', poids: ob === '1' ? 3 : Number(ob.slice(1)), motif: $('#r-motif').value.trim() || null });
      dire(r.error ? 'err' : 'ok', r.error ? erreur(r.error) : 'Règle ajoutée.'); recharger(); };
    document.querySelectorAll('[data-regle-suppr]').forEach(b => b.onclick = async () => { const r = await sb.from('edt_regles').delete().eq('id', b.dataset.regleSuppr); dire(r.error ? 'err' : 'ok', r.error ? erreur(r.error) : 'Règle retirée.'); recharger(); });
    const sj = $('#s-ajout'); if (sj) sj.onclick = async () => { const nom = $('#s-nom').value.trim(); if (!nom) { dire('err', 'Indique le nom de la salle.'); return refaire(); }
      const r = await sb.from('salles').insert({ nom, type: $('#s-type').value.trim() || null }); dire(r.error ? 'err' : 'ok', r.error ? erreur(r.error) : 'Salle ajoutée.'); recharger(); };
    document.querySelectorAll('[data-salle-suppr]').forEach(b => b.onclick = async () => { const r = await sb.from('salles').update({ actif: false }).eq('id', b.dataset.salleSuppr); dire(r.error ? 'err' : 'ok', r.error ? erreur(r.error) : 'Salle retirée.'); recharger(); });
    const ga = $('#g-ajout'); if (ga) ga.onclick = async () => { const d = $('#g-debut').value, f = $('#g-fin').value; if (!(d && f && f > d)) { dire('err', 'La fin du créneau doit être après le début.'); return refaire(); }
      const r = await sb.from('creneaux').insert({ jour: Number($('#g-jour').value), debut: d, fin: f }); dire(r.error ? 'err' : 'ok', r.error ? erreur(r.error) : 'Créneau ajouté.'); recharger(); };
    document.querySelectorAll('[data-cr-suppr]').forEach(b => b.onclick = async () => { const r = await sb.from('creneaux').delete().eq('id', b.dataset.crSuppr); dire(r.error ? 'err' : 'ok', r.error ? erreur(r.error) : 'Créneau retiré (les séances qui y étaient sont retirées des brouillons).'); recharger(); });
    const mj = $('#e-maxj'); if (mj) mj.onchange = async () => { const v = Number(mj.value); if (!(v >= 1 && v <= 6)) { dire('err', 'Entre 1 et 6.'); return refaire(); }
      const r = await sb.from('parametres').update({ valeur: v }).eq('cle', 'edt_max_matiere_jour'); dire(r.error ? 'err' : 'ok', r.error ? erreur(r.error) : 'Réglage enregistré.'); recharger(); };
    // Publier
    const pdu = $('#p-du'); if (pdu) pdu.onchange = () => { E.pubDu = pdu.value; };
    const pau = $('#p-au'); if (pau) pau.onchange = () => { E.pubAu = pau.value; };
    const pb = $('#p-publier'); if (pb) pb.onclick = async () => {
      if (E.confirmer !== 'publier') { E.confirmer = 'publier'; return refaire(); } E.confirmer = '';
      const r = await sb.rpc('publier_edt', { p_version: E.versionId, p_debut: $('#p-du').value, p_fin: $('#p-au').value });
      dire(r.error ? 'err' : 'ok', r.error ? erreur(r.error) : `Emploi du temps publié : ${r.data} cours créés. L’appel les propose dès maintenant.`);
      if (window.LCVS.V) window.LCVS.V.pret_appel = false; recharger(); };
    const ps = $('#p-suppr'); if (ps) ps.onclick = async () => { if (E.confirmer !== 'suppr') { E.confirmer = 'suppr'; return refaire(); } E.confirmer = '';
      const r = await sb.from('edt_versions').delete().eq('id', E.versionId); dire(r.error ? 'err' : 'ok', r.error ? erreur(r.error) : 'Brouillon supprimé.'); E.versionId = ''; recharger(); };
  }

  // Le générateur (même fichier que le Web Worker) est chargé à l'ouverture de l'onglet.
  const sc = document.createElement('script'); sc.src = 'edt-solveur.js?v=1'; sc.defer = true; document.head.appendChild(sc);

  insererOnglet('edt', 'Emploi du temps', 'calendrier');
  Object.assign(VUES, { edt: vueEdt });
  Object.assign(LIENS, { edt: liensEdt });
  Object.assign(LOAD, { edt: chargerEdt });
})();
