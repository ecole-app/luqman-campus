// Tests du générateur d'emploi du temps (Node, sans navigateur). Lancer : npm run test:edt
await import('../../app/edt-solveur.js');
const S = globalThis.EDTSolveur;
let n = 0, ko = 0; const ok = (nom, c, info = '') => { n++; if (!c) ko++; console.log(c ? '  OK  ' : '  ÉCHEC', nom, c ? '' : info); };

// Collège fictif : grille de départ, 4 classes, horaires du collège (arrondis à l'heure), professeurs partagés.
const H = [['08:00', '08:55'], ['09:00', '09:55'], ['10:10', '11:05'], ['11:10', '12:05'], ['13:30', '14:25'], ['14:30', '15:25'], ['15:35', '16:30']];
const creneaux = []; [1, 2, 4, 5].forEach(j => H.forEach(([d, f]) => creneaux.push({ id: `c${j}-${d}`, jour: j, debut: d, fin: f }))); H.slice(0, 4).forEach(([d, f]) => creneaux.push({ id: `c3-${d}`, jour: 3, debut: d, fin: f }));
const classes = ['6e A', '5e A', '4e A', '3e A'].map((nom, i) => ({ id: 'cl' + i, nom, niveau: nom.slice(0, 2) }));
const mat = { FR: 'Français', MA: 'Mathématiques', AN: 'Anglais', ES: 'Espagnol', HG: 'Histoire-géographie', SV: 'SVT', PC: 'Physique-chimie', TE: 'Technologie', EPS: 'EPS', AP: 'Arts plastiques', MU: 'Musique', AR: 'Arabe' };
const matieres = Object.entries(mat).map(([id, nom]) => ({ id, code: id, nom }));
const profs = { FR: ['pFR1', 'pFR2'], MA: ['pMA1', 'pMA2'], AN: ['pAN'], ES: ['pES'], HG: ['pHG'], SV: ['pSC'], PC: ['pSC'], TE: ['pTE'], EPS: ['pEPS'], AP: ['pAP'], MU: ['pMU'], AR: ['pAR'] };
const professeurs = [...new Set(Object.values(profs).flat())].map(id => ({ id, nom: 'Prof ' + id }));
const heures = { '6e': { FR: 5, MA: 4, AN: 4, HG: 3, SV: 2, TE: 2, EPS: 4, AP: 1, MU: 1, AR: 2 }, 'c4': { FR: 4, MA: 4, AN: 3, ES: 2, HG: 3, SV: 1, PC: 2, TE: 1, EPS: 3, AP: 1, MU: 1, AR: 2 } };
const salles = [{ id: 'gym', nom: 'Gymnase', type: 'gymnase' }];
const enseignements = []; classes.forEach((c, i) => Object.entries(heures[c.niveau === '6e' ? '6e' : 'c4']).forEach(([m, h]) => enseignements.push({
  id: `${c.id}-${m}`, classe_id: c.id, matiere_id: m, professeur_id: profs[m][i % profs[m].length], heures_hebdo: h,
  bloc: m === 'EPS' ? 2 : 1, groupe_id: null, salle_id: null })));
const base = () => ({ creneaux, classes, matieres, professeurs, salles, enseignements: enseignements.map(e => ({ ...e })), regles: [], max_matiere_jour: 2 });

