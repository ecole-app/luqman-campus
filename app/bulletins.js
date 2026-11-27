// Luqmân Campus — étape 4 : appréciations et bulletins (bilans périodiques).
// Onglet « Appréciations » : par matière (professeur), appréciation générale et mention (professeur principal), banque de phrases.
// Onglet « Bulletins » : suivi du remplissage, validation, aperçu et impression (un élève ou toute la classe), réglages.
// Contenu calqué sur le bilan périodique du livret scolaire (arrêté du 31-12-2015) : éléments du programme travaillés,
// note, appréciation (acquisitions, progrès, difficultés), vie scolaire (assiduité, ponctualité), appréciation générale.
(function () {
  const { LOAD, insererOnglet } = window.LCVS;
  const { refaire, estReseau } = window.LCVS.outils;
  const O = window.LCVS.notesOutils;
  const N = O.N, { fmt, opt, aujourdhui, nomClasse } = O;
  const B = { sub: 'matiere', bsub: 'suivi', classeId: '', ensId: '', periodeId: '', statut: 'ouvert', appr: {}, moy: {}, moyPrev: {}, nr: {}, nbNotes: {},
    elements: '', data: null, prev: null, suivi: null, phrases: [], apercu: '', ouvertPhrases: null, filtrePhr: '', confirmer: null, maxAppr: 400, maxElem: 600, mentions: [], avis: {} };
  window.__LC.B = B;

  const css = document.createElement('style');
  css.textContent = `
    .ap-l { display:grid; grid-template-columns: minmax(130px,190px) 76px 1fr; gap:8px 12px; align-items:start; padding:10px 0; border-bottom:1px solid var(--bord, #e5dfcf); }
    .ap-l .ap-n { font-weight:600; } .ap-l .ap-info { font-size:12px; color:#6b6b6b; display:block; font-weight:400; }
    .ap-l textarea { width:100%; min-height:62px; resize:vertical; font:inherit; padding:8px; border-radius:10px; border:1px solid #d8d0bd; }
    .ap-l textarea:disabled { background:#f3f0e8; color:#555; }
    .ap-pied { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:4px; font-size:12px; color:#6b6b6b; }
    .ap-pied .trop { color:#e11d00; font-weight:700; } .ap-pied .ok { color:var(--ok, #2f9e5b); } .ap-pied .att { color:#b45309; } .ap-pied .err { color:#e11d00; }
    .ap-phr { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; } .ap-phr button { font-size:12px; padding:5px 9px; border-radius:999px; border:1px solid #d8d0bd; background:#fff; cursor:pointer; text-align:left; }
    .evo-h { color:#2f9e5b; font-weight:700; } .evo-b { color:#e11d00; font-weight:700; }
    .bu-suivi td.c { text-align:center; } .barre-prog { height:8px; background:#eee7d6; border-radius:4px; overflow:hidden; min-width:80px; } .barre-prog i { display:block; height:100%; background:#0b5d4b; }
    .bulletin { background:#fff; color:#111; max-width:820px; margin:0 auto 18px; padding:22px 26px; border:1px solid #e5dfcf; border-radius:6px; font-size:12.5px; line-height:1.35; }
    .bulletin h2 { font-family:'Playfair Display',serif; margin:0; font-size:20px; } .bulletin .bu-tete { display:flex; justify-content:space-between; gap:12px; border-bottom:2px solid #0b3d33; padding-bottom:8px; margin-bottom:10px; }
    .bulletin table { width:100%; border-collapse:collapse; } .bulletin th, .bulletin td { border:1px solid #cfc8b6; padding:5px 6px; vertical-align:top; text-align:left; }
    .bulletin th { background:#f1ece0; font-size:11px; text-transform:uppercase; letter-spacing:.02em; } .bulletin td.c { text-align:center; white-space:nowrap; }
    .bulletin .bu-mat { font-weight:700; } .bulletin .bu-prof, .bulletin .bu-elem { font-size:11px; color:#555; }
    .bulletin .bu-bloc { margin-top:10px; border:1px solid #cfc8b6; padding:8px 10px; } .bulletin .bu-bloc h3 { margin:0 0 4px; font-size:12px; text-transform:uppercase; letter-spacing:.03em; color:#0b3d33; }
    .bulletin .bu-sign { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-top:12px; } .bulletin .bu-sign div { border:1px solid #cfc8b6; min-height:58px; padding:6px; font-size:11px; color:#555; }
    .bulletin .bu-pied { margin-top:8px; font-size:10px; color:#777; display:flex; justify-content:space-between; }
    .bulletin .mention { display:inline-block; padding:2px 10px; border-radius:999px; background:#0b5d4b; color:#fff; font-weight:700; }
    .bulletin .note { print-color-adjust:exact; -webkit-print-color-adjust:exact; }
    .bulletin .bu-defile { overflow-x:auto; -webkit-overflow-scrolling:touch; }
    #lc-impression { display:none; }
    @media print {
      body.lc-imprime > *:not(#lc-impression) { display:none !important; }
      body.lc-imprime #lc-impression { display:block; }
      body.lc-imprime { background:#fff; }
      #lc-impression .bu-defile { overflow:visible; } #lc-impression table { min-width:0 !important; }
      #lc-impression .bulletin { border:none; border-radius:0; max-width:none; margin:0; padding:0; page-break-after:always; break-after:page; }
      #lc-impression .bulletin:last-child { page-break-after:auto; break-after:auto; }
      @page { size:A4; margin:12mm; }
    }
    @media (max-width:640px) { .ap-l { grid-template-columns: 1fr 70px; } .ap-l .ap-txt { grid-column: 1 / -1; } }
  `;
  document.head.appendChild(css);

  // ---------- Outils ----------
  const estAdm = () => !!N.droits.admin;
  const monEns = () => estAdm() || N.droits.ens.includes(B.ensId);
  const estPP = () => estAdm() || N.droits.pp.includes(B.classeId);
  const per = () => N.periodes.find(p => p.id === B.periodeId);
  const perPrec = () => { const p = per(); return p ? N.periodes.filter(x => x.numero < p.numero).pop() : null; };
  const ensDeClasse = () => S.ens.filter(x => x.classe_id === B.classeId).sort((a, b) => nomMatiere(a.matiere_id).localeCompare(nomMatiere(b.matiere_id), 'fr'));
  const elevesClasse = () => S.eleves.filter(e => e.classe_id === B.classeId).sort((a, b) => (a.nom + a.prenom).localeCompare(b.nom + b.prenom, 'fr'));
  const nomEl = e => `${e.nom} ${e.prenom}`;
  const fige = () => !estAdm() && (B.statut !== 'ouvert' || !!(per() && per().verrouillee));
  const LIB_STATUT = { ouvert: 'Ouvert à la saisie', valide: 'Validé (saisies figées)', publie: 'Publié' };
  const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
  const choisir = (liste, graine) => liste[hash(graine) % liste.length];
  const jourFr = d => d ? new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) : '';
  const valParam = (cle, def) => { const p = (B.params || []).find(x => x.cle === cle); if (!p) return def; const v = p.valeur; return typeof v === 'string' && /^-?\d+([.]\d+)?$/.test(v) ? Number(v) : v ?? def; };

  // ---------- Propositions d'appréciation (règles fixes, sans IA externe : aucune donnée ne sort de l'appli) ----------
  // Formulations neutres (sans accord masculin/féminin), à relire et compléter par le professeur.
  function proposerMatiere(e) {
    const m = B.moy[e.id], m0 = B.moyPrev[e.id], nr = B.nr[e.id] || 0, nb = B.nbNotes[e.id] || 0, g = e.id + B.ensId + B.periodeId;
    if (m == null) return nb ? '' : 'Pas assez d’évaluations sur la période pour établir un bilan chiffré.';
    const bandes = [
      [16, ['Excellent travail : les acquis sont solides et la rigueur remarquable.', 'Très bons résultats, fruit d’un travail sérieux et régulier.', 'Un trimestre remarquable : maîtrise des notions et implication constante.']],
      [14, ['Très bon trimestre : les notions sont bien maîtrisées.', 'Très bon ensemble, porté par un travail régulier.', 'Des résultats très satisfaisants et une bonne implication.']],
      [12, ['Bon trimestre : les acquis sont satisfaisants.', 'Bon ensemble ; le travail est régulier.', 'Résultats satisfaisants ; il faut maintenir cet investissement.']],
      [10, ['Ensemble correct, mais certaines notions restent fragiles.', 'Résultats justes : un travail plus approfondi permettrait de progresser.', 'Des bases correctes, à consolider par un travail plus régulier.']],
      [8, ['Résultats insuffisants : les notions essentielles doivent être retravaillées.', 'Des difficultés réelles ; il faut reprendre les leçons régulièrement.', 'Trimestre fragile : un travail plus régulier est indispensable.']],
      [-1, ['De grandes difficultés ce trimestre : un travail sérieux et régulier doit être engagé rapidement.', 'Les acquis sont très insuffisants ; il faut solliciter de l’aide et reprendre les bases.', 'Trimestre très difficile : il est urgent de se mettre au travail.']]];
    const t = [choisir(bandes.find(([s]) => m >= s)[1], g)];
    if (m0 != null && m - m0 >= 1.5) t.push(choisir(['Des progrès nets par rapport à la période précédente.', 'En nette progression : les efforts paient.'], g + 'p'));
    else if (m0 != null && m0 - m >= 1.5) t.push(choisir(['Résultats en baisse par rapport à la période précédente : il faut se ressaisir.', 'Un recul par rapport à la période précédente, à surveiller.'], g + 'b'));
    if (nr) t.push(nr > 1 ? `Attention : ${nr} travaux non rendus.` : 'Attention au travail non rendu.');
    return t.join(' ').slice(0, B.maxAppr);
  }
  function mentionProposee(el) {
    const m = el.moyenne == null ? null : Number(el.moyenne); if (m == null) return '';
    const moys = Object.values(el.resultats || {}).map(r => r.moyenne).filter(v => v != null).map(Number), mini = moys.length ? Math.min(...moys) : 0;
    const a = B.avis, m0 = B.prev ? (B.prev.eleves.find(x => x.id === el.id) || {}).moyenne : null;
    const dispo = x => B.mentions.includes(x) ? x : '';
    if (m >= a.eloges && mini >= a.elogesMin) return dispo('Éloges');
    if (m > a.felicitations && mini >= a.felicitationsMin) return dispo('Félicitations');
    if (m >= a.compliments) return dispo('Compliments');
    if (m0 != null && m - Number(m0) >= 1.5) return dispo('Encouragements');
    if (m < a.avertissement) return dispo('Avertissement travail');
    return '';
  }
  function proposerGenerale(el) {
    const m = el.moyenne == null ? null : Number(el.moyenne), g = el.id + B.periodeId;
    const m0 = B.prev ? (B.prev.eleves.find(x => x.id === el.id) || {}).moyenne : null;
    const moys = Object.entries(el.resultats || {}).filter(([, r]) => r.moyenne != null);
    const faibles = moys.filter(([, r]) => Number(r.moyenne) < N.params.bas).length;
    const t = [];
    if (m == null) t.push('Bilan à compléter : trop peu d’évaluations sur la période.');
    else if (m >= 16) t.push(choisir(['Excellent trimestre dans l’ensemble des disciplines. Toutes nos félicitations.', 'Un trimestre remarquable : travail, sérieux et résultats sont au rendez-vous.'], g));
    else if (m >= 14) t.push(choisir(['Très bon trimestre : le travail est sérieux et les résultats solides.', 'Très bon ensemble ; continuez ainsi.'], g));
    else if (m >= 12) t.push(choisir(['Bon trimestre. Le travail est régulier ; il faut viser encore plus haut.', 'Un bon ensemble, à consolider dans les disciplines les plus fragiles.'], g));
    else if (m >= 10) t.push(choisir(['Trimestre correct mais inégal : un travail plus régulier est attendu.', 'Les résultats sont justes ; l’investissement doit être renforcé.'], g));
    else t.push(choisir(['Trimestre insuffisant : une mise au travail sérieuse est indispensable.', 'Des difficultés importantes dans plusieurs disciplines : il faut réagir dès maintenant.'], g));
    if (m != null && m0 != null && m - m0 >= 1.5) t.push('Les progrès sont nets et doivent être poursuivis.');
    if (m != null && m0 != null && m0 - m >= 1.5) t.push('Les résultats sont en baisse par rapport au trimestre précédent.');
    if (faibles >= 2) t.push(`Des difficultés dans ${faibles} disciplines appellent un travail ciblé.`);
    const a = el.absences || {};
    if (a.non_justifiees >= 2) t.push('Les absences non justifiées doivent cesser.');
    else if (a.demi_journees >= 4) t.push('Les absences nombreuses pénalisent les apprentissages.');
    if (a.retards >= 3) t.push('La ponctualité doit être améliorée.');
    return t.join(' ').slice(0, B.maxAppr);
  }

  // ---------- File d'attente hors ligne des appréciations ----------
  const FILE_A = 'lc_file_appr';
  const lireFile = () => { try { return JSON.parse(localStorage.getItem(FILE_A)) || []; } catch { return []; } };
  const ecrireFile = f => { try { localStorage.setItem(FILE_A, JSON.stringify(f)); } catch { /* stockage indisponible */ } };
  let envoi = false;
  async function envoyerFile() {
    if (envoi || !navigator.onLine || !lireFile().length) return; envoi = true;
    try {
      for (const cle of [...new Set(lireFile().map(x => x.ens + '|' + x.per))]) {
        const lot = lireFile().filter(x => x.ens + '|' + x.per === cle); const [ens, p] = cle.split('|');
        const r = await sb.rpc('saisir_appreciations', { p_ens: ens, p_periode: p, p_lignes: lot.map(x => ({ eleve_id: x.eleve, texte: x.texte })) });
        if (r.error && estReseau(r.error)) break;
        ecrireFile(lireFile().filter(x => !lot.some(y => y.ens === x.ens && y.per === x.per && y.eleve === x.eleve && y.texte === x.texte)));
        dire(r.error ? 'err' : 'ok', r.error ? 'Des appréciations gardées sur l’appareil n’ont pas pu être envoyées : ' + r.error.message : `${lot.length} appréciation${lot.length > 1 ? 's' : ''} envoyée${lot.length > 1 ? 's' : ''} au retour du réseau.`);
      }
    } finally { envoi = false; }
  }
  window.addEventListener('online', () => envoyerFile());
  setInterval(() => { if (lireFile().length) envoyerFile(); }, 20000);

  // ---------- Chargements ----------
  async function chargerCommun() {
    await O.chargerBase();
    const [pr] = await Promise.all([
      sb.from('parametres').select('cle,valeur').in('cle', ['appreciation_longueur_max', 'elements_programme_longueur_max', 'mentions_bulletin', 'etablissement_nom', 'etablissement_adresse', 'bulletin_afficher_rang',
        'avis_seuil_avertissement', 'avis_compliments', 'avis_felicitations', 'avis_felicitations_min_matiere', 'avis_eloges', 'avis_eloges_min_matiere'])]);
    if (!pr.error) B.params = pr.data || [];
    B.maxAppr = Number(valParam('appreciation_longueur_max', 400)); B.maxElem = Number(valParam('elements_programme_longueur_max', 600));
    const m = valParam('mentions_bulletin', []); B.mentions = Array.isArray(m) ? m : [];
    B.avis = { avertissement: Number(valParam('avis_seuil_avertissement', 10)), compliments: Number(valParam('avis_compliments', 14)), felicitations: Number(valParam('avis_felicitations', 16)),
      felicitationsMin: Number(valParam('avis_felicitations_min_matiere', 10)), eloges: Number(valParam('avis_eloges', 18)), elogesMin: Number(valParam('avis_eloges_min_matiere', 16)) };
    if (!B.classeId || !S.classes.some(c => c.id === B.classeId)) B.classeId = N.classeId || (S.classes[0] || {}).id || '';
    if (!B.ensId || !ensDeClasse().some(x => x.id === B.ensId)) B.ensId = (ensDeClasse().find(x => N.droits.ens.includes(x.id)) || ensDeClasse()[0] || {}).id || '';
    if (!B.periodeId || !per()) { const j = aujourdhui(); B.periodeId = (N.periodes.find(x => j >= x.debut && j <= x.fin) || N.periodes.filter(x => x.debut <= j).pop() || N.periodes[0] || {}).id || ''; }
    const st = await sb.from('bulletins_periode').select('statut').eq('classe_id', B.classeId).eq('periode_id', B.periodeId);
    B.statut = (!st.error && st.data && st.data[0]) ? st.data[0].statut : 'ouvert';
  }
  async function chargerAppreciations() {
    await envoyerFile(); await chargerCommun();
    if (B.sub === 'matiere') return chargerMatiere();
    if (B.sub === 'generale') return chargerDonnees();
    const r = await sb.from('banque_phrases').select('*').order('categorie').order('texte'); B.phrases = r.data || [];
  }
  async function chargerMatiere() {
    B.appr = {}; B.moy = {}; B.moyPrev = {}; B.nr = {}; B.nbNotes = {}; B.elements = '';
    if (!B.ensId || !B.periodeId) return;
    const pp = perPrec();
    const [a, ep, m, m0, ev, ph] = await Promise.all([
      sb.from('appreciations').select('eleve_id,texte').eq('enseignement_id', B.ensId).eq('periode_id', B.periodeId),
      sb.from('elements_programme').select('texte').eq('enseignement_id', B.ensId).eq('periode_id', B.periodeId),
      sb.rpc('moyennes_matieres', { p_classe: B.classeId, p_periode: B.periodeId }),
      pp ? sb.rpc('moyennes_matieres', { p_classe: B.classeId, p_periode: pp.id }) : Promise.resolve({ data: [] }),
      sb.from('evaluations').select('id').eq('enseignement_id', B.ensId).eq('periode_id', B.periodeId),
      sb.from('banque_phrases').select('*').order('categorie')]);
    if (a.error) throw new Error(estReseau(a.error) ? 'Pas de connexion : les appréciations ont besoin du réseau.' : a.error.message);
    (a.data || []).forEach(x => { B.appr[x.eleve_id] = x.texte; });
    lireFile().filter(x => x.ens === B.ensId && x.per === B.periodeId).forEach(x => { B.appr[x.eleve] = x.texte; });
    B.elements = (ep.data && ep.data[0] && ep.data[0].texte) || '';
    (m.data || []).filter(x => x.enseignement_id === B.ensId).forEach(x => { B.moy[x.eleve_id] = Number(x.moyenne); B.nbNotes[x.eleve_id] = x.nb_notes; });
    (m0.data || []).filter(x => x.enseignement_id === B.ensId).forEach(x => { B.moyPrev[x.eleve_id] = Number(x.moyenne); });
    B.phrases = ph.data || [];
    const ids = (ev.data || []).map(x => x.id);
    if (ids.length) { const n = await sb.from('notes').select('eleve_id,statut').in('evaluation_id', ids); (n.data || []).forEach(x => { if (x.statut === 'non_rendu') B.nr[x.eleve_id] = (B.nr[x.eleve_id] || 0) + 1; if (!(x.eleve_id in B.nbNotes)) B.nbNotes[x.eleve_id] = 0; }); }
  }
  async function chargerDonnees() {
    B.data = null; B.prev = null;
    if (!B.classeId || !B.periodeId) return;
    const pp = perPrec();
    const [d, d0] = await Promise.all([sb.rpc('donnees_bulletins', { p_classe: B.classeId, p_periode: B.periodeId }),
      pp ? sb.rpc('donnees_bulletins', { p_classe: B.classeId, p_periode: pp.id }) : Promise.resolve({ data: null })]);
    if (d.error) throw new Error(estReseau(d.error) ? 'Pas de connexion : les bulletins ont besoin du réseau.' : d.error.message);
    B.data = d.data; B.prev = d0.error ? null : d0.data;
  }
  async function chargerBulletins() {
    await chargerCommun();
    if (B.bsub === 'reglages') return;
    if (B.bsub === 'suivi') { const r = await sb.rpc('suivi_appreciations', { p_classe: B.classeId, p_periode: B.periodeId }); if (r.error) throw new Error(r.error.message); B.suivi = r.data; return; }
    await chargerDonnees();
    if (B.data && !B.data.eleves.some(e => e.id === B.apercu)) B.apercu = (B.data.eleves[0] || {}).id || '';
  }
  const recharger = async fn => { try { await fn(); } catch (e) { dire('err', String(e.message || e)); } refaire(); };

  // ---------- Sélecteurs ----------
  function selecteurs(avecMatiere, fn) {
    return `<div class="barre">
      <select id="a-classe">${S.classes.map(c => opt(c.id, c.nom, c.id === B.classeId)).join('')}</select>
      ${avecMatiere ? `<select id="a-ens">${ensDeClasse().map(x => opt(x.id, nomMatiere(x.matiere_id) + (N.droits.ens.includes(x.id) ? ' ★' : ''), x.id === B.ensId)).join('') || opt('', 'Aucune matière')}</select>` : ''}
      <select id="a-per">${N.periodes.map(p => opt(p.id, p.libelle + (p.verrouillee ? ' 🔒' : ''), p.id === B.periodeId)).join('')}</select>
      <span class="tag ${B.statut === 'ouvert' ? '' : 'ok'}">${LIB_STATUT[B.statut]}</span></div>
      ${fige() ? '<div class="msg info">Bulletin validé ou période verrouillée : les saisies sont figées. Seule la direction peut encore corriger.</div>' : ''}`;
  }
  function liensSelecteurs(fn) {
    $('#a-classe').onchange = e => { B.classeId = e.target.value; B.ensId = ''; recharger(fn); };
    const en = $('#a-ens'); if (en) en.onchange = e => { B.ensId = e.target.value; recharger(fn); };
    $('#a-per').onchange = e => { B.periodeId = e.target.value; recharger(fn); };
  }

  // ---------- Onglet Appréciations ----------
  function vueAppreciations() {
    if (!S.classes.length) return `<div class="carte"><h2>Appréciations</h2><p class="doux">Crée d’abord des classes et des élèves.</p></div>`;
    const nav = `<div class="sousnav">${[['matiere', 'Par matière'], ['generale', 'Appréciation générale'], ['phrases', 'Banque de phrases']].map(([k, l]) => `<button data-asub="${k}" class="${B.sub === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    let corps;
    if (B.sub === 'phrases') corps = vuePhrases();
    else if (B.sub === 'generale') corps = selecteurs(false) + vueGenerale();
    else corps = selecteurs(true) + vueMatiere();
    return `${msg()}<div class="carte"><h2>Appréciations</h2>${nav}${corps}</div>`;
  }
  const compteur = (n, max) => `<span class="${n > max ? 'trop' : ''}">${n}/${max}</span>`;
  function chipsPhrases(id) {
    if (B.ouvertPhrases !== id) return '';
    const cats = [...new Set(B.phrases.map(p => p.categorie))];
    return `<div class="ap-phr">${cats.map(c => `<strong style="width:100%;font-size:12px">${esc(c)}</strong>${B.phrases.filter(p => p.categorie === c).map(p => `<button data-phr="${p.id}" data-pour="${id}">${esc(p.texte)}</button>`).join('')}`).join('')}</div>`;
  }
  function vueMatiere() {
    if (!B.ensId) return '<p class="doux">Aucune matière pour cette classe.</p>';
    const ro = !monEns() || fige(), els = elevesClasse();
    const faits = els.filter(e => (B.appr[e.id] || '').trim()).length;
    const lignes = els.map(e => {
      const m = B.moy[e.id], m0 = B.moyPrev[e.id], t = B.appr[e.id] || '';
      const evo = m != null && m0 != null ? (m - m0 >= 1 ? `<span class="evo-h" title="Période précédente : ${fmt(m0)}">↗</span>` : m0 - m >= 1 ? `<span class="evo-b" title="Période précédente : ${fmt(m0)}">↘</span>` : '') : '';
      return `<div class="ap-l" data-e="${e.id}"><span class="ap-n">${esc(nomEl(e))}<span class="ap-info">${B.nbNotes[e.id] ? B.nbNotes[e.id] + ' note' + (B.nbNotes[e.id] > 1 ? 's' : '') : 'aucune note'}${B.nr[e.id] ? ' · ' + B.nr[e.id] + ' non rendu' + (B.nr[e.id] > 1 ? 's' : '') : ''}</span></span>
        <span>${m != null ? O.pastille(m) : '<span class="note vide">—</span>'} ${evo}</span>
        <div class="ap-txt"><textarea data-appr="${e.id}" ${ro ? 'disabled' : ''} maxlength="${B.maxAppr + 50}" placeholder="Acquisitions, progrès, difficultés…">${esc(t)}</textarea>
          <div class="ap-pied">${compteur(t.length, B.maxAppr)}${ro ? '' : ` <button class="lien" data-prop="${e.id}">💡 Proposer</button> <button class="lien" data-ouvphr="${e.id}">📋 Phrases</button>`}<span class="etat"></span></div>${ro ? '' : chipsPhrases(e.id)}</div></div>`;
    }).join('');
    return `<div class="carte" style="background:#faf7ef"><h3>Principaux éléments du programme travaillés</h3>
        <textarea id="a-elem" ${ro ? 'disabled' : ''} rows="2" style="width:100%" placeholder="Ex. : course de durée, badminton, sauvetage aquatique… (identique pour toute la classe)">${esc(B.elements)}</textarea>
        <div class="ap-pied">${compteur(B.elements.length, B.maxElem)}<span class="etat" id="a-elem-etat"></span></div></div>
      <div class="barre"><span class="petit"><strong>${faits}/${els.length}</strong> appréciations saisies${ro && !monEns() ? ' · lecture seule (matière d’un collègue)' : ''}</span>
        ${ro ? '' : '<button class="b sec" id="a-prop-tous">💡 Proposer pour les cases vides</button>'}</div>
      <p class="petit">Enregistrement automatique. « Proposer » rédige un brouillon à partir des notes de la période (moyenne, évolution, travaux non rendus) : à relire et personnaliser. Aucune donnée n’est envoyée hors de l’appli.</p>
      <div id="a-lignes">${lignes}</div>`;
  }
  function vueGenerale() {
    if (!estPP()) return '<p class="doux">L’appréciation générale est rédigée par le professeur principal de la classe ou la direction.</p>';
    if (!B.data) return '<p class="doux">Chargement…</p>';
    const ro = fige(), D = B.data;
    const lignes = D.eleves.map(el => {
      const prop = mentionProposee(el), det = D.enseignements.map(en => { const r = el.resultats[en.id] || {}; return `<li><strong>${esc(en.matiere)}</strong> ${r.moyenne != null ? O.pastille(Number(r.moyenne)) : '—'} ${esc(r.appreciation || '')}</li>`; }).join('');
      const a = el.absences || {};
      return `<div class="carte" data-g="${el.id}" style="background:#faf7ef"><div class="barre"><strong>${esc(el.nom + ' ' + el.prenom)}</strong>
          <span>Moyenne ${el.moyenne != null ? O.pastille(Number(el.moyenne)) : '—'}${el.rang ? ` · rang ${el.rang}` : ''}</span>
          <span class="petit">${a.demi_journees || 0} demi-journée${a.demi_journees > 1 ? 's' : ''} d’absence (${a.non_justifiees || 0} non justifiée${a.non_justifiees > 1 ? 's' : ''}) · ${a.retards || 0} retard${a.retards > 1 ? 's' : ''}</span></div>
        <details><summary class="petit">Voir les appréciations des matières</summary><ul class="petit" style="margin:6px 0">${det}</ul></details>
        <textarea data-gen="${el.id}" ${ro ? 'disabled' : ''} rows="3" style="width:100%" placeholder="Appréciation générale du conseil de classe">${esc(el.generale || '')}</textarea>
        <div class="ap-pied">${compteur((el.generale || '').length, B.maxAppr)}
          <label>Mention <select data-mention="${el.id}" ${ro ? 'disabled' : ''}>${opt('', 'Aucune', !el.mention)}${B.mentions.map(m => opt(m, m, el.mention === m)).join('')}</select></label>
          ${prop && prop !== el.mention ? `<span>Proposée : <strong>${esc(prop)}</strong>${ro ? '' : ` <button class="lien" data-appmention="${el.id}" data-m="${esc(prop)}">appliquer</button>`}</span>` : ''}
          ${ro ? '' : `<button class="lien" data-propg="${el.id}">💡 Proposer</button>`}<span class="etat"></span></div></div>`;
    }).join('');
    return `<p class="petit">La mention proposée découle des seuils réglés (Bulletins › Réglages). La décision finale revient au conseil de classe.</p>${lignes || '<p class="doux">Aucun élève.</p>'}`;
  }
  function vuePhrases() {
    const cats = [...new Set(B.phrases.map(p => p.categorie))].sort((a, b) => a.localeCompare(b, 'fr'));
    const liste = cats.map(c => `<h3>${esc(c)}</h3>${B.phrases.filter(p => p.categorie === c).map(p => `<div class="barre" style="justify-content:space-between"><span>${esc(p.texte)}${p.partage ? '' : ' <span class="tag">Privée</span>'}</span>
      ${estAdm() || p.created_by ? `<button class="b danger" data-delphr="${p.id}">${B.confirmer === p.id ? 'Confirmer' : 'Retirer'}</button>` : ''}</div>`).join('')}`).join('');
    return `<p class="petit">Phrases réutilisables dans toutes les appréciations (bouton 📋). Ajoute les tiennes ; coche « privée » pour les garder pour toi.</p>
      <div class="barre"><input id="ph-cat" placeholder="Catégorie (ex. Progrès)" style="width:170px" list="ph-cats"><datalist id="ph-cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
        <input id="ph-txt" placeholder="Phrase" style="flex:1;min-width:220px"><label class="petit"><input type="checkbox" id="ph-priv"> privée</label><button class="b" id="ph-ajout">Ajouter</button></div>${liste}`;
  }

  async function enregistrerAppr(eleve, texte, etat) {
    if (etat) { etat.className = 'etat'; etat.textContent = '…'; }
    if (texte.length > B.maxAppr) { if (etat) { etat.className = 'etat err'; etat.textContent = `Trop long (${B.maxAppr} caractères maximum)`; } return; }
    const r = await sb.rpc('saisir_appreciations', { p_ens: B.ensId, p_periode: B.periodeId, p_lignes: [{ eleve_id: eleve, texte }] });
    if (r.error && estReseau(r.error)) {
      const f = lireFile().filter(x => !(x.ens === B.ensId && x.per === B.periodeId && x.eleve === eleve)); f.push({ ens: B.ensId, per: B.periodeId, eleve, texte }); ecrireFile(f);
      B.appr[eleve] = texte; if (etat) { etat.className = 'etat att'; etat.textContent = '⏳ gardée sur l’appareil'; } return;
    }
    if (r.error) { if (etat) { etat.className = 'etat err'; etat.textContent = r.error.message; } return; }
    B.appr[eleve] = texte; if (etat) { etat.className = 'etat ok'; etat.textContent = '✓'; setTimeout(() => { if (etat.textContent === '✓') etat.textContent = ''; }, 1800); }
  }
  async function enregistrerGen(eleve, etat) {
    const t = $(`[data-gen="${eleve}"]`).value, m = $(`[data-mention="${eleve}"]`).value;
    if (etat) { etat.className = 'etat'; etat.textContent = '…'; }
    if (t.length > B.maxAppr) { if (etat) { etat.className = 'etat err'; etat.textContent = `Trop long (${B.maxAppr} caractères maximum)`; } return; }
    const r = await sb.rpc('saisir_appreciation_generale', { p_eleve: eleve, p_periode: B.periodeId, p_texte: t, p_mention: m || null });
    if (r.error) { if (etat) { etat.className = 'etat err'; etat.textContent = estReseau(r.error) ? 'Pas de connexion : non enregistrée.' : r.error.message; } return; }
    const el = B.data.eleves.find(x => x.id === eleve); if (el) { el.generale = t.trim() || null; el.mention = m || null; }
    if (etat) { etat.className = 'etat ok'; etat.textContent = '✓'; setTimeout(() => { if (etat.textContent === '✓') etat.textContent = ''; }, 1800); }
  }
  function liensAppreciations() {
    document.querySelectorAll('[data-asub]').forEach(b => b.onclick = () => { B.sub = b.dataset.asub; S.message = null; recharger(chargerAppreciations); });
    if (B.sub !== 'phrases') liensSelecteurs(chargerAppreciations);
    if (B.sub === 'matiere') {
      const el = $('#a-elem'); if (el) el.onchange = async () => {
        const et = $('#a-elem-etat'); if (el.value.length > B.maxElem) { et.className = 'etat err'; et.textContent = 'Trop long'; return; }
        const r = await sb.rpc('saisir_elements_programme', { p_ens: B.ensId, p_periode: B.periodeId, p_texte: el.value });
        et.className = r.error ? 'etat err' : 'etat ok'; et.textContent = r.error ? (estReseau(r.error) ? 'Pas de connexion : non enregistré.' : r.error.message) : '✓'; if (!r.error) B.elements = el.value.trim();
      };
      document.querySelectorAll('[data-appr]').forEach(ta => {
        const pied = ta.parentElement.querySelector('.ap-pied'), etat = pied.querySelector('.etat'); let minuteur;
        ta.oninput = () => { pied.firstElementChild.outerHTML = compteur(ta.value.length, B.maxAppr); clearTimeout(minuteur); minuteur = setTimeout(() => { if (ta.value !== (B.appr[ta.dataset.appr] || '')) enregistrerAppr(ta.dataset.appr, ta.value, etat); }, 1500); };
        ta.onchange = () => { clearTimeout(minuteur); if (ta.value !== (B.appr[ta.dataset.appr] || '')) enregistrerAppr(ta.dataset.appr, ta.value, etat); };
      });
      document.querySelectorAll('[data-prop]').forEach(b => b.onclick = () => {
        const e = S.eleves.find(x => x.id === b.dataset.prop), ta = $(`[data-appr="${e.id}"]`), p = proposerMatiere(e);
        if (!p) return; ta.value = ta.value.trim() ? ta.value.trim() + ' ' + p : p; ta.dispatchEvent(new Event('input')); ta.dispatchEvent(new Event('change'));
      });
      const tous = $('#a-prop-tous'); if (tous) tous.onclick = async () => {
        const vides = elevesClasse().filter(e => !(B.appr[e.id] || '').trim()).map(e => ({ e, t: proposerMatiere(e) })).filter(x => x.t);
        if (!vides.length) { dire('info', 'Aucune case vide à proposer.'); return refaire(); }
        const r = await sb.rpc('saisir_appreciations', { p_ens: B.ensId, p_periode: B.periodeId, p_lignes: vides.map(x => ({ eleve_id: x.e.id, texte: x.t })) });
        if (r.error) dire('err', estReseau(r.error) ? 'Pas de connexion : rien n’a été enregistré.' : r.error.message);
        else { vides.forEach(x => { B.appr[x.e.id] = x.t; }); dire('ok', `${vides.length} brouillon${vides.length > 1 ? 's' : ''} d’appréciation proposé${vides.length > 1 ? 's' : ''} : relis-les et personnalise-les.`); }
        refaire();
      };
      document.querySelectorAll('[data-ouvphr]').forEach(b => b.onclick = () => { B.ouvertPhrases = B.ouvertPhrases === b.dataset.ouvphr ? null : b.dataset.ouvphr; refaire(); });
      document.querySelectorAll('[data-phr]').forEach(b => b.onclick = () => {
        const p = B.phrases.find(x => x.id === b.dataset.phr), ta = $(`[data-appr="${b.dataset.pour}"]`);
        ta.value = (ta.value.trim() ? ta.value.trim() + ' ' : '') + p.texte; ta.dispatchEvent(new Event('input')); ta.dispatchEvent(new Event('change'));
      });
    }
    if (B.sub === 'generale') {
      document.querySelectorAll('[data-gen]').forEach(ta => {
        const etat = ta.nextElementSibling.querySelector('.etat'); let minuteur;
        ta.oninput = () => { ta.nextElementSibling.firstElementChild.outerHTML = compteur(ta.value.length, B.maxAppr); clearTimeout(minuteur); minuteur = setTimeout(() => enregistrerGen(ta.dataset.gen, etat), 1500); };
        ta.onchange = () => { clearTimeout(minuteur); enregistrerGen(ta.dataset.gen, etat); };
      });
      document.querySelectorAll('[data-mention]').forEach(s => s.onchange = () => enregistrerGen(s.dataset.mention, s.closest('.ap-pied').querySelector('.etat')));
      document.querySelectorAll('[data-appmention]').forEach(b => b.onclick = async () => { $(`[data-mention="${b.dataset.appmention}"]`).value = b.dataset.m; await enregistrerGen(b.dataset.appmention, null); refaire(); });
      document.querySelectorAll('[data-propg]').forEach(b => b.onclick = () => {
        const el = B.data.eleves.find(x => x.id === b.dataset.propg), ta = $(`[data-gen="${el.id}"]`), p = proposerGenerale(el);
        ta.value = ta.value.trim() ? ta.value.trim() + ' ' + p : p; ta.dispatchEvent(new Event('input')); ta.dispatchEvent(new Event('change'));
      });
    }
    if (B.sub === 'phrases') {
      $('#ph-ajout').onclick = async () => {
        const texte = $('#ph-txt').value.trim(), categorie = $('#ph-cat').value.trim() || 'Divers'; if (!texte) { dire('err', 'Écris la phrase.'); return refaire(); }
        const r = await sb.from('banque_phrases').insert({ categorie, texte, partage: !$('#ph-priv').checked });
        if (r.error) dire('err', r.error.message); else dire('ok', 'Phrase ajoutée.'); recharger(chargerAppreciations);
      };
      document.querySelectorAll('[data-delphr]').forEach(b => b.onclick = async () => {
        if (B.confirmer !== b.dataset.delphr) { B.confirmer = b.dataset.delphr; return refaire(); }
        B.confirmer = null; const r = await sb.from('banque_phrases').delete().eq('id', b.dataset.delphr).select('id');
        if (r.error) dire('err', r.error.message); else if (!(r.data || []).length) dire('err', 'Tu ne peux retirer que tes propres phrases.'); else dire('ok', 'Phrase retirée.'); recharger(chargerAppreciations);
      });
    }
  }

  // ---------- Bulletin (rendu imprimable) ----------
  function htmlBulletin(D, el) {
    const lignes = D.enseignements.map(en => { const r = el.resultats[en.id] || {};
      return `<tr><td><div class="bu-mat">${esc(en.matiere)}</div>${en.professeur ? `<div class="bu-prof">${esc(en.professeur)}</div>` : ''}${Number(en.coefficient) !== 1 ? `<div class="bu-prof">coef. ${fmt(en.coefficient)}</div>` : ''}</td>
        <td class="bu-elem">${esc(en.elements || '')}</td>
        <td class="c">${r.moyenne != null ? O.pastille(Number(r.moyenne)) : '—'}</td>
        <td class="c">${en.moyenne_classe != null ? fmt(en.moyenne_classe) : '—'}<div class="bu-prof">${en.min != null ? fmt(en.min) + ' – ' + fmt(en.max) : ''}</div></td>
        <td>${esc(r.appreciation || '')}</td></tr>`; }).join('');
    const a = el.absences || {}, comp = (el.competences || []).filter(c => c.niveau);
    return `<article class="bulletin">
      <div class="bu-tete"><div><h2>${esc(D.etablissement.nom || 'Établissement')}</h2><div class="bu-prof">${esc(D.etablissement.adresse || '')}</div></div>
        <div style="text-align:right"><strong>Bilan périodique · ${esc(D.periode.libelle)}</strong><div>Année ${esc(D.periode.annee || '')}</div><div class="bu-prof">du ${jourFr(D.periode.debut)} au ${jourFr(D.periode.fin)}</div></div></div>
      <div class="barre" style="justify-content:space-between;margin:0 0 8px"><span><strong style="font-size:15px">${esc(el.nom.toUpperCase() + ' ' + el.prenom)}</strong>${el.date_naissance ? ` · né(e) le ${jourFr(el.date_naissance)}` : ''}</span>
        <span>Classe : <strong>${esc(D.classe.nom)}</strong>${D.classe.prof_principal ? ` · Professeur principal : ${esc(D.classe.prof_principal)}` : ''}</span></div>
      <div class="bu-defile"><table style="min-width:640px"><thead><tr><th style="width:17%">Enseignement</th><th style="width:22%">Principaux éléments du programme travaillés</th><th style="width:8%">Moyenne élève</th><th style="width:10%">Classe (min – max)</th><th>Acquisitions, progrès et difficultés éventuelles</th></tr></thead>
        <tbody>${lignes}</tbody>
        <tfoot><tr><td colspan="2"><strong>Moyenne générale</strong></td><td class="c">${el.moyenne != null ? O.pastille(Number(el.moyenne)) : '—'}</td><td class="c">${D.moyenne_classe != null ? fmt(D.moyenne_classe) : '—'}</td><td>${D.afficher_rang && el.rang ? `Rang : ${el.rang} / ${D.eleves.length}` : ''}</td></tr></tfoot></table></div>
      ${comp.length ? `<div class="bu-bloc"><h3>Composantes du socle commun évaluées sur la période</h3><div class="petit">${comp.map(c => `<span style="margin-right:12px"><strong>${esc(c.code)}</strong> ${esc(N.niveaux[c.niveau - 1] || c.niveau)}</span>`).join('')}</div></div>` : ''}
      <div class="bu-bloc"><h3>Vie scolaire</h3>Demi-journées d’absence : <strong>${a.demi_journees || 0}</strong> (dont ${a.non_justifiees || 0} non justifiée${a.non_justifiees > 1 ? 's' : ''}) · Retards : <strong>${a.retards || 0}</strong></div>
      <div class="bu-bloc"><h3>Appréciation générale${el.mention ? ` · <span class="mention">${esc(el.mention)}</span>` : ''}</h3>${esc(el.generale || '')}</div>
      <div class="bu-sign"><div>Le professeur principal</div><div>La direction</div><div>Signature des responsables légaux</div></div>
      <div class="bu-pied"><span>Bilan établi d’après le contenu du bilan périodique du livret scolaire (arrêté du 31 décembre 2015).</span><span>Édité le ${new Date().toLocaleDateString('fr-FR')}${D.statut === 'ouvert' ? ' · PROVISOIRE' : ''}</span></div></article>`;
  }
  function imprimer(html) {
    let z = document.getElementById('lc-impression'); if (!z) { z = document.createElement('div'); z.id = 'lc-impression'; document.body.appendChild(z); }
    z.innerHTML = html; document.body.classList.add('lc-imprime');
    const fin = () => { document.body.classList.remove('lc-imprime'); window.removeEventListener('afterprint', fin); };
    window.addEventListener('afterprint', fin); setTimeout(() => { window.print(); setTimeout(fin, 500); }, 50);
  }

  // ---------- Onglet Bulletins ----------
  function vueBulletins() {
    if (!S.classes.length) return `<div class="carte"><h2>Bulletins</h2><p class="doux">Crée d’abord des classes et des élèves.</p></div>`;
    const onglets = [['suivi', 'Suivi du remplissage'], ['apercu', 'Aperçu et impression']].concat(estAdm() ? [['reglages', 'Réglages']] : []);
    const nav = `<div class="sousnav">${onglets.map(([k, l]) => `<button data-bsub="${k}" class="${B.bsub === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    let corps;
    if (B.bsub === 'reglages' && estAdm()) corps = vueReglagesB();
    else if (B.bsub === 'apercu') corps = selecteurs(false) + vueApercu();
    else corps = selecteurs(false) + vueSuivi();
    return `${msg()}<div class="carte"><h2>Bulletins</h2>${nav}${corps}</div>`;
  }
  function vueSuivi() {
    const s = B.suivi; if (!s) return '<p class="doux">Chargement…</p>';
    const pc = (n, t) => t ? Math.round(100 * n / t) : 0;
    const lignes = s.matieres.map(m => `<tr><td><strong>${esc(m.matiere)}</strong>${m.professeur ? `<div class="petit">${esc(m.professeur)}</div>` : ''}</td>
      <td class="c">${m.appreciations}/${s.eleves}</td><td><div class="barre-prog"><i style="width:${pc(m.appreciations, s.eleves)}%"></i></div></td><td class="c">${m.elements ? '✓' : '<span class="tag err">manquants</span>'}</td></tr>`).join('');
    const total = s.matieres.reduce((a, m) => a + m.appreciations, 0), attendu = s.matieres.length * s.eleves;
    const actions = estAdm() ? `<div class="barre">${s.statut === 'ouvert' ? '<button class="b" data-statut="valide">✔ Valider les bulletins (fige les saisies)</button>' : '<button class="b sec" data-statut="ouvert">↺ Rouvrir la saisie</button>'}
      ${s.statut === 'valide' ? '<button class="b" data-statut="publie">Publier (prêt pour les familles)</button>' : ''}<span class="petit">L’espace familles ouvrira en phase 2 : « publié » prépare cette diffusion.</span></div>` : '';
    return `<div class="stat"><span>Appréciations des matières : <strong>${total}/${attendu}</strong></span><span>Appréciations générales : <strong>${s.generales}/${s.eleves}</strong></span></div>${actions}
      <div class="tablewrap"><table class="bu-suivi"><tr><th>Matière</th><th>Appréciations</th><th></th><th>Éléments du programme</th></tr>${lignes}</table></div>`;
  }
  function vueApercu() {
    if (!estPP()) return '<p class="doux">Les bulletins sont consultables par le professeur principal de la classe et la direction.</p>';
    const D = B.data; if (!D) return '<p class="doux">Chargement…</p>';
    if (!D.eleves.length) return '<p class="doux">Aucun élève dans cette classe.</p>';
    const el = D.eleves.find(e => e.id === B.apercu) || D.eleves[0];
    return `<div class="barre"><select id="b-eleve">${D.eleves.map(e => opt(e.id, e.nom + ' ' + e.prenom, e.id === el.id)).join('')}</select>
        <button class="b" id="b-imp1">🖨 Imprimer ce bulletin</button><button class="b sec" id="b-impc">🖨 Imprimer toute la classe (${D.eleves.length})</button>
        <span class="petit">Pour un PDF : choisis « Enregistrer au format PDF » dans la fenêtre d’impression.</span></div>
      ${D.statut === 'ouvert' ? '<div class="msg info">Bulletins encore ouverts à la saisie : l’impression porte la mention « PROVISOIRE ».</div>' : ''}
      <div id="b-rendu">${htmlBulletin(D, el)}</div>`;
  }
  function vueReglagesB() {
    const v = (k, d) => esc(valParam(k, d));
    return `<p class="petit">Réglages des bulletins, réservés à la direction.</p>
      <div class="carte" style="background:#faf7ef"><h3>En-tête</h3><div class="barre"><input id="g-nom" value="${v('etablissement_nom', '')}" placeholder="Nom de l’établissement" style="flex:1"><input id="g-adr" value="${v('etablissement_adresse', '')}" placeholder="Adresse" style="flex:1"></div></div>
      <div class="carte" style="background:#faf7ef"><h3>Contenu</h3><div class="barre">
        <label class="petit">Appréciation : <input id="g-max" inputmode="numeric" style="width:70px" value="${B.maxAppr}"> caractères max</label>
        <label class="petit">Éléments du programme : <input id="g-maxe" inputmode="numeric" style="width:70px" value="${B.maxElem}"> caractères max</label>
        <label class="petit"><input type="checkbox" id="g-rang" ${valParam('bulletin_afficher_rang', true) === true || valParam('bulletin_afficher_rang', true) === 'true' ? 'checked' : ''}> Afficher le rang</label></div></div>
      <div class="carte" style="background:#faf7ef"><h3>Mentions</h3><p class="petit">Une par ligne.</p><textarea id="g-mentions" rows="6" style="width:100%">${esc(B.mentions.join('\n'))}</textarea>
        <h3>Seuils de la mention proposée (moyenne générale)</h3><div class="barre">
        <label class="petit">Éloges ≥ <input id="g-elo" style="width:60px" value="${fmt(B.avis.eloges)}"> et toutes matières ≥ <input id="g-elom" style="width:60px" value="${fmt(B.avis.elogesMin)}"></label>
        <label class="petit">Félicitations &gt; <input id="g-fel" style="width:60px" value="${fmt(B.avis.felicitations)}"> et toutes matières ≥ <input id="g-felm" style="width:60px" value="${fmt(B.avis.felicitationsMin)}"></label>
        <label class="petit">Compliments ≥ <input id="g-com" style="width:60px" value="${fmt(B.avis.compliments)}"></label>
        <label class="petit">Avertissement travail &lt; <input id="g-ave" style="width:60px" value="${fmt(B.avis.avertissement)}"></label></div></div>
      <button class="b" id="g-enreg">Enregistrer les réglages</button>`;
  }
  function liensBulletins() {
    document.querySelectorAll('[data-bsub]').forEach(b => b.onclick = () => { B.bsub = b.dataset.bsub; S.message = null; recharger(chargerBulletins); });
    if (B.bsub !== 'reglages') liensSelecteurs(chargerBulletins);
    document.querySelectorAll('[data-statut]').forEach(b => b.onclick = async () => {
      const r = await sb.rpc('changer_statut_bulletin', { p_classe: B.classeId, p_periode: B.periodeId, p_statut: b.dataset.statut });
      if (r.error) dire('err', r.error.message); else dire('ok', { valide: 'Bulletins validés : les saisies des professeurs sont figées.', ouvert: 'Saisie rouverte.', publie: 'Bulletins publiés.' }[b.dataset.statut]);
      recharger(chargerBulletins);
    });
    const se = $('#b-eleve'); if (se) se.onchange = () => { B.apercu = se.value; refaire(); };
    const i1 = $('#b-imp1'); if (i1) i1.onclick = () => imprimer(htmlBulletin(B.data, B.data.eleves.find(e => e.id === B.apercu) || B.data.eleves[0]));
    const ic = $('#b-impc'); if (ic) ic.onclick = () => imprimer(B.data.eleves.map(e => htmlBulletin(B.data, e)).join(''));
    const g = $('#g-enreg'); if (g) g.onclick = async () => {
      const n = id => Number(String($(id).value).replace(',', '.'));
      const max = n('#g-max'), maxe = n('#g-maxe'), mentions = $('#g-mentions').value.split('\n').map(x => x.trim()).filter(Boolean);
      const seuils = [n('#g-elo'), n('#g-elom'), n('#g-fel'), n('#g-felm'), n('#g-com'), n('#g-ave')];
      if (!(max >= 50 && max <= 2000) || !(maxe >= 50 && maxe <= 3000)) { dire('err', 'Longueurs : entre 50 et 2000 caractères.'); return refaire(); }
      if (seuils.some(x => !(x >= 0 && x <= 20))) { dire('err', 'Les seuils sont des moyennes entre 0 et 20.'); return refaire(); }
      if (!mentions.length) { dire('err', 'Indique au moins une mention.'); return refaire(); }
      const maj = (cle, valeur) => sb.from('parametres').update({ valeur }).eq('cle', cle);
      const rs = await Promise.all([maj('etablissement_nom', $('#g-nom').value.trim()), maj('etablissement_adresse', $('#g-adr').value.trim()), maj('appreciation_longueur_max', max), maj('elements_programme_longueur_max', maxe),
        maj('bulletin_afficher_rang', $('#g-rang').checked), maj('mentions_bulletin', mentions), maj('avis_eloges', seuils[0]), maj('avis_eloges_min_matiere', seuils[1]), maj('avis_felicitations', seuils[2]),
        maj('avis_felicitations_min_matiere', seuils[3]), maj('avis_compliments', seuils[4]), maj('avis_seuil_avertissement', seuils[5])]);
      const e = rs.find(r => r.error); dire(e ? 'err' : 'ok', e ? e.error.message : 'Réglages des bulletins enregistrés.'); recharger(chargerBulletins);
    };
  }

  // ---------- Branchement ----------
  insererOnglet('appreciations', 'Appréciations', 'competences');
  insererOnglet('bulletins', 'Bulletins', 'appreciations');
  Object.assign(VUES, { appreciations: vueAppreciations, bulletins: vueBulletins });
  Object.assign(LIENS, { appreciations: liensAppreciations, bulletins: liensBulletins });
  Object.assign(LOAD, { appreciations: chargerAppreciations, bulletins: chargerBulletins });
})();
