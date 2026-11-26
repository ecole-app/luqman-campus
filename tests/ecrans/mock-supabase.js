// Faux client Supabase en mémoire, pour tester les écrans sans base (données fictives).
(function () {
  const uid = () => crypto.randomUUID();
  const now = () => new Date().toISOString();
  const auj = new Date(); const j = auj.toISOString().slice(0, 10);
  const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const DB = { classes: [], eleves: [], matieres: [], enseignements: [], annees_scolaires: [], periodes: [], cours: [], appels: [], presences: [], observations: [], punitions: [],
    coffre_telephone: [], corrections_presence: [], absences_prevues: [], seances_retenue: [], incidents: [], incident_eleves: [], passages_infirmerie: [], fermetures: [], groupes: [], groupe_eleves: [] };
  const an = { id: uid(), libelle: '2026-2027', active: true }; DB.annees_scolaires.push(an);
  DB.periodes.push({ id: uid(), annee_id: an.id, numero: 1, libelle: 'Trimestre 1', debut: '2026-09-01', fin: '2026-11-30' }, { id: uid(), annee_id: an.id, numero: 2, libelle: 'Trimestre 2', debut: '2026-12-01', fin: '2027-03-15' });
  ['5e A', '6e A'].forEach(n => DB.classes.push({ id: uid(), annee_id: an.id, niveau: n.slice(0, 2), nom: n }));
  [['EPS', 'EPS'], ['MATH', 'Mathématiques']].forEach(([c, n]) => DB.matieres.push({ id: uid(), code: c, nom: n }));
  const noms = ['Amrani', 'Benali', 'Bouzid', 'Cherif', 'Dahmani', 'Ferhat', 'Haddad', 'Kaci'];
  DB.classes.forEach((c, ci) => noms.forEach((n, k) => DB.eleves.push({ id: uid(), nom: n, prenom: ['Adam', 'Lina', 'Amir', 'Sofia', 'Yanis', 'Sarah', 'Nour', 'Ilyes'][k], date_naissance: '2014-01-01', ine: null, classe_id: c.id, deleted_at: null })));
  DB.classes.forEach(c => DB.matieres.forEach(m => DB.enseignements.push({ id: uid(), classe_id: c.id, matiere_id: m.id, coefficient: 1, heures_hebdo: 3, professeur_id: null })));
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
      if (this.op === 'insert') { this.rows.forEach(r => T.push({ id: uid(), created_at: now(), statut: this.t === 'punitions' ? (/retenue/i.test(r.type) ? 'demandee' : 'a_faire') : undefined, annulee: false, ...r, arrivee_a: this.t === 'passages_infirmerie' ? now() : r.arrivee_a })); return { data: null, error: null }; }
      const emb = T.map(r => embed(r, this.sel));
      const ok = emb.map((r, i) => this.f.every(f => f(r)) ? i : -1).filter(i => i >= 0);
      if (this.op === 'update') { ok.forEach(i => { Object.assign(T[i], this.vals); if (this.t === 'presences' && this.vals.statut) T[i].heure_evenement = this.vals.statut === 'present' ? null : now(); if (this.vals.statut === 'retard') T[i].minutes_retard = 15; }); return { data: null, error: null }; }
      if (this.op === 'delete') { ok.sort((a, b) => b - a).forEach(i => T.splice(i, 1)); return { data: null, error: null }; }
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
