// Luqmân Campus — étape 6 : générateur d'emploi du temps (sans dépendance, dans le navigateur ou en Node).
// 1) Contraintes obligatoires, jamais violées : une classe (ou un groupe), un professeur, une salle à un seul endroit
//    à la fois ; indisponibilités obligatoires ; séance de plusieurs heures d'un seul tenant (pas de pause de midi au
//    milieu) ; maximum d'heures d'une même matière par jour ; séances verrouillées gardées telles quelles.
// 2) Préférences, optimisées ensuite (recuit simulé) : pas de trous pour les classes (poids fort) ni pour les professeurs,
//    une matière pas deux fois le même jour, préférences d'indisponibilité (poids 1 à 5), journées équilibrées.
// S'exécute aussi comme Web Worker (message { donnees, options } → messages « progres » puis « fin »).
(function (racine) {
  'use strict';
  const POIDS = { nonPlacee: 1000, trouClasse: 10, trouProf: 3, memeJour: 4, preference: 5, desequilibre: 1 };
  const hmin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
  function alea(graine) { let a = (graine >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---------- Préparation ----------
  function preparer(D, seancesExistantes) {
    const slots = [...D.creneaux].sort((a, b) => a.jour - b.jour || hmin(a.debut) - hmin(b.debut))
      .map((c, i) => ({ i, id: c.id, jour: c.jour, debut: hmin(c.debut), fin: hmin(c.fin), libelle: c.debut }));
    const jours = [...new Set(slots.map(s => s.jour))];
    slots.forEach((s, i) => { const n = slots[i + 1]; s.suiv = n && n.jour === s.jour && n.debut - s.fin <= 20 ? i + 1 : -1; s.rang = slots.filter(x => x.jour === s.jour && x.debut < s.debut).length; });
    const parId = new Map(slots.map(s => [s.id, s.i]));
    const chaine = (i, L) => { const r = [i]; let k = i; while (r.length < L) { k = slots[k].suiv; if (k < 0) return null; r.push(k); } return r; };
    const ens = new Map(D.enseignements.map(e => [e.id, e]));
    const regles = (D.regles || []).map(r => ({ ...r, d: r.debut ? hmin(r.debut) : null, f: r.fin ? hmin(r.fin) : null }));
    const touche = (r, e, salle, s) => (r.jour == null || r.jour === s.jour) && (r.d == null || (s.debut < r.f && s.fin > r.d)) &&
      ((r.cible_type === 'professeur' && r.cible_id === e.professeur_id) || (r.cible_type === 'classe' && r.cible_id === e.classe_id) ||
       (r.cible_type === 'salle' && salle && r.cible_id === salle) || (r.cible_type === 'matiere' && r.cible_id === e.matiere_id));
    // Séances à placer : heures / bloc, le reste en une séance plus courte.
    const S = [];
    const verrous = (seancesExistantes || []).filter(x => x.verrouillee && ens.has(x.enseignement_id) && parId.has(x.creneau_id));
    for (const e of D.enseignements) {
      const total = Math.round(Number(e.heures_hebdo) || 0); if (total <= 0) continue;
      const bloc = Math.max(1, Math.min(4, e.bloc || 1)), longueurs = [];
      for (let k = 0; k < Math.floor(total / bloc); k++) longueurs.push(bloc);
      if (total % bloc) longueurs.push(total % bloc);
      const v = verrous.filter(x => x.enseignement_id === e.id);
      longueurs.forEach(L => {
        const j = v.findIndex(x => (x.duree || bloc) === L), lock = j >= 0 ? v.splice(j, 1)[0] : null;
        S.push({ k: S.length, e, L, salle: (lock && lock.salle_id) || e.salle_id || null, groupe: e.groupe_id || null, fixe: lock ? parId.get(lock.creneau_id) : null });
      });
    }
    for (const s of S) {
      s.departs = []; s.penal = new Map();
      for (const sl of slots) {
        const ch = chaine(sl.i, s.L); if (!ch) continue;
        if (ch.some(i => regles.some(r => r.obligatoire && touche(r, s.e, s.salle, slots[i])))) continue;
        s.departs.push(sl.i);
        let p = 0; ch.forEach(i => regles.forEach(r => { if (!r.obligatoire && touche(r, s.e, s.salle, slots[i])) p += (r.poids || 3) * POIDS.preference; }));
        if (p) s.penal.set(sl.i, p);
      }
      if (s.fixe != null && !s.departs.includes(s.fixe)) s.departs.push(s.fixe);
    }
    return { slots, jours, chaine, S, mx: D.max_matiere_jour || 2, parId, ens };
  }

  // ---------- État et coûts ----------
  function creerEtat(P) {
    const occ = P.slots.map(() => []), pos = P.S.map(() => -1), parCle = new Map();
    const cles = (s, jour) => [`c|${s.e.classe_id}|${jour}`].concat(s.e.professeur_id ? [`p|${s.e.professeur_id}|${jour}`] : []);
    const ajouterCle = (k, s) => { let x = parCle.get(k); if (!x) parCle.set(k, x = new Set()); x.add(s.k); };
    const conflit = (a, b) => (a.e.classe_id === b.e.classe_id && !(a.groupe && b.groupe && a.groupe !== b.groupe)) ||
      (a.e.professeur_id && a.e.professeur_id === b.e.professeur_id) || (a.salle && a.salle === b.salle);
    function bloquants(s, d) {
      const ch = P.chaine(d, s.L); if (!ch) return null; const b = new Set();
      for (const i of ch) for (const t of occ[i]) if (t !== s.k && conflit(s, P.S[t])) b.add(t);
      const jour = P.slots[d].jour; let n = s.L;
      for (const t of parCle.get(`c|${s.e.classe_id}|${jour}`) || []) { const u = P.S[t]; if (t !== s.k && u.e.matiere_id === s.e.matiere_id && u.groupe === s.groupe) n += u.L; }
      if (n > P.mx) b.add(-1);
      return b;
    }
    const possible = (s, d) => { const b = bloquants(s, d); return !!b && b.size === 0; };
    function poser(s, d) { pos[s.k] = d; P.chaine(d, s.L).forEach(i => occ[i].push(s.k)); cles(s, P.slots[d].jour).forEach(k => ajouterCle(k, s)); }
    function retirer(s) { const d = pos[s.k]; if (d < 0) return; P.chaine(d, s.L).forEach(i => { const a = occ[i]; a.splice(a.indexOf(s.k), 1); }); cles(s, P.slots[d].jour).forEach(k => parCle.get(k).delete(s.k)); pos[s.k] = -1; }
    function coutCle(k) {
      const ids = parCle.get(k); if (!ids || !ids.size) return 0;
      const rangs = new Set(), mat = new Map();
      for (const t of ids) { const s = P.S[t], ch = P.chaine(pos[t], s.L); ch.forEach(i => rangs.add(P.slots[i].rang)); const m = s.e.matiere_id + '|' + (s.groupe || ''); mat.set(m, (mat.get(m) || 0) + 1); }
      const r = [...rangs], trous = Math.max(...r) - Math.min(...r) + 1 - r.length;
      if (k[0] === 'p') return trous * POIDS.trouProf;
      let c = trous * POIDS.trouClasse; for (const n of mat.values()) if (n > 1) c += (n - 1) * POIDS.memeJour;
      if (r.length > 7) c += (r.length - 7) * POIDS.desequilibre * 3;
      return c;
    }
    const coutSeance = s => pos[s.k] < 0 ? POIDS.nonPlacee : (s.penal.get(pos[s.k]) || 0);
    function coutTotal() {
      let t = 0, d = { trous: 0, preferences: 0, nonPlacees: 0 };
      for (const k of parCle.keys()) { const c = coutCle(k); t += c; d.trous += c; }
      for (const s of P.S) { const c = coutSeance(s); t += c; if (pos[s.k] < 0) d.nonPlacees++; else d.preferences += c; }
      return { total: t, detail: d };
    }
    return { occ, pos, parCle, cles, bloquants, possible, poser, retirer, coutCle, coutSeance, coutTotal };
  }
  // Variation de coût d'un déplacement (s : de sa place actuelle vers d, ou retrait si d < 0).
  function delta(P, E, s, d) {
    const anc = E.pos[s.k], cles = new Set();
    if (anc >= 0) E.cles(s, P.slots[anc].jour).forEach(k => cles.add(k));
    if (d >= 0) E.cles(s, P.slots[d].jour).forEach(k => cles.add(k));
    let avant = E.coutSeance(s); cles.forEach(k => { avant += E.coutCle(k); });
    E.retirer(s); if (d >= 0) E.poser(s, d);
    let apres = E.coutSeance(s); cles.forEach(k => { apres += E.coutCle(k); });
    return apres - avant;  // l'état contient déjà le déplacement : à annuler par l'appelant si refusé
  }

  // ---------- Diagnostic avant génération ----------
  function diagnostiquer(D) {
    const P = preparer(D, []), msgs = [], nomP = id => ((D.professeurs || []).find(p => p.id === id) || {}).nom || 'Professeur',
      nomC = id => ((D.classes || []).find(c => c.id === id) || {}).nom || 'Classe', nomM = id => ((D.matieres || []).find(m => m.id === id) || {}).nom || 'Matière';
    const charge = new Map(); P.S.forEach(s => { [['p', s.e.professeur_id], ['c', s.e.classe_id]].forEach(([t, id]) => { if (!id) return; const k = t + '|' + id; charge.set(k, (charge.get(k) || 0) + s.L); }); });
    for (const [k, h] of charge) {
      const [t, id] = k.split('|'), libres = P.slots.filter(sl => !(D.regles || []).some(r => r.obligatoire && r.cible_type === (t === 'p' ? 'professeur' : 'classe') && r.cible_id === id &&
        (r.jour == null || r.jour === sl.jour) && (!r.debut || (sl.debut < hmin(r.fin) && sl.fin > hmin(r.debut))))).length;
      if (h > libres) msgs.push({ grave: true, texte: `${t === 'p' ? nomP(id) : nomC(id)} : ${h} h à placer pour ${libres} créneaux disponibles.` });
    }
    P.S.filter(s => !s.departs.length).forEach(s => msgs.push({ grave: true, texte: `${nomC(s.e.classe_id)} ${nomM(s.e.matiere_id)} : aucune place possible pour une séance de ${s.L} h (indisponibilités ou grille).` }));
    D.enseignements.filter(e => !(Number(e.heures_hebdo) > 0)).forEach(e => msgs.push({ grave: false, texte: `${nomC(e.classe_id)} ${nomM(e.matiere_id)} : pas d’heures par semaine indiquées, non placé.` }));
    D.enseignements.filter(e => Number(e.heures_hebdo) > 0 && !e.professeur_id).forEach(e => msgs.push({ grave: false, texte: `${nomC(e.classe_id)} ${nomM(e.matiere_id)} : pas de professeur indiqué.` }));
    D.enseignements.filter(e => Number(e.heures_hebdo) % 1).forEach(e => msgs.push({ grave: false, texte: `${nomC(e.classe_id)} ${nomM(e.matiere_id)} : ${e.heures_hebdo} h arrondies à ${Math.round(e.heures_hebdo)} h (créneaux d’une heure).` }));
    return { messages: msgs, aPlacer: P.S.length, heures: P.S.reduce((a, s) => a + s.L, 0), creneaux: P.slots.length };
  }

  // ---------- Génération ----------
  function generer(D, options = {}, progres) {
    const rnd = alea(options.graine || 12345), duree = options.dureeMs ?? 3000, t0 = Date.now();
    const P = preparer(D, options.seances || []), E = creerEtat(P);
    // Séances verrouillées d'abord (si elles se gênent entre elles, la seconde est replacée).
    P.S.filter(s => s.fixe != null).forEach(s => { if (E.possible(s, s.fixe)) E.poser(s, s.fixe); else s.fixe = null; });
    // Construction : les séances les plus contraintes d'abord, à la place la moins coûteuse.
    const ordre = P.S.filter(s => E.pos[s.k] < 0).sort((a, b) => a.departs.length - b.departs.length || b.L - a.L || rnd() - 0.5);
    for (const s of ordre) {
      let best = -1, bc = Infinity;
      for (const d of s.departs) { if (!E.possible(s, d)) continue; const c = delta(P, E, s, d); E.retirer(s); if (c + rnd() * 0.5 < bc) { bc = c; best = d; } }
      if (best >= 0) { E.poser(s, best); continue; }
      ejecter(P, E, s, rnd);
    }
    // Amélioration : recuit simulé (les contraintes restent toujours respectées).
    const mobiles = P.S.filter(s => s.fixe == null && s.departs.length);
    let T = 20, it = 0; const Tfin = 0.05;
    let cout = E.coutTotal().total, meilleur = { cout, pos: E.pos.slice() };
    while (mobiles.length && Date.now() - t0 < duree) {
      for (let b = 0; b < 200; b++) {
        it++;
        const nonPl = mobiles.filter(s => E.pos[s.k] < 0);
        const s = nonPl.length && rnd() < 0.3 ? nonPl[Math.floor(rnd() * nonPl.length)] : mobiles[Math.floor(rnd() * mobiles.length)];
        if (rnd() < 0.15 && E.pos[s.k] >= 0) {  // échange de deux séances de la même classe et de même durée
          const autres = mobiles.filter(t => t !== s && t.e.classe_id === s.e.classe_id && t.L === s.L && E.pos[t.k] >= 0); if (!autres.length) continue;
          const t = autres[Math.floor(rnd() * autres.length)], ds = E.pos[s.k], dt = E.pos[t.k];
          const avant = cout; E.retirer(s); E.retirer(t);
          if (s.departs.includes(dt) && t.departs.includes(ds) && E.possible(s, dt)) { E.poser(s, dt); if (E.possible(t, ds)) { E.poser(t, ds); const c = E.coutTotal().total; if (c <= avant || rnd() < Math.exp((avant - c) / T)) { cout = c; continue; } E.retirer(t); } E.retirer(s); }
          E.poser(s, ds); E.poser(t, dt); continue;
        }
        const d = s.departs[Math.floor(rnd() * s.departs.length)], anc = E.pos[s.k];
        if (d === anc) continue;
        if (!E.possible(s, d)) { if (anc < 0 && rnd() < 0.2) { if (ejecter(P, E, s, rnd)) cout = E.coutTotal().total; } continue; }
        const dc = delta(P, E, s, d);
        if (dc <= 0 || rnd() < Math.exp(-dc / T)) cout += dc; else { E.retirer(s); if (anc >= 0) E.poser(s, anc); }
      }
      if (cout < meilleur.cout) meilleur = { cout, pos: E.pos.slice() };
      T = Math.max(Tfin, 20 * Math.pow(Tfin / 20, (Date.now() - t0) / Math.max(1, duree)));
      if (progres && it % 2000 < 200) progres({ avance: Math.min(1, (Date.now() - t0) / Math.max(1, duree)), cout: meilleur.cout, nonPlacees: meilleur.pos.filter(x => x < 0).length });
    }
    // Remettre la meilleure solution trouvée.
    P.S.forEach(s => E.retirer(s)); P.S.forEach(s => { if (meilleur.pos[s.k] >= 0) E.poser(s, meilleur.pos[s.k]); });
    const ct = E.coutTotal(), nomC = id => ((D.classes || []).find(c => c.id === id) || {}).nom || '', nomM = id => ((D.matieres || []).find(m => m.id === id) || {}).nom || '';
    return {
      seances: P.S.filter(s => E.pos[s.k] >= 0).map(s => ({ enseignement_id: s.e.id, creneau_id: P.slots[E.pos[s.k]].id, salle_id: s.salle, duree: s.L === (s.e.bloc || 1) ? null : s.L, verrouillee: s.fixe != null })),
      nonPlacees: P.S.filter(s => E.pos[s.k] < 0).map(s => ({ enseignement_id: s.e.id, duree: s.L, texte: `${nomC(s.e.classe_id)} ${nomM(s.e.matiere_id)} (${s.L} h)` })),
      cout: ct.total, detail: ct.detail, iterations: it, dureeMs: Date.now() - t0
    };
  }
  // Placer s en déplaçant au plus une séance gênante vers une autre place libre.
  function ejecter(P, E, s, rnd) {
    const cands = s.departs.slice().sort(() => rnd() - 0.5);
    for (const d of cands) {
      const b = E.bloquants(s, d); if (!b || b.has(-1) || b.size !== 1) continue;
      const t = P.S[[...b][0]]; if (t.fixe != null) continue; const anc = E.pos[t.k];
      E.retirer(t);
      if (E.possible(s, d)) { E.poser(s, d); const alt = t.departs.filter(x => E.possible(t, x)); if (alt.length) { E.poser(t, alt[Math.floor(rnd() * alt.length)]); return true; } E.retirer(s); }
      E.poser(t, anc);
    }
    return false;
  }

  // ---------- Pour l'écran : évaluer une version et proposer les créneaux libres d'une séance ----------
  const toucheRegle = (r, s, sl) => (r.jour == null || r.jour === sl.jour) && (!r.debut || (sl.debut < hmin(r.fin) && sl.fin > hmin(r.debut))) &&
    ((r.cible_type === 'professeur' && r.cible_id === s.e.professeur_id) || (r.cible_type === 'classe' && r.cible_id === s.e.classe_id) ||
     (r.cible_type === 'salle' && s.salle && r.cible_id === s.salle) || (r.cible_type === 'matiere' && r.cible_id === s.e.matiere_id));
  function chargerVersion(D, seances) {
    const P = preparer(D, []), E = creerEtat(P), souples = (D.regles || []).filter(r => !r.obligatoire);
    P.S.length = 0; E.pos.length = 0;
    for (const x of seances) {
      const e = P.ens.get(x.enseignement_id), d = P.parId.get(x.creneau_id); if (!e || d == null) continue;
      const s = { k: P.S.length, e, L: x.duree || e.bloc || 1, salle: x.salle_id || e.salle_id || null, groupe: e.groupe_id || null, fixe: null, penal: new Map(), departs: [], id: x.id };
      const ch = P.chaine(d, s.L); if (!ch) continue;
      let p = 0; ch.forEach(i => souples.forEach(r => { if (toucheRegle(r, s, P.slots[i])) p += (r.poids || 3) * POIDS.preference; })); if (p) s.penal.set(d, p);
      P.S.push(s); E.pos.push(-1); E.poser(s, d);
    }
    return { P, E };
  }
  function evaluer(D, seances) { const { E } = chargerVersion(D, seances); const c = E.coutTotal(); return { cout: c.total - c.detail.nonPlacees * POIDS.nonPlacee, detail: c.detail }; }
  function creneauxLibres(D, seances, seanceId) {
    const { P, E } = chargerVersion(D, seances), s = P.S.find(t => t.id === seanceId); if (!s) return [];
    const obl = (D.regles || []).filter(r => r.obligatoire); E.retirer(s); const res = [];
    for (const sl of P.slots) { const ch = P.chaine(sl.i, s.L); if (!ch) continue;
      if (ch.some(i => obl.some(r => toucheRegle(r, s, P.slots[i])))) continue;
      if (E.possible(s, sl.i)) res.push(sl.id); }
    return res;
  }

  const api = { generer, diagnostiquer, evaluer, creneauxLibres, POIDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else racine.EDTSolveur = api;
  if (typeof WorkerGlobalScope !== 'undefined' && racine instanceof WorkerGlobalScope) {
    racine.onmessage = ev => { try { const r = generer(ev.data.donnees, ev.data.options, p => racine.postMessage({ type: 'progres', ...p })); racine.postMessage({ type: 'fin', resultat: r }); }
      catch (e) { racine.postMessage({ type: 'erreur', message: String(e.message || e) }); } };
  }
})(typeof self !== 'undefined' ? self : globalThis);