// Vérificateur indépendant des contraintes obligatoires.
function verifier(D, seances) {
  const sl = [...D.creneaux].sort((a, b) => a.jour - b.jour || a.debut.localeCompare(b.debut)), idx = new Map(sl.map((c, i) => [c.id, i])), m = t => +t.slice(0, 2) * 60 + +t.slice(3);
  const err = [], occ = new Map(), parJour = new Map();
  for (const s of seances) { const e = D.enseignements.find(x => x.id === s.enseignement_id), L = s.duree || e.bloc; let i = idx.get(s.creneau_id);
    for (let k = 0; k < L; k++) { const c = sl[i + k]; if (!c || (k && (c.jour !== sl[i].jour || m(c.debut) - m(sl[i + k - 1].fin) > 20))) { err.push('bloc ' + e.id); break; }
      for (const [t, v] of [['c', e.classe_id], ['p', e.professeur_id], ['s', s.salle_id || e.salle_id]]) { if (!v) continue; const key = t + v + c.id; if (occ.has(key)) err.push(`conflit ${t} ${v} ${c.id}`); occ.set(key, 1); }
      for (const r of D.regles.filter(r => r.obligatoire)) if ((r.jour == null || r.jour === c.jour) && (!r.debut || (m(c.debut) < m(r.fin) && m(c.fin) > m(r.debut))) &&
        ((r.cible_type === 'professeur' && r.cible_id === e.professeur_id) || (r.cible_type === 'classe' && r.cible_id === e.classe_id) || (r.cible_type === 'salle' && r.cible_id === (s.salle_id || e.salle_id)))) err.push('indispo ' + e.id + ' ' + c.id);
      const kj = e.classe_id + e.matiere_id + c.jour; parJour.set(kj, (parJour.get(kj) || 0) + 1); } }
  for (const [k, v] of parJour) if (v > D.max_matiere_jour) err.push('matiere/jour ' + k);
  return err;
}
const heuresPlacees = (D, r) => r.seances.reduce((a, s) => a + (s.duree || D.enseignements.find(e => e.id === s.enseignement_id).bloc), 0);
const trousClasses = (D, seances) => { let t = 0; const sl = [...D.creneaux].sort((a, b) => a.jour - b.jour || a.debut.localeCompare(b.debut));
  D.classes.forEach(c => [1, 2, 3, 4, 5].forEach(j => { const jr = sl.filter(x => x.jour === j), occ = new Set();
    seances.forEach(s => { const e = D.enseignements.find(x => x.id === s.enseignement_id); if (e.classe_id !== c.id) return; const i = jr.findIndex(x => x.id === s.creneau_id); if (i < 0) return; for (let k = 0; k < (s.duree || e.bloc); k++) occ.add(i + k); });
    if (occ.size) { const r = [...occ]; t += Math.max(...r) - Math.min(...r) + 1 - r.length; } })); return t; };

