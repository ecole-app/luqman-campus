// Faux client Supabase en mémoire, pour tester les écrans sans base (données fictives).
(function () {
  const uid = () => crypto.randomUUID();
  const now = () => new Date().toISOString();
  const auj = new Date(); const j = auj.toISOString().slice(0, 10);
  const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const DB = { classes: [], eleves: [], matieres: [], enseignements: [], annees_scolaires: [], periodes: [], cours: [], appels: [], presences: [], observations: [], punitions: [],
    coffre_telephone: [], corrections_presence: [], absences_prevues: [], seances_retenue: [], incidents: [], incident_eleves: [], passages_infirmerie: [], fermetures: [], groupes: [], groupe_eleves: [], modeles_evaluation: [], appreciations: [], elements_programme: [], appreciations_generales: [], bulletins_periode: [], banque_phrases: [] };
  const an = { id: uid(), libelle: '2026-2027', active: true }; DB.annees_scolaires.push(an);
  DB.periodes.push({ id: uid(), annee_id: an.id, numero: 1, libelle: 'Trimestre 1', debut: '2026-09-01', fin: '2026-11-30' }, { id: uid(), annee_id: an.id, numero: 2, libelle: 'Trimestre 2', debut: '2026-12-01', fin: '2027-03-15' });
  ['5e A', '6e A'].forEach(n => DB.classes.push({ id: uid(), annee_id: an.id, niveau: n.slice(0, 2), nom: n }));
  [['EPS', 'EPS'], ['MATH', 'Mathématiques']].forEach(([c, n]) => DB.matieres.push({ id: uid(), code: c, nom: n }));
  const noms = ['Amrani', 'Benali', 'Bouzid', 'Cherif', 'Dahmani', 'Ferhat', 'Haddad', 'Kaci'];
  DB.classes.forEach((c, ci) => noms.forEach((n, k) => DB.eleves.push({ id: uid(), nom: n, prenom: ['Adam', 'Lina', 'Amir', 'Sofia', 'Yanis', 'Sarah', 'Nour', 'Ilyes'][k], date_naissance: '2014-01-01', ine: null, classe_id: c.id, deleted_at: null })));
  DB.classes.forEach(c => DB.matieres.forEach(m => DB.enseignements.push({ id: uid(), classe_id: c.id, matiere_id: m.id, coefficient: 1, heures_hebdo: 3, professeur_id: null })));
  Object.assign(DB, { evaluations: [], notes: [], evaluation_competences: [], acquisitions: [], bilans_competences: [], competences: [], parametres: [
    { cle: 'note_seuil_haut', valeur: 18 }, { cle: 'note_seuil_bas', valeur: 8 }, { cle: 'notes_visibles_tout_personnel', valeur: false }, { cle: 'appreciation_longueur_max', valeur: 400 }, { cle: 'elements_programme_longueur_max', valeur: 600 }, { cle: 'etablissement_nom', valeur: 'Collège Luqmân' }, { cle: 'etablissement_adresse', valeur: 'Saint-Étienne' }, { cle: 'bulletin_afficher_rang', valeur: true }, { cle: 'mentions_bulletin', valeur: ['Éloges', 'Félicitations', 'Compliments', 'Encouragements', 'Avertissement travail'] }, { cle: 'avis_seuil_avertissement', valeur: 10 }, { cle: 'avis_compliments', valeur: 14 }, { cle: 'avis_felicitations', valeur: 16 }, { cle: 'avis_felicitations_min_matiere', valeur: 10 }, { cle: 'avis_eloges', valeur: 18 }, { cle: 'avis_eloges_min_matiere', valeur: 16 }, { cle: 'note_non_rendu_compte_zero', valeur: true }, { cle: 'bulletin_mise_en_page', valeur: null },
    { cle: 'niveaux_competences', valeur: ['Maîtrise insuffisante', 'Maîtrise fragile', 'Maîtrise satisfaisante', 'Très bonne maîtrise'] }] });
  [3, 4].forEach(cy => [['D1.1', 'Langue française'], ['D1.4', 'Langages des arts et du corps'], ['D2', 'Méthodes et outils pour apprendre'], ['D3', 'Formation de la personne et du citoyen']]
    .forEach(([code, lib], i) => DB.competences.push({ id: uid(), cycle: cy, code, domaine: 'Socle', libelle: lib, ordre: i, actif: true, officiel: true, source_ref: 'Décret n° 2015-372 du 31-3-2015', source_url: 'https://www.education.gouv.fr/bo/15/Hebdo17/MENE1506516D.htm' })));
  DB.banque_phrases.push(...[['Très bien', 'Excellent trimestre : travail sérieux et résultats remarquables.'], ['Progrès', 'Des progrès nets ce trimestre.'], ['Difficultés', 'Des difficultés persistent.']].map(([categorie, texte]) => ({ id: uid(), categorie, texte, partage: true, created_by: null })));
  const HOOKS = { competences: o => { if (o.actif === undefined) o.actif = true; return o; }, evaluations: o => { const p = DB.periodes.find(x => o.date_eval >= x.debut && o.date_eval <= x.fin); if (!p) throw new Error('Aucune période ne couvre cette date'); o.periode_id = p.id; return o; } };
  const HOOK_ = (t, o) => HOOKS[t] ? HOOKS[t](o) : o;
  window.__DB = DB; window.__appels_rpc = [];

  const FK = { cours: 'cours_id', enseignements: 'enseignement_id', incidents: 'incident_id', annees_scolaires: 'annee_id' };
  function parseEmb(sel) {
    const out = []; let depth = 0, cur = '', name = null;
    for (const ch of sel) {
      if (ch === '(') { if (depth === 0) { name = cur.trim(); cur = ''; } else cur += ch; depth++; }
      else if (ch === ')') { depth--; if (depth === 0) { out.push([name.replace(/!inner/, ''), cur]); name = null; cur = ''; } else cur += ch; }
      else if (ch === ',' && depth === 0) { cur = ''; } else cur += ch;
    }
    return out;
  }
  function embed(row, sel) {
    const r = { ...row };
    for (const [name, inner] of parseEmb(sel)) { const t = DB[name]; const fk = FK[name]; const o = t && t.find(x => x.id === row[fk]); r[name] = o ? embed(o, inner) : null; }
    return r;
  }
  const get = (o, path) => path.split('.').reduce((a, k) => a == null ? a : a[k], o);
  const offline = () => !navigator.onLine;
  const ERR = { message: 'TypeError: Failed to fetch' };

  class Q {
    constructor(t) { this.t = t; this.f = []; this.op = 'select'; this.sel = '*'; this.ord = null; this.lim = null; this.single = false; }
    select(s) { if (this.op === 'select') this.sel = s || '*'; return this; }
    eq(c, v) { this.f.push(r => get(r, c) === v); return this; }
    neq(c, v) { this.f.push(r => get(r, c) !== v); return this; }
    gte(c, v) { this.f.push(r => get(r, c) >= v); return this; }
    gt(c, v) { this.f.push(r => get(r, c) > v); return this; }
    lt(c, v) { this.f.push(r => get(r, c) < v); return this; }
    lte(c, v) { this.f.push(r => get(r, c) <= v); return this; }
    in(c, v) { this.f.push(r => v.includes(get(r, c))); return this; }
    is(c, v) { this.f.push(r => (get(r, c) ?? null) === v); return this; }
    or() { return this; }
    order(c, o) { this.ord = [c, o && o.ascending === false ? -1 : 1]; return this; }
    limit(n) { this.lim = n; return this; }
    maybeSingle() { this.single = true; return this; }
    insert(rows) { this.op = 'insert'; this.rows = [].concat(rows); return this; }
    update(v) { this.op = 'update'; this.vals = v; return this; }
    delete() { this.op = 'delete'; return this; }
    run() {
      if (offline()) return { data: null, error: ERR };
      const T = DB[this.t]; if (!T) return { data: null, error: { message: 'table inconnue ' + this.t } };
      if (this.op === 'insert') { this.rows.forEach(r => T.push(HOOK_(this.t, { id: uid(), created_at: now(), statut: this.t === 'punitions' ? (/retenue/i.test(r.type) ? 'demandee' : 'a_faire') : undefined, annulee: false, ...r, arrivee_a: this.t === 'passages_infirmerie' ? now() : r.arrivee_a }))); return { data: null, error: null }; }
      const emb = T.map(r => embed(r, this.sel));
      const ok = emb.map((r, i) => this.f.every(f => f(r)) ? i : -1).filter(i => i >= 0);
      if (this.op === 'update') { ok.forEach(i => { Object.assign(T[i], this.vals); if (this.t === 'presences' && this.vals.statut) T[i].heure_evenement = this.vals.statut === 'present' ? null : now(); if (this.vals.statut === 'retard') T[i].minutes_retard = 15; }); return { data: ok.map(i => T[i]), error: null }; }
      if (this.op === 'delete') { const sup = ok.map(i => T[i]); ok.sort((a, b) => b - a).forEach(i => T.splice(i, 1)); return { data: sup, error: null }; }
      let d = ok.map(i => emb[i]);
      if (this.ord) { const [c, s] = this.ord; d.sort((a, b) => String(get(a, c) ?? '').localeCompare(String(get(b, c) ?? '')) * s); }
      if (this.lim) d = d.slice(0, this.lim);
      return { data: this.single ? (d[0] || null) : d, error: null };
    }
    then(res, rej) { return Promise.resolve().then(() => this.run()).then(res, rej); }
  }
  const pres = (cours, eleve) => DB.presences.find(p => p.cours_id === cours && p.eleve_id === eleve);
  const RPC = {
    dev_creer_cours_du_jour() { DB.cours.length = 0; let n = 0; DB.enseignements.forEach((e, i) => [8 + (i % 2), 13 + (i % 2)].forEach(h => { DB.cours.push({ id: uid(), enseignement_id: e.id, debut: at(h, 0), fin: at(h, 55), salle: 'Salle ' + (i + 1), annule: false, groupe_id: null }); n++; })); return n; },
    ouvrir_appel({ p_cours }) {
      const c = DB.cours.find(x => x.id === p_cours); if (c.annule) throw new Error('Ce cours est annulé');
      if (!DB.appels.find(a => a.cours_id === p_cours)) DB.appels.push({ cours_id: p_cours, valide_a: null });
      const en = DB.enseignements.find(e => e.id === c.enseignement_id);
      let el = DB.eleves.filter(e => e.classe_id === en.classe_id); if (c.groupe_id) el = el.filter(e => DB.groupe_eleves.some(g => g.groupe_id === c.groupe_id && g.eleve_id === e.id));
      el.forEach(e => { if (!pres(p_cours, e.id)) { const ap = DB.absences_prevues.find(a => a.eleve_id === e.id && !a.annulee && a.debut < c.fin && a.fin > c.debut);
        DB.presences.push({ id: uid(), cours_id: p_cours, eleve_id: e.id, statut: ap ? 'absent' : 'present', justifiee: !!ap, motif: ap ? 'Prévu : ' + ap.motif : null, heure_evenement: ap ? now() : null }); } });
      return el.length;
    },
    valider_appel({ p_cours }) { const a = DB.appels.find(x => x.cours_id === p_cours) || (RPC.ouvrir_appel({ p_cours }), DB.appels.find(x => x.cours_id === p_cours)); a.valide_a = now();
      const l = DB.presences.filter(p => p.cours_id === p_cours); const n = s => l.filter(p => p.statut === s).length;
      return { valide_a: a.valide_a, presents: n('present'), absents: n('absent'), retards: n('retard'), sorties: n('sortie'), dispenses: n('dispense') }; },
    synchroniser_presences({ p_cours, p_changements }) { RPC.ouvrir_appel({ p_cours }); p_changements.forEach(ch => { const p = pres(p_cours, ch.eleve_id); Object.assign(p, { statut: ch.statut, heure_evenement: ch.heure, autorise_par: ch.autorise_par || null, recupere_par: ch.recupere_par || null, saisie_hors_ligne: true }); }); return { appliques: p_changements.length, refuses: [] }; },
    appels_manquants() { return []; },
    eleves_a_surveiller() { const e = DB.eleves[0]; return [{ eleve_id: e.id, retards_periode: 4, demi_journees_mois: 1, non_depots: 0, motifs: ['retards'] }]; },
    stats_absenteisme() { return DB.classes.map(c => ({ classe_id: c.id, classe: c.nom, saisies: 16, absences: 2, non_justifiees: 1, retards: 1, taux_absence: 12.5 })); },
    justifier_absences({ p_presences, p_motif, p_justificatif }) { let n = 0; DB.presences.filter(p => p_presences.includes(p.id)).forEach(p => { p.justifiee = true; p.motif = p_motif || p.motif; p.justificatif_recu = p_justificatif; n++; }); return n; },
    annuler_cours({ p_cours, p_annule, p_motif }) { if (p_annule && !p_motif.trim()) throw new Error('Indique le motif de l’annulation'); Object.assign(DB.cours.find(c => c.id === p_cours), { annule: p_annule, motif_annulation: p_annule ? p_motif : null }); return null; },
    remplacer_cours({ p_cours, p_prof }) { DB.cours.find(c => c.id === p_cours).remplacant_id = p_prof; return null; },
    liste_professeurs() { return [{ id: 'p1', nom: 'Benali', prenom: 'Karim' }, { id: 'p2', nom: 'Martin', prenom: 'Julie' }]; },
    corriger_presence({ p_presence, p_statut, p_motif }) { if (!p_motif.trim()) throw new Error('Le motif de la correction est obligatoire'); const p = DB.presences.find(x => x.id === p_presence); p.statut = p_statut; DB.corrections_presence.push({ id: uid(), presence_id: p.id, motif: p_motif, created_at: now() }); return null; },
    infirmerie_depart({ p_passage, p_suite, p_recupere_par }) { if (p_suite === 'recupere_famille' && !p_recupere_par) throw new Error('Indique qui est venu chercher l’élève'); Object.assign(DB.passages_infirmerie.find(x => x.id === p_passage), { depart_a: now(), suite: p_suite, recupere_par: p_recupere_par }); return null; },
    deposer_telephone({ p_eleve, p_casier }) { DB.coffre_telephone.push({ id: uid(), eleve_id: p_eleve, jour: new Date().toLocaleDateString('sv', { timeZone: 'Europe/Paris' }), casier: p_casier, depose_a: now() }); return null; },
    restituer_telephone({ p_eleve }) { DB.coffre_telephone.filter(x => x.eleve_id === p_eleve).forEach(x => x.restitue_a = now()); return null; },
    signaler_non_depot({ p_eleve }) { DB.coffre_telephone.push({ id: uid(), eleve_id: p_eleve, jour: new Date().toLocaleDateString('sv', { timeZone: 'Europe/Paris' }), non_depose: true }); return { total: 1, seuil: 3, sanction_a_prevoir: false }; },
  };

  // ---- Étape 3 : notes et compétences (mêmes règles que le serveur) ----
  const calcMoy = (classe, periode) => {
    const out = new Map(); const zero = true;
    DB.enseignements.filter(en => en.classe_id === classe).forEach(en => DB.evaluations.filter(ev => ev.enseignement_id === en.id && (!periode || ev.periode_id === periode)).forEach(ev =>
      DB.notes.filter(n => n.evaluation_id === ev.id).forEach(n => {
        const el = DB.eleves.find(e => e.id === n.eleve_id); if (!el || el.classe_id !== classe) return;
        const k = n.eleve_id + '|' + en.id; const o = out.get(k) || { eleve_id: n.eleve_id, enseignement_id: en.id, matiere_id: en.matiere_id, s: 0, c: 0, nb: 0 };
        if (n.statut === 'note') { o.s += Number(n.valeur) / Number(ev.bareme) * 20 * Number(ev.coefficient); o.c += Number(ev.coefficient); o.nb++; }
        else if (n.statut === 'non_rendu' && zero) { o.c += Number(ev.coefficient); o.nb++; }
        out.set(k, o); })));
    return [...out.values()].filter(o => o.c > 0).map(o => ({ ...o, moy: o.s / o.c }));
  };
  const r2 = x => Math.round(x * 100) / 100;
  Object.assign(RPC, {
    historique_notes({ p_eval }) { return DB.notes.filter(n => n.evaluation_id === p_eval).map(n => ({ horodatage: now(), auteur: 'Test Professeur', operation: 'INSERT', eleve_id: n.eleve_id, avant_valeur: null, avant_statut: null, apres_valeur: n.valeur, apres_statut: n.statut, commentaire: n.commentaire })); },
    copier_evaluation({ p_eval, p_enseignement, p_date }) {
      const src = DB.evaluations.find(e => e.id === p_eval); const id = crypto.randomUUID();
      DB.evaluations.push(HOOK_('evaluations', { id, enseignement_id: p_enseignement, titre: src.titre, date_eval: p_date, type: src.type, bareme: src.bareme, coefficient: src.coefficient, visible_familles: false }));
      return id; },
    publier_modele({ p_eval, p_description, p_partage }) {
      const src = DB.evaluations.find(e => e.id === p_eval); const en = DB.enseignements.find(x => x.id === src.enseignement_id); const cl = DB.classes.find(c => c.id === en.classe_id);
      DB.modeles_evaluation.push({ id: crypto.randomUUID(), titre: src.titre, description: p_description || null, type: src.type, bareme: src.bareme, coefficient: src.coefficient, matiere_id: en.matiere_id, niveau: cl.niveau, competences_codes: [], partage: p_partage, created_at: now() });
      return null; },
    utiliser_modele({ p_modele, p_enseignement, p_date }) {
      const m = DB.modeles_evaluation.find(x => x.id === p_modele); const id = crypto.randomUUID();
      DB.evaluations.push(HOOK_('evaluations', { id, enseignement_id: p_enseignement, titre: m.titre, date_eval: p_date, type: m.type, bareme: m.bareme, coefficient: m.coefficient, visible_familles: false }));
      return id; },
    saisir_appreciations({ p_ens, p_periode, p_lignes }) {
      const en = DB.enseignements.find(e => e.id === p_ens); const st = (DB.bulletins_periode.find(b => b.classe_id === en.classe_id && b.periode_id === p_periode) || {}).statut || 'ouvert';
      const adm = !DB.__droits || DB.__droits.admin; if (st !== 'ouvert' && !adm) throw new Error('Bulletin validé ou période verrouillée : seule la direction peut encore modifier.');
      p_lignes.forEach(l => { const t = String(l.texte || '').trim(); if (t.length > 400) throw new Error('Texte trop long : 400 caractères maximum (actuellement ' + t.length + ').');
        const i = DB.appreciations.findIndex(a => a.eleve_id === l.eleve_id && a.enseignement_id === p_ens && a.periode_id === p_periode);
        if (!t) { if (i >= 0) DB.appreciations.splice(i, 1); } else if (i >= 0) DB.appreciations[i].texte = t; else DB.appreciations.push({ id: uid(), eleve_id: l.eleve_id, enseignement_id: p_ens, periode_id: p_periode, texte: t }); });
      return p_lignes.length; },
    saisir_elements_programme({ p_ens, p_periode, p_texte }) {
      const i = DB.elements_programme.findIndex(a => a.enseignement_id === p_ens && a.periode_id === p_periode); const t = String(p_texte || '').trim();
      if (!t) { if (i >= 0) DB.elements_programme.splice(i, 1); } else if (i >= 0) DB.elements_programme[i].texte = t; else DB.elements_programme.push({ id: uid(), enseignement_id: p_ens, periode_id: p_periode, texte: t }); return null; },
    saisir_appreciation_generale({ p_eleve, p_periode, p_texte, p_mention }) {
      const i = DB.appreciations_generales.findIndex(a => a.eleve_id === p_eleve && a.periode_id === p_periode); const t = String(p_texte || '').trim() || null, m = p_mention || null;
      if (!t && !m) { if (i >= 0) DB.appreciations_generales.splice(i, 1); } else if (i >= 0) Object.assign(DB.appreciations_generales[i], { texte: t, mention: m }); else DB.appreciations_generales.push({ id: uid(), eleve_id: p_eleve, periode_id: p_periode, texte: t, mention: m }); return null; },
    changer_statut_bulletin({ p_classe, p_periode, p_statut }) {
      if (DB.__droits && !DB.__droits.admin) throw new Error('Seule la direction valide ou publie les bulletins.');
      const b = DB.bulletins_periode.find(x => x.classe_id === p_classe && x.periode_id === p_periode); if (b) b.statut = p_statut; else DB.bulletins_periode.push({ classe_id: p_classe, periode_id: p_periode, statut: p_statut }); return null; },
    suivi_appreciations({ p_classe, p_periode }) {
      const els = DB.eleves.filter(e => e.classe_id === p_classe && !e.deleted_at);
      return { eleves: els.length, generales: DB.appreciations_generales.filter(a => a.periode_id === p_periode && els.some(e => e.id === a.eleve_id) && a.texte).length,
        statut: (DB.bulletins_periode.find(b => b.classe_id === p_classe && b.periode_id === p_periode) || {}).statut || 'ouvert',
        matieres: DB.enseignements.filter(en => en.classe_id === p_classe).map(en => ({ enseignement_id: en.id, matiere: DB.matieres.find(m => m.id === en.matiere_id).nom, professeur: null,
          appreciations: DB.appreciations.filter(a => a.enseignement_id === en.id && a.periode_id === p_periode).length, elements: DB.elements_programme.some(x => x.enseignement_id === en.id && x.periode_id === p_periode) })) }; },
    donnees_bilan_cycle({ p_classe }) {
      const cl = DB.classes.find(c => c.id === p_classe);
      if (cl.niveau !== '6e' && cl.niveau !== '3e') throw new Error('Le bilan de fin de cycle concerne les classes de 6e (fin du cycle 3) et de 3e (fin du cycle 4).');
      const cy = cl.niveau === '6e' ? 3 : 4, comps = DB.competences.filter(k => k.cycle === cy && k.actif).sort((a, b) => a.ordre - b.ordre), bc = RPC.bilan_competences({ p_classe, p_periode: null });
      DB.bilans_cycle = DB.bilans_cycle || []; DB.syntheses_cycle = DB.syntheses_cycle || [];
      return { etablissement: { nom: 'Collège Luqmân', adresse: 'Saint-Étienne' }, classe: { id: cl.id, nom: cl.nom, niveau: cl.niveau, prof_principal: null, annee: '2026-2027' }, cycle: cy, afficher_points: true, points: { 1: 10, 2: 25, 3: 40, 4: 50 },
        composantes: comps.map(k => ({ id: k.id, code: k.code, domaine: k.domaine, libelle: k.libelle })),
        eleves: DB.eleves.filter(e => e.classe_id === p_classe && !e.deleted_at).map(e => ({ id: e.id, nom: e.nom, prenom: e.prenom, date_naissance: e.date_naissance, synthese: (DB.syntheses_cycle.find(x => x.eleve_id === e.id) || {}).texte || null,
          niveaux: comps.map(k => { const b = bc.find(x => x.eleve_id === e.id && x.competence_id === k.id) || {}, o = DB.bilans_cycle.find(x => x.eleve_id === e.id && x.competence_id === k.id);
            return { competence_id: k.id, nb: b.nb || 0, moyenne: b.moyenne ?? null, propose: b.niveau_propose ?? null, retenu: o ? o.niveau : (b.niveau_propose ?? null), modifie: !!o }; })})) };
    },
    saisir_bilan_cycle({ p_eleve, p_niveaux, p_synthese }) {
      DB.bilans_cycle = DB.bilans_cycle || []; DB.syntheses_cycle = DB.syntheses_cycle || [];
      (p_niveaux || []).forEach(x => { const i = DB.bilans_cycle.findIndex(b => b.eleve_id === p_eleve && b.competence_id === x.competence_id); if (i >= 0) DB.bilans_cycle.splice(i, 1);
        if (x.niveau != null) DB.bilans_cycle.push({ eleve_id: p_eleve, competence_id: x.competence_id, niveau: x.niveau }); });
      if (p_synthese != null) { const i = DB.syntheses_cycle.findIndex(b => b.eleve_id === p_eleve); if (i >= 0) DB.syntheses_cycle.splice(i, 1); if (p_synthese.trim()) DB.syntheses_cycle.push({ eleve_id: p_eleve, texte: p_synthese.trim() }); }
      return null; },
    suivi_toutes_classes({ p_periode }) {
      return DB.classes.map(c => RPC.suivi_appreciations({ p_classe: c.id, p_periode })).map((x, i) => ({ ...x, classe_id: DB.classes[i].id, classe: DB.classes[i].nom, prof_principal: null })); },
    historique_appreciations({ p_eleve, p_ens, p_periode }) {
      const a = DB.appreciations.find(x => x.eleve_id === p_eleve && x.enseignement_id === p_ens && x.periode_id === p_periode);
      return a ? [{ horodatage: now(), auteur: 'Test Prof', operation: 'UPDATE', avant: 'Ancien texte de test.', apres: a.texte }] : []; },
    donnees_bulletins({ p_classe, p_periode }) {
      if (DB.__droits && !DB.__droits.admin && !(DB.__droits.classes_pp || []).includes(p_classe)) throw new Error('Les bulletins sont réservés au professeur principal et à la direction.');
      const cl = DB.classes.find(c => c.id === p_classe), per = DB.periodes.find(p => p.id === p_periode), mm = calcMoy(p_classe, p_periode);
      const ens = DB.enseignements.filter(en => en.classe_id === p_classe).map(en => { const v = mm.filter(o => o.enseignement_id === en.id).map(o => o.moy);
        return { id: en.id, matiere: DB.matieres.find(m => m.id === en.matiere_id).nom, coefficient: en.coefficient, professeur: null, elements: (DB.elements_programme.find(x => x.enseignement_id === en.id && x.periode_id === p_periode) || {}).texte || null,
          moyenne_classe: v.length ? r2(v.reduce((a, b) => a + b, 0) / v.length) : null, min: v.length ? r2(Math.min(...v)) : null, max: v.length ? r2(Math.max(...v)) : null }; }).sort((a, b) => a.matiere.localeCompare(b.matiere));
      const gen = RPC.moyennes_generales({ p_classe, p_periode });
      const eleves = DB.eleves.filter(e => e.classe_id === p_classe && !e.deleted_at).sort((a, b) => (a.nom + a.prenom).localeCompare(b.nom + b.prenom)).map(e => { const g = gen.find(x => x.eleve_id === e.id) || {}, ag = DB.appreciations_generales.find(a => a.eleve_id === e.id && a.periode_id === p_periode) || {};
        const res = {}; ens.forEach(en => { const o = mm.find(x => x.eleve_id === e.id && x.enseignement_id === en.id); res[en.id] = { moyenne: o ? r2(o.moy) : null, nb: o ? o.nb : 0, appreciation: (DB.appreciations.find(a => a.eleve_id === e.id && a.enseignement_id === en.id && a.periode_id === p_periode) || {}).texte || null }; });
        return { id: e.id, nom: e.nom, prenom: e.prenom, date_naissance: e.date_naissance, moyenne: g.moyenne ?? null, rang: g.rang ?? null, resultats: res, absences: { demi_journees: 1, non_justifiees: 0, retards: 2 }, generale: ag.texte || null, mention: ag.mention || null, competences: [] }; });
      const gm = gen.map(x => x.moyenne);
      return { etablissement: { nom: 'Collège Luqmân', adresse: 'Saint-Étienne' }, classe: { id: cl.id, nom: cl.nom, niveau: cl.niveau, prof_principal: null }, periode: { id: per.id, libelle: per.libelle, debut: per.debut, fin: per.fin, annee: '2026-2027' },
        statut: (DB.bulletins_periode.find(b => b.classe_id === p_classe && b.periode_id === p_periode) || {}).statut || 'ouvert', afficher_rang: true, moyenne_classe: gm.length ? r2(gm.reduce((a, b) => a + b, 0) / gm.length) : null, enseignements: ens, eleves }; },
    mes_droits_notes() { return DB.__droits || { admin: true, classes_pp: [], enseignements: [] }; },
    saisir_notes({ p_eval, p_lignes }) {
      const ev = DB.evaluations.find(e => e.id === p_eval); const per = DB.periodes.find(p => p.id === ev.periode_id);
      if (per && per.verrouillee) throw new Error('Période verrouillée : les notes ne peuvent plus être modifiées (voir la direction)');
      p_lignes.forEach(l => {
        const i = DB.notes.findIndex(n => n.evaluation_id === p_eval && n.eleve_id === l.eleve_id);
        if (!l.statut && !String(l.valeur ?? '').trim()) { if (i >= 0) DB.notes.splice(i, 1); return; }
        const st = l.statut || 'note'; let v = null;
        if (st === 'note') { v = Number(String(l.valeur).replace(',', '.')); if (Number.isNaN(v)) throw new Error('Note illisible'); if (v > Number(ev.bareme)) throw new Error('La note dépasse le barème (sur ' + ev.bareme + ')'); }
        const row = { id: uid(), evaluation_id: p_eval, eleve_id: l.eleve_id, statut: st, valeur: v, commentaire: l.commentaire || null };
        if (i >= 0) DB.notes[i] = row; else DB.notes.push(row);
      }); return p_lignes.length;
    },
    saisir_acquisitions({ p_eval, p_lignes }) {
      p_lignes.forEach(l => { const i = DB.acquisitions.findIndex(a => a.evaluation_id === p_eval && a.competence_id === l.competence_id && a.eleve_id === l.eleve_id);
        if (l.niveau == null) { if (i >= 0) DB.acquisitions.splice(i, 1); return; }
        const row = { id: uid(), evaluation_id: p_eval, competence_id: l.competence_id, eleve_id: l.eleve_id, niveau: Number(l.niveau) }; if (i >= 0) DB.acquisitions[i] = row; else DB.acquisitions.push(row); });
      return p_lignes.length;
    },
    moyennes_matieres({ p_classe, p_periode }) {
      const l = calcMoy(p_classe, p_periode); const par = {}; l.forEach(o => (par[o.enseignement_id] = par[o.enseignement_id] || []).push(o.moy));
      return l.map(o => { const v = par[o.enseignement_id]; return { eleve_id: o.eleve_id, enseignement_id: o.enseignement_id, matiere_id: o.matiere_id, moyenne: r2(o.moy), nb_notes: o.nb,
        moyenne_classe: r2(v.reduce((a, b) => a + b, 0) / v.length), minimum: r2(Math.min(...v)), maximum: r2(Math.max(...v)) }; });
    },
    moyennes_generales({ p_classe, p_periode }) {
      const g = {}; calcMoy(p_classe, p_periode).forEach(o => { const en = DB.enseignements.find(e => e.id === o.enseignement_id); const x = g[o.eleve_id] = g[o.eleve_id] || { s: 0, c: 0, nb: 0 }; x.s += o.moy * en.coefficient; x.c += en.coefficient; x.nb++; });
      const l = Object.entries(g).map(([id, x]) => ({ eleve_id: id, m: r2(x.s / x.c), nb: x.nb })).sort((a, b) => b.m - a.m);
      const ms = l.map(x => x.m); const moy = r2(ms.reduce((a, b) => a + b, 0) / (ms.length || 1));
      return l.map(x => ({ eleve_id: x.eleve_id, moyenne: x.m, nb_matieres: x.nb, rang: 1 + ms.filter(y => y > x.m).length, moyenne_classe: moy, minimum: Math.min(...ms), maximum: Math.max(...ms) }));
    },
    bilan_competences({ p_classe, p_periode }) {
      const m = {}; DB.acquisitions.forEach(a => { const ev = DB.evaluations.find(e => e.id === a.evaluation_id); const en = DB.enseignements.find(e => e.id === ev.enseignement_id);
        const el = DB.eleves.find(e => e.id === a.eleve_id); if (en.classe_id !== p_classe || el.classe_id !== p_classe || (p_periode && ev.periode_id !== p_periode)) return;
        const k = a.eleve_id + '|' + a.competence_id; (m[k] = m[k] || { eleve_id: a.eleve_id, competence_id: a.competence_id, v: [] }).v.push(a.niveau); });
      DB.bilans_competences.filter(b => b.periode_id === p_periode).forEach(b => { const k = b.eleve_id + '|' + b.competence_id; (m[k] = m[k] || { eleve_id: b.eleve_id, competence_id: b.competence_id, v: [] }).o = b.niveau; });
      return Object.values(m).map(x => { const moy = x.v.length ? x.v.reduce((a, b) => a + b, 0) / x.v.length : null; const prop = moy == null ? null : Math.round(moy);
        return { eleve_id: x.eleve_id, competence_id: x.competence_id, nb: x.v.length, moyenne: moy == null ? null : r2(moy), niveau_propose: prop, niveau_retenu: x.o ?? prop, modifie: x.o != null }; });
    },
  });
  const client = {
    from: t => new Q(t),
    rpc: (n, a) => Promise.resolve().then(() => {
      window.__appels_rpc.push(n);
      if (offline()) return { data: null, error: ERR };
      if (!RPC[n]) return { data: null, error: { message: 'rpc inconnue ' + n } };
      try { return { data: RPC[n](a || {}), error: null }; } catch (e) { return { data: null, error: { message: e.message } }; }
    }),
  };
  window.supabase = { createClient: () => client };
})();