// 1) Cas normal
let D = base(); let r = S.generer(D, { graine: 7, dureeMs: 2500 });
const total = D.enseignements.reduce((a, e) => a + e.heures_hebdo, 0);
ok('tout est placé (' + total + ' h pour 4 classes)', r.nonPlacees.length === 0 && heuresPlacees(D, r) === total, JSON.stringify(r.nonPlacees));
ok('aucune contrainte obligatoire violée (vérificateur indépendant)', verifier(D, r.seances).length === 0, verifier(D, r.seances).slice(0, 5).join(' | '));
ok('EPS 3 h en cycle 4 = une séance de 2 h + une d’1 h', r.seances.filter(s => s.enseignement_id === 'cl1-EPS').map(s => s.duree || 2).sort().join(',') === '1,2');
const tc = trousClasses(D, r.seances); ok('peu de trous pour les classes (≤ 2 au total)', tc <= 2, 'trous = ' + tc);
// 2) Gymnase seulement le mercredi pour l'EPS des 4e et 3e (séances de 2 h)
D = base(); D.regles.push(...[1, 2, 4, 5].map(j => ({ cible_type: 'salle', cible_id: 'gym', jour: j, debut: null, fin: null, obligatoire: true, poids: 3 })));
D.enseignements.filter(e => e.matiere_id === 'EPS' && /cl[23]/.test(e.classe_id)).forEach(e => { e.salle_id = 'gym'; e.heures_hebdo = 2; });
r = S.generer(D, { graine: 3, dureeMs: 2000 });
const gym = r.seances.filter(s => /cl[23]-EPS/.test(s.enseignement_id)).map(s => s.creneau_id);
ok('gymnase réservé au mercredi : EPS 4e et 3e placées le mercredi, jamais en même temps', r.nonPlacees.length === 0 && gym.length === 2 && gym.every(c => c.startsWith('c3-')) && verifier(D, r.seances).length === 0, JSON.stringify([gym, r.nonPlacees]));
// 3) Préférence respectée quand c'est possible
D = base(); D.regles.push({ cible_type: 'professeur', cible_id: 'pAN', jour: 5, debut: '12:00', fin: '17:00', obligatoire: false, poids: 5 });
r = S.generer(D, { graine: 11, dureeMs: 2000 });
ok('préférence « pas le vendredi après-midi » respectée pour le professeur d’anglais', !r.seances.some(s => s.enseignement_id.endsWith('-AN') && /^c5-1[3-5]/.test(s.creneau_id)) && r.nonPlacees.length === 0);
// 4) Indisponibilité obligatoire d'une classe
D = base(); D.regles.push({ cible_type: 'classe', cible_id: 'cl0', jour: 4, debut: null, fin: null, obligatoire: true, poids: 3 });
r = S.generer(D, { graine: 5, dureeMs: 2000 });
ok('classe indisponible le jeudi : aucun cours de 6e le jeudi', !r.seances.some(s => s.enseignement_id.startsWith('cl0-') && s.creneau_id.startsWith('c4-')) && verifier(D, r.seances).length === 0, JSON.stringify(r.nonPlacees));
// 5) Séance verrouillée gardée
D = base(); const lock = { enseignement_id: 'cl2-MA', creneau_id: 'c5-15:35', verrouillee: true };
r = S.generer(D, { graine: 9, dureeMs: 1500, seances: [lock] });
ok('séance verrouillée gardée à sa place', r.seances.some(s => s.enseignement_id === 'cl2-MA' && s.creneau_id === 'c5-15:35' && s.verrouillee) && verifier(D, r.seances).length === 0);
// 6) Impossible : diagnostic et séances non placées, mais toujours sans conflit
D = base(); D.enseignements.filter(e => e.professeur_id === 'pFR1').forEach(e => { e.heures_hebdo = 17; });
const dg = S.diagnostiquer(D); r = S.generer(D, { graine: 2, dureeMs: 1500 });
ok('surcharge détectée avant génération (professeur avec plus d’heures que de créneaux)', dg.messages.some(m => m.grave && /Prof pFR1 : 34 h à placer pour 32 créneaux/.test(m.texte)), JSON.stringify(dg.messages));
ok('surcharge : des séances restent non placées, aucune contrainte violée', r.nonPlacees.length >= 2 && verifier(D, r.seances).length === 0, r.nonPlacees.length);
// 7) Déterministe et créneaux libres pour un déplacement à la main
D = base(); const a = S.generer(D, { graine: 42, dureeMs: 0 }), b = S.generer(D, { graine: 42, dureeMs: 0 });
ok('même graine = même emploi du temps (sans amélioration)', JSON.stringify(a.seances) === JSON.stringify(b.seances));
const vs = a.seances.map((s, i) => ({ ...s, id: 's' + i })), cible = vs.find(s => s.enseignement_id === 'cl0-FR');
const libres = S.creneauxLibres(D, vs, cible.id);
const occupe6e = vs.filter(s => s.enseignement_id.startsWith('cl0-') && s !== cible).map(s => s.creneau_id);
ok('créneaux libres proposés : ni la classe ni le professeur déjà occupés', libres.length > 0 && !libres.some(c => occupe6e.includes(c)) && libres.every(c => verifier(D, vs.map(s => s === cible ? { ...s, creneau_id: c } : s)).length === 0));
const ev = S.evaluer(D, vs); ok('évaluation d’une version enregistrée (coût sans pénalité de non-placement)', typeof ev.cout === 'number' && ev.detail.nonPlacees === 0);
console.log(`${n - ko}/${n} tests du générateur réussis`); process.exit(ko ? 1 : 0);
