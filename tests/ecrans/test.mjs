// Tests des écrans : l'appli dans Chrome (format téléphone) avec un faux Supabase en mémoire (données fictives).
// Lancer : npm run test:ecrans  (Chrome requis ; chemin modifiable avec la variable CHROME).
import puppeteer from 'puppeteer-core';
import { readFileSync, existsSync } from 'fs';
import { createServer } from 'http';
import { join, extname } from 'path';
import { tmpdir } from 'os';
const RACINE = new URL('../../', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const serveur = createServer((q, r) => { let p = join(RACINE, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (p.endsWith('/')) p += 'index.html';
  if (!existsSync(p)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' }); r.end(readFileSync(p)); }).listen(8765);
const CAP = f => join(tmpdir(), f);
const MOCK = readFileSync(new URL('./mock-supabase.js', import.meta.url), 'utf8');
const BASE = 'http://localhost:8765/app/';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const erreurs = [];
page.on('pageerror', e => erreurs.push('JS: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_|Failed to load resource/.test(m.text())) erreurs.push('console: ' + m.text()); });
await page.setRequestInterception(true);
page.on('request', r => {
  const u = r.url();
  if (u.includes('vendor/supabase-')) return r.respond({ status: 200, contentType: 'application/javascript', body: MOCK });
  if (u.includes('fonts.g')) return r.respond({ status: 200, contentType: 'text/css', body: '' });
  r.continue();
});
const w = ms => new Promise(r => setTimeout(r, ms));
let n = 0, ko = 0;
const ok = (nom, cond, info = '') => { n++; if (!cond) ko++; console.log(cond ? '  OK  ' : '  ÉCHEC', nom, cond ? '' : info); };
const clic = async sel => { await page.$eval(sel, b => b.click()); await w(250); };
const texte = () => page.$eval('#vue', v => v.innerText);
const onglet = async k => { await clic(`#nav [data-k="${k}"]`); await w(300); };

await page.goto(BASE, { waitUntil: 'networkidle0' });
await w(500);
const onglets = await page.$$eval('#nav button', b => b.map(x => x.dataset.k));
ok('tous les onglets sont là', ['appel', 'suivi', 'fiche', 'pun', 'incidents', 'tel', 'infirmerie', 'tdb', 'eleves', 'classes', 'groupes', 'calendrier', 'notes', 'competences', 'appreciations', 'bulletins'].every(k => onglets.includes(k)), onglets.join(','));

// --- Appel en ligne ---
await clic('#v-fictifs'); await w(300);
ok('cours fictifs créés', (await page.$$('[data-ouvrir]')).length === 8);
await page.screenshot({ path: CAP('1-cours-du-jour.png') });
await clic('[data-ouvrir]'); await w(300);
ok('appel ouvert : 8 élèves', (await page.$$('.eleve')).length === 8);
const st = async (i, s) => { await page.$$eval('.eleve', (els, i, s) => els[i].querySelector(`[data-st="${s}"]`).click(), i, s); await w(300); };
await st(0, 'absent'); await st(1, 'retard'); await st(2, 'sortie');
ok('formulaire de sortie affiché', !!(await page.$('#v-aut')));
await page.type('#v-aut', 'M. le Directeur'); await page.type('#v-rec', 'Le père'); await clic('#v-ok-sortie'); await w(300);
await clic('[data-obs]'); await page.type('#v-otexte', 'Travail non fait'); await page.$eval('#v-oconf', c => c.click()); await clic('#v-ok-obs');
ok('observation confidentielle ajoutée', (await page.evaluate(() => __DB.observations[0]?.confidentielle)) === true);
await page.screenshot({ path: CAP('2-appel.png') });
await clic('#v-valider'); await w(300);
ok('appel validé avec récapitulatif', /Absents : 1 · Retards : 1 · Sorties : 1/.test(await texte()), await texte());
ok('après validation : boutons « Corriger »', (await page.$$('[data-corr]')).length === 8);
await clic('[data-corr]'); await page.select('#v-cst', 'retard'); await clic('#v-ok-corr');
ok('correction sans motif refusée', /motif/.test(await texte()));
await page.type('#v-cmotif', 'Erreur de saisie'); await clic('#v-ok-corr'); await w(200);
ok('correction enregistrée', /Corrigé : Erreur de saisie/.test(await texte()));
await clic('#v-retour');

// --- Gestion d'un cours : annulation, remplaçant ---
await clic('[data-gerer]'); await w(300);
await clic('[data-annuler]'); ok('annulation sans motif refusée', /motif/.test(await texte()));
await page.type('#v-motif-annul', 'Professeur absent'); await clic('[data-annuler]'); await w(200);
ok('cours annulé affiché', /Annulé : Professeur absent/.test(await texte()));
const ids = await page.$$eval('[data-gerer]', b => b.map(x => x.dataset.gerer));
await clic(`[data-gerer="${ids[2]}"]`); await w(300); await page.select('#v-remp', 'p2'); await clic(`[data-remp="${ids[2]}"]`); await w(200);
ok('remplaçant affiché', /Remplacé par Julie Martin/.test(await texte()));

// --- Appel hors ligne ---
const ouvrables = await page.$$eval('[data-ouvrir]', b => b.map(x => x.dataset.ouvrir));
await clic(`[data-ouvrir="${ouvrables[3]}"]`); await w(300);
await page.setOfflineMode(true); await w(300);
ok('bandeau hors ligne', /Hors ligne/.test(await page.$eval('.hl', b => b.hidden ? '' : b.textContent)));
await st(4, 'absent'); await st(5, 'retard');
ok('saisies en attente', (await page.evaluate(() => JSON.parse(localStorage.getItem('lc_file')).length)) === 2);
ok('étiquette « en attente d’envoi »', /En attente d’envoi/.test(await texte()));
await clic('#v-valider'); await w(300);
ok('validation hors ligne acceptée', /hors ligne, envoi au retour du réseau/.test(await texte()), await texte());
await page.screenshot({ path: CAP('3-hors-ligne.png') });
await page.setOfflineMode(false); await w(2500);
const apres = await page.evaluate(id => ({ file: JSON.parse(localStorage.getItem('lc_file') || '[]').length, abs: __DB.presences.filter(p => p.cours_id === id && p.statut !== 'present').map(p => p.statut + (p.saisie_hors_ligne ? '*' : '')), valide: !!__DB.appels.find(a => a.cours_id === id)?.valide_a }), ouvrables[3]);
ok('retour du réseau : tout est envoyé (2 saisies + validation)', apres.file === 0 && apres.abs.length === 2 && apres.abs.every(x => x.endsWith('*')) && apres.valide, JSON.stringify(apres));

// --- Ouverture de l'appli sans réseau (copie gardée sur l'appareil) ---
await page.evaluate(async m => { const c = await caches.open('lc-app-v12'); await c.put('http://localhost:8765/app/vendor/supabase-2.119.2.js', new Response(m, { headers: { 'Content-Type': 'application/javascript' } })); }, MOCK);
await page.setOfflineMode(true);
const dbAvant = await page.evaluate(() => JSON.stringify(__DB));
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {}); await w(1500);
await page.screenshot({ path: CAP('6-rouvert-hors-ligne.png') });
const recharge = await page.evaluate(() => ({ vue: document.querySelector('#vue').innerText.slice(0, 200), sw: !!navigator.serviceWorker.controller, cours: document.querySelectorAll('[data-ouvrir]').length, bandeau: document.querySelector('.hl') && !document.querySelector('.hl').hidden }));
ok('appli rouverte hors ligne : les cours du jour s’affichent', recharge.cours >= 7 && recharge.bandeau, JSON.stringify(recharge));
await page.setOfflineMode(false); await page.setBypassServiceWorker(true);
await page.goto(BASE, { waitUntil: 'networkidle0' }); await w(400);
await page.evaluate(d => { const o = JSON.parse(d); Object.keys(o).forEach(k => { __DB[k].length = 0; __DB[k].push(...o[k]); }); }, dbAvant);
await page.evaluate(() => { S.eleves = __DB.eleves; S.classes = __DB.classes; window.__LC.V.pret_appel = false; dessiner(); }); await w(300);

// --- Suivi du jour : justification ---
await onglet('suivi');
ok('suivi : absences du jour listées', /Absences, retards, sorties/.test(await texte()) && (await page.$$('[data-justif]')).length >= 1);
await clic('[data-justif]'); await page.type('#j-motif', 'Malade'); await page.$eval('#j-recu', c => c.click()); await clic('#j-ok'); await w(300);
ok('absence justifiée', /Justifiée · justificatif/.test(await texte()));
ok('élèves à surveiller affichés', /4 retards/.test(await texte()));

// --- Fiche élève ---
await clic('[data-fiche]'); await w(400);
ok('fiche élève ouverte', /Fiche élève/.test(await texte()) && /Trimestre 1/.test(await texte()), (await texte()).slice(0, 300));
await page.select('#a-type', 'rendez_vous');
await page.$eval('#a-debut', (i, v) => { i.value = v; }, new Date(Date.now() + 86400000).toISOString().slice(0, 11) + '08:00');
await page.$eval('#a-fin', (i, v) => { i.value = v; }, new Date(Date.now() + 86400000).toISOString().slice(0, 11) + '10:00');
await page.type('#a-motif', 'Orthodontiste'); await clic('#a-ajout'); await w(300);
ok('absence prévue enregistrée', /Orthodontiste/.test(await texte()));
await page.screenshot({ path: CAP('4-fiche.png'), fullPage: true });

// --- Punitions et retenues ---
await onglet('pun');
await page.select('#p-eleve', await page.$eval('#p-eleve option:nth-child(2)', o => o.value));
await page.type('#p-type', 'Retenue'); await page.type('#p-motif', 'Insolence'); await clic('#p-ajout');
ok('retenue sans heures refusée', /nombre d’heures/.test(await texte()));
await page.select('#p-eleve', await page.$eval('#p-eleve option:nth-child(2)', o => o.value));
await page.type('#p-type', 'Retenue'); await page.type('#p-duree', '2'); await page.type('#p-motif', 'Insolence'); await clic('#p-ajout'); await w(200);
ok('retenue demandée à placer', /Retenues à placer[\s\S]*2 h · Insolence/.test(await texte()));
await page.$eval('#s-jour', (i, v) => { i.value = v; }, new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10));
await page.type('#s-salle', 'Salle 3'); await clic('#s-ajout'); await w(200);
await clic('[data-planifier]'); await w(200);
ok('retenue placée sur la séance', /1 élève\(s\)/.test(await texte()));
await clic('[data-ouvrir-seance]'); await clic('[data-pointer][data-v="present"]'); await w(200);
ok('retenue pointée : faite', (await page.evaluate(() => __DB.punitions[0].statut)) === 'faite');
await page.select('#p-nature', 'sanction');
ok('sanction : choix dans l’échelle', await page.$eval('#p-type-s', s => s.style.display !== 'none' && s.options.length === 6));

// --- Incidents ---
await onglet('incidents');
await page.type('#i-lieu', 'Cour'); await page.type('#i-desc', 'Bousculade'); await page.select('#i-eleve', await page.$eval('#i-eleve option:nth-child(2)', o => o.value)); await clic('#i-plus');
ok('brouillon conservé après ajout d’élève', (await page.$eval('#i-desc', t => t.value)) === 'Bousculade');
await clic('#i-ok'); await w(300);
ok('incident enregistré avec l’élève', /Bousculade/.test(await texte()) && /Auteur/.test(await texte()));
await clic('[data-sanctionner]'); await w(200);
ok('sanction prononcée depuis l’incident', (await page.evaluate(() => __DB.punitions.filter(p => p.nature === 'sanction').length)) === 1);

// --- Infirmerie ---
await onglet('infirmerie');
await page.select('#n-eleve', await page.$eval('#n-eleve option:nth-child(2)', o => o.value)); await page.type('#n-motif', 'Mal de tête'); await clic('#n-ok'); await w(300);
ok('arrivée à l’infirmerie', /Arrivé à/.test(await texte()));
await page.select('[data-suite]', 'recupere_famille'); await clic('[data-depart]'); await w(200);
ok('départ sans « récupéré par » refusé', /qui est venu/.test(await texte()));
await page.select('[data-suite]', 'recupere_famille'); await page.type('[data-recup]', 'La mère'); await clic('[data-depart]'); await w(300);
ok('départ enregistré', /Récupéré par la famille · La mère/.test(await texte()));

// --- Calendrier, groupes, tableau de bord, téléphones ---
await onglet('calendrier');
await page.$eval('#c-du', i => { i.value = '2026-12-19'; }); await page.$eval('#c-au', i => { i.value = '2027-01-04'; }); await page.type('#c-motif', 'Vacances de Noël'); await clic('#c-ok'); await w(200);
ok('fermeture ajoutée', /19\/12\/2026 → 04\/01\/2027/.test(await texte()));
await onglet('groupes');
await page.select('#g-classe', await page.$eval('#g-classe option:nth-child(2)', o => o.value)); await w(200);
await page.type('#g-nom', 'Groupe 1'); await clic('#g-ok'); await w(200);
await clic('[data-ouvrir-g]'); await page.$$eval('[data-membre]', c => c[0].click()); await w(300);
ok('groupe créé avec un élève', /1 élève\(s\)/.test(await texte()));
await onglet('tdb');
ok('tableau de bord : taux par classe', /12,5 %/.test(await texte()));
await clic('#t-export'); await w(300);
ok('export du relevé sans erreur', /ligne\(s\) exportée/.test(await texte()), await texte());
await onglet('tel');
await page.select('#v-classe-tel', await page.$eval('#v-classe-tel option:nth-child(2)', o => o.value)); await w(200);
await clic('[data-dep]'); await w(200);
ok('téléphone déposé', /Au coffre depuis/.test(await texte()));
// --- Étape 3 : notes et compétences ---
await onglet('notes'); await w(300);
ok('notes : sélecteurs classe, matière et période', !!(await page.$('#n-classe')) && !!(await page.$('#n-ens')) && !!(await page.$('#n-per')));
ok('notes : aucune évaluation au départ', /Aucune évaluation/.test(await texte()));
await clic('#e-nouvelle');
await page.type('#e-titre', 'Contrôle 1'); await page.$eval('#e-date', i => { i.value = '2026-10-12'; });
await page.$eval('[data-comp]', c => c.click()); await clic('#e-creer'); await w(400);
ok('évaluation créée dans le bon trimestre, saisie ouverte avec 8 élèves', /Évaluation créée dans Trimestre 1/.test(await texte()) && (await page.$$('#n-lignes .nl')).length === 8, await texte());
const saisie = async (i, txt) => { await page.$$eval('#n-lignes .nl .ni', (els, i, txt) => { els[i].value = txt; els[i].dispatchEvent(new Event('change', { bubbles: true })); }, i, txt); await w(250); };
const puce = async (i, k) => { await page.$$eval('#n-lignes .nl', (els, i, k) => els[i].querySelector(`[data-ch="${k}"]`).click(), i, k); await w(250); };
const ligne = i => page.$$eval('#n-lignes .nl', (els, i) => els[i].innerText, i);
await saisie(0, '19'); await saisie(1, '5'); await saisie(2, '12,5'); await saisie(3, 'abs'); await puce(4, 'non_rendu'); await puce(5, 'dispense');
const lignesBD = await page.evaluate(() => __DB.notes.map(n => n.statut + ':' + n.valeur).sort().join(','));
ok('notes enregistrées avec virgule, absent, non rendu, dispensé', lignesBD === 'absent:null,dispense:null,non_rendu:null,note:12.5,note:19,note:5', lignesBD);
ok('19 → pastille jaune pétillant, 5 → rouge écarlate, 12,5 → neutre', await page.evaluate(() => {
  const l = [...document.querySelectorAll('#n-lignes .nl')]; const c = i => l[i].querySelector('.np .note');
  const haut = getComputedStyle(c(0)), bas = getComputedStyle(c(1));
  return c(0).classList.contains('haut') && /linear-gradient/.test(haut.backgroundImage) && haut.animationName === 'lc-brille'
    && c(1).classList.contains('bas') && bas.backgroundColor === 'rgb(225, 29, 0)' && !c(2).classList.contains('haut') && !c(2).classList.contains('bas'); }));
ok('élève absent : puce « Abs » active, « Abs » dans le champ', /Abs/.test(await ligne(3)) && await page.$$eval('#n-lignes .nl', els => els[3].querySelector('[data-ch="absent"]').classList.contains('on')));
await saisie(6, '25'); await saisie(7, 'abc');
ok('note au-dessus du barème ou illisible : message, rien enregistré', /entre 0 et 20/.test(await ligne(6)) && /n’est pas une note/.test(await ligne(7)) && (await page.evaluate(() => __DB.notes.length)) === 6);
ok('statistiques : moyenne, min, max', /Moyenne/.test(await page.$eval('#n-barre', b => b.innerText)) && /12[,.]17/.test(await page.$eval('#n-barre', b => b.innerText)), await page.$eval('#n-barre', b => b.innerText));
await page.$$eval('#n-lignes .nl', els => els[0].querySelector('[data-com]').click()); await w(150);
await page.type('#n-lignes .nl .com', 'Très bon travail'); await page.$eval('#n-lignes .nl .com', c => c.dispatchEvent(new Event('change', { bubbles: true }))); await w(250);
ok('commentaire sur une note', (await page.evaluate(() => __DB.notes.find(n => Number(n.valeur) === 19).commentaire)) === 'Très bon travail');
await page.screenshot({ path: CAP('6-saisie-notes.png') });
await page.$eval('#m-titre', i => { i.value = 'Contrôle 1 bis'; }); await clic('#m-ok'); await w(300);
ok('évaluation renommée', (await page.evaluate(() => __DB.evaluations[0].titre)) === 'Contrôle 1 bis');
await clic('#s-retour'); await w(200);
ok('liste : évaluation avec ses notées et sa compétence', /Contrôle 1 bis/.test(await texte()) && /3\/8|4\/8/.test(await texte()) && /1 compétence/.test(await texte()), await texte());

// Relevé de classe : moyennes, rang, verrouillage
await page.$$eval('[data-vue="releve"]', b => b[0].click()); await w(400);
ok('relevé : l’élève à 19 est premier avec une pastille jaune, moyenne de classe affichée', await page.evaluate(() => {
  const r = [...document.querySelectorAll('.rel tr')].find(t => /Amrani/.test(t.innerText)); return !!r && !!r.querySelector('.note.haut') && /Moyenne de la classe/.test(document.querySelector('.rel').innerText) && /\b1\b/.test(r.innerText); }), await texte());
await clic('#r-csv'); await w(200);
await clic('#r-verrou'); await w(300);
ok('période verrouillée depuis le relevé', /verrouillée/.test(await texte()) && await page.evaluate(() => __DB.periodes[0].verrouillee === true));
await page.$$eval('[data-vue="evals"]', b => b[0].click()); await w(400);
await clic('[data-saisir]'); await w(200); await saisie(7, '3');
ok('période verrouillée : la saisie est refusée avec le message du serveur', /Période verrouillée/.test(await ligne(7)), await ligne(7));
await page.$$eval('[data-vue="releve"]', b => b[0].click()); await w(400); await clic('#r-verrou'); await w(200);
ok('période déverrouillée', await page.evaluate(() => __DB.periodes[0].verrouillee === false));

// Compétences
await onglet('competences'); await w(400);
ok('compétences : l’évaluation avec compétence est proposée', !!(await page.$('#c-eval')) && (await page.$$('.niv')).length === 8, await texte());
await page.$eval('.niv button[data-n="3"]', b => b.click()); await w(250);
ok('niveau 3 enregistré', await page.evaluate(() => __DB.acquisitions.length === 1 && __DB.acquisitions[0].niveau === 3));
await page.$eval('.niv button[data-n="3"]', b => b.click()); await w(250);
ok('même niveau touché une seconde fois : effacé', await page.evaluate(() => __DB.acquisitions.length === 0));
await page.$eval('.niv button[data-n="4"]', b => b.click()); await w(250);
await page.$$eval('[data-sub="bilan"]', b => b[0].click()); await w(400);
ok('bilan : niveau proposé 4 pour l’élève évalué', /4/.test(await page.$eval('table .nv', n => n.innerText)));
await page.$eval('[data-bil]', s => { s.value = '1'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await w(400);
ok('bilan corrigé à la main : ✎ affiché, niveau 1 retenu', await page.evaluate(() => __DB.bilans_competences.length === 1 && /✎/.test(document.querySelector('#vue').innerText) && document.querySelector('table .nv').innerText.trim() === '1'));
await page.$$eval('[data-sub="catalogue"]', b => b[0].click()); await w(300);
await page.type('#k-code', 'X1'); await page.type('#k-lib', 'Compétence propre au collège'); await clic('#k-ajout'); await w(300);
ok('catalogue : compétence ajoutée', /Compétence propre au collège/.test(await texte()));
ok('catalogue : composantes officielles marquées avec leur source, ajout local marqué non officiel', await page.evaluate(() => document.querySelectorAll('#vue a[href*="education.gouv.fr"]').length >= 8 && /non officielle/.test(document.querySelector('#vue').innerText) && /décret n° 2015-372/.test(document.querySelector('#vue').innerText)));
await page.$$eval('[data-actif]', b => b[b.length - 1].click()); await w(300);
ok('catalogue : compétence désactivée', /Désactivée/.test(await texte()));

// --- Notes hors ligne ---
await onglet('notes'); await w(300);
await page.$$eval('[data-vue="evals"]', b => b[0] && b[0].click()); await w(400);
await clic('[data-saisir]'); await w(500);
await page.setOfflineMode(true);
await saisie(6, '14'); await w(300);
ok('hors ligne : la note est gardée sur l’appareil et signalée en attente', await page.evaluate(() => JSON.parse(localStorage.getItem('lc_file_notes') || '[]').length === 1 && __DB.notes.filter(n => n.valeur === 14).length === 0 && /en attente d’envoi/.test(document.querySelector('#vue').innerText)));
ok('hors ligne : la pastille de la note reste affichée', await page.evaluate(() => [...document.querySelectorAll('#n-lignes .np')].some(n => n.textContent.trim() === '14')));
await page.setOfflineMode(false); await page.evaluate(() => window.dispatchEvent(new Event('online'))); await w(1200);
ok('retour du réseau : la note part toute seule et la file se vide', await page.evaluate(() => JSON.parse(localStorage.getItem('lc_file_notes') || '[]').length === 0 && __DB.notes.filter(n => n.valeur === 14).length === 1));

// --- Fiche élève : courbe et camembert ---
const eleveNote = await page.evaluate(() => __DB.notes.find(n => n.valeur === 19).eleve_id);
await page.evaluate(id => { __DB.acquisitions.length || 0; window.LCVS.ouvrirFiche(id); }, eleveNote); await w(1500);
ok('fiche élève : courbe d’évolution des notes avec points et note écrite', await page.evaluate(() => { const v = document.querySelector('#vue'); return /Évolution des notes/.test(v.innerText) && v.querySelectorAll('svg[aria-label="Évolution des notes sur 20"] circle').length >= 1 && /19/.test(v.querySelector('svg[aria-label="Évolution des notes sur 20"]').textContent); }));
ok('fiche élève : camembert des niveaux de compétence avec effectifs en légende', await page.evaluate(() => { const v = document.querySelector('#vue'); return /répartition des niveaux/.test(v.innerText) && !!v.querySelector('svg[aria-label="Répartition des niveaux de compétence"]') && /Très bonne maîtrise/.test(v.innerText); }));
await page.screenshot({ path: CAP('7-fiche-graphiques.png'), fullPage: true });

// --- Outils d'une évaluation : historique, CSV, copie, bibliothèque, familles, ouverture à froid hors ligne ---
const orig = await page.evaluate(() => ({ c: __LC.N.classeId, e: __LC.N.ensId, p: __LC.N.periodeId, nb: __DB.evaluations.length }));
await onglet('notes'); await w(300);
await page.$$eval('[data-vue="evals"]', b => b[0] && b[0].click()); await w(400);
await clic('[data-saisir]'); await w(500);
await clic('#o-histo'); await w(600);
ok('historique : les saisies s’affichent avec auteur et action', await page.evaluate(() => /Historique des notes/.test(document.querySelector('#n-panneau').innerText) && document.querySelectorAll('#n-panneau tr').length >= 3 && /Test Professeur/.test(document.querySelector('#n-panneau').innerText)));
const noms = await page.evaluate(() => { const l = __DB.eleves.filter(e => e.classe_id === __LC.N.classeId); return [l[5], l[7]].map(e => e.nom + ';' + e.prenom); });
await clic('#o-csv'); await w(300);
await page.$eval('#i-texte', (t, a) => { t.value = 'Nom;Prénom;Note\n' + a[0] + ';11,5\n' + a[1].toUpperCase() + ';abs\nInconnu;Personne;12\n' + a[0] + ';25'; }, noms);
await clic('#i-analyser'); await w(300);
ok('import CSV : 2 notes prêtes, 2 lignes à corriger (inconnu, hors barème)', await page.evaluate(() => /2 notes prêtes/.test(document.querySelector('#i-resultat').innerText) && /2 lignes à corriger/.test(document.querySelector('#i-resultat').innerText) && /introuvable/.test(document.querySelector('#i-resultat').innerText) && /au-dessus du barème/.test(document.querySelector('#i-resultat').innerText)));
await clic('#i-importer'); await w(800);
ok('import CSV : notes enregistrées', await page.evaluate(() => { const l = __DB.eleves.filter(e => e.classe_id === __LC.N.classeId); const ev = __LC.N.evalId; const n = id => __DB.notes.find(x => x.evaluation_id === ev && x.eleve_id === id); return n(l[5].id)?.valeur === 11.5 && n(l[7].id)?.statut === 'absent'; }));
await clic('#o-copie'); await w(300);
await page.$eval('#c-classe', (sel, id) => { sel.value = [...sel.options].find(o => o.value !== id).value; sel.dispatchEvent(new Event('change', { bubbles: true })); }, orig.c); await w(200);
await clic('#c-ok'); await w(900);
ok('copie : l’évaluation est recréée sans notes dans l’autre classe', await page.evaluate(() => { const ev = __DB.evaluations; const copie = ev[ev.length - 1]; return ev.length === 2 && copie.titre === ev[0].titre && copie.enseignement_id !== ev[0].enseignement_id && __DB.notes.filter(n => n.evaluation_id === copie.id).length === 0 && /copiée dans/.test(document.querySelector('#vue').innerText); }));
await clic('#o-pub'); await w(300);
await page.type('#p-desc', 'Course de durée, 3 niveaux'); await clic('#p-ok'); await w(600);
ok('bibliothèque : l’évaluation est publiée', await page.evaluate(() => __DB.modeles_evaluation.length === 1 && __DB.modeles_evaluation[0].description === 'Course de durée, 3 niveaux'));
await clic('#o-fam'); await w(500);
ok('familles : l’évaluation est marquée publiée aux familles', await page.evaluate(() => __DB.evaluations.find(e => e.id === __LC.N.evalId).visible_familles === true));
await page.$eval('[data-vue="biblio"]', b => b.click()); await w(700);
ok('bibliothèque : le modèle s’affiche avec l’avertissement « pas des textes officiels »', await page.evaluate(() => /ne sont pas des textes officiels/.test(document.querySelector('#vue').innerText) && !!document.querySelector('[data-utiliser]') && /Course de durée/.test(document.querySelector('#vue').innerText)));
await clic('[data-utiliser]'); await w(300);
await clic('#u-ok'); await w(900);
ok('bibliothèque : « Utiliser » crée l’évaluation dans la classe choisie', await page.evaluate(() => __DB.evaluations.length === 3 && /Évaluation créée dans/.test(document.querySelector('#vue').innerText)));
await page.$eval('[data-vue="biblio"]', b => b.click()); await w(600);
await clic('[data-retirer]'); await clic('[data-retirer]'); await w(500);
ok('bibliothèque : retrait en deux temps', await page.evaluate(() => __DB.modeles_evaluation.length === 0));
// ouverture à froid sans réseau : les évaluations déjà vues restent consultables
await page.$eval('[data-vue="evals"]', b => b.click()); await w(600);
await page.evaluate(() => { __LC.N.evalId = null; });
await page.setOfflineMode(true);
await page.evaluate(() => { __LC.N.pret = false; __LC.N.vue = 'evals'; });
await onglet('appel'); await onglet('notes'); await w(800);
ok('hors ligne à froid : l’onglet Notes s’ouvre avec les évaluations de la dernière visite et un bandeau', await page.evaluate(() => /Hors ligne : données de la dernière ouverture/.test(document.querySelector('#vue').innerText) && document.querySelectorAll('[data-saisir]').length >= 1));
await page.setOfflineMode(false);
await page.evaluate(o => { __DB.evaluations.splice(o.nb); __DB.modeles_evaluation.length = 0; Object.assign(__LC.N, { classeId: o.c, ensId: o.e, periodeId: o.p, pret: false, vue: 'evals', evalId: null }); }, orig);
await onglet('appel'); await onglet('notes'); await w(600);

// --- Étape 4 : appréciations et bulletins ---
const ctx4 = await page.evaluate(() => { const ev = __DB.evaluations.find(e => __DB.notes.some(n => n.evaluation_id === e.id && n.valeur === 19)); const en = __DB.enseignements.find(x => x.id === ev.enseignement_id);
  Object.assign(__LC.B, { classeId: en.classe_id, ensId: en.id, periodeId: ev.periode_id, sub: 'matiere' }); return { ens: en.id, classe: en.classe_id, per: ev.periode_id, top: __DB.notes.find(n => n.valeur === 19).eleve_id, nb: __DB.eleves.filter(e => e.classe_id === en.classe_id).length }; });
ok('étape 4 : onglets Appréciations et Bulletins présents', await page.evaluate(() => !!document.querySelector('#nav [data-k="appreciations"]') && !!document.querySelector('#nav [data-k="bulletins"]')));
await onglet('appreciations'); await w(700);
ok('appréciations : une ligne par élève, avec moyenne et zone de texte', await page.evaluate(n => document.querySelectorAll('#a-lignes [data-appr]').length === n && !!document.querySelector('#a-elem') && document.querySelectorAll('#a-lignes .note.haut').length >= 1, ctx4.nb));
const tape = async (sel, txt) => { await page.$eval(sel, (ta, t) => { ta.value = t; ta.dispatchEvent(new Event('input')); ta.dispatchEvent(new Event('change')); }, txt); await w(400); };
await tape(`[data-appr="${ctx4.top}"]`, 'Très bon travail, participation active.');
ok('appréciation enregistrée automatiquement, compteur affiché', await page.evaluate(id => __DB.appreciations.some(a => a.eleve_id === id && a.texte === 'Très bon travail, participation active.') && /39\/400/.test(document.querySelector(`[data-appr="${id}"]`).parentElement.innerText), ctx4.top));
const autre = await page.evaluate((c, top) => __DB.eleves.find(e => e.classe_id === c && e.id !== top).id, ctx4.classe, ctx4.top);
await tape(`[data-appr="${autre}"]`, 'x'.repeat(420));
ok('appréciation trop longue : refusée avec un message, compteur en rouge', await page.evaluate(id => { const p = document.querySelector(`[data-appr="${id}"]`).parentElement; return /Trop long/.test(p.innerText) && !!p.querySelector('.trop') && !__DB.appreciations.some(a => a.eleve_id === id); }, autre));
await tape(`[data-appr="${autre}"]`, '');
await page.$eval(`[data-prop="${ctx4.top}"]`, b => b.click()); await w(400);
ok('💡 Proposer : brouillon adapté à la moyenne (≥ 16 : excellent), ajouté au texte existant', await page.evaluate(id => { const a = __DB.appreciations.find(x => x.eleve_id === id).texte; return /^Très bon travail, participation active\. /.test(a) && /Excellent|Très bons résultats|remarquable/.test(a); }, ctx4.top));
await clic('#a-prop-tous'); await w(600);
ok('💡 Proposer pour les cases vides : toutes les lignes reçoivent un brouillon', await page.evaluate(n => __DB.appreciations.length === n && /brouillons? d’appréciation proposés?/.test(document.querySelector('#vue').innerText), ctx4.nb));
await page.$eval('#a-elem', ta => { ta.value = 'Course de durée ; badminton'; ta.dispatchEvent(new Event('change')); }); await w(400);
ok('éléments du programme travaillés enregistrés', await page.evaluate(() => __DB.elements_programme.length === 1 && __DB.elements_programme[0].texte === 'Course de durée ; badminton'));
await page.$eval(`[data-ouvphr="${autre}"]`, b => b.click()); await w(300);
await page.$$eval(`[data-phr][data-pour="${autre}"]`, bs => bs.find(b => /Excellent trimestre/.test(b.textContent)).click()); await w(400);
ok('📋 Phrases : une phrase de la banque s’ajoute à l’appréciation', await page.evaluate(id => / Excellent trimestre : travail sérieux et résultats remarquables\.$/.test(__DB.appreciations.find(a => a.eleve_id === id).texte), autre));
// appréciation générale
await page.$$eval('[data-asub="generale"]', b => b[0].click()); await w(800);
ok('appréciation générale : une carte par élève avec moyenne, absences et appréciations des matières', await page.evaluate(n => document.querySelectorAll('[data-gen]').length === n && /demi-journée/.test(document.querySelector('#vue').innerText) && /Voir les appréciations des matières/.test(document.querySelector('#vue').innerText), ctx4.nb));
await tape(`[data-gen="${ctx4.top}"]`, 'Excellent trimestre.');
await page.$eval(`[data-mention="${ctx4.top}"]`, s => { s.value = 'Compliments'; s.dispatchEvent(new Event('change')); }); await w(400);
ok('appréciation générale et mention enregistrées', await page.evaluate(id => { const a = __DB.appreciations_generales.find(x => x.eleve_id === id); return a && a.texte === 'Excellent trimestre.' && a.mention === 'Compliments'; }, ctx4.top));
await page.$eval(`[data-propg="${autre}"]`, b => b.click()); await w(400);
ok('💡 Proposer (générale) : brouillon rédigé à partir de la moyenne générale', await page.evaluate(id => (__DB.appreciations_generales.find(x => x.eleve_id === id) || {}).texte?.length > 20, autre));
// banque de phrases
await page.$$eval('[data-asub="phrases"]', b => b[0].click()); await w(500);
await page.type('#ph-cat', 'Perso'); await page.type('#ph-txt', 'Bravo pour la régularité.'); await clic('#ph-ajout'); await w(400);
ok('banque de phrases : ajout', await page.evaluate(() => __DB.banque_phrases.some(p => p.texte === 'Bravo pour la régularité.')) && /Bravo pour la régularité/.test(await texte()));
// banque de phrases : correction d'une phrase de départ (par un professeur)
await page.$$eval('[data-corphr]', b => b[0].click()); await w(300);
await page.$eval('[data-phr-txt]', i => { i.value = 'Phrase de départ corrigée par le prof.'; }); await page.$$eval('[data-okphr]', b => b[0].click()); await w(400);
ok('banque de phrases : correction d’une phrase', await page.evaluate(() => __DB.banque_phrases.some(p => p.texte === 'Phrase de départ corrigée par le prof.')) && /Phrase de départ corrigée par le prof\./.test(await texte()));
// historique d'une appréciation
await page.$$eval('[data-asub="matiere"]', b => b[0].click()); await w(600);
await page.evaluate(() => { const e = __DB.appreciations.find(a => a.texte) || {}; const b = document.querySelector(`[data-histo="${e.eleve_id}"]`); b && b.click(); }); await w(400);
ok('historique : l’ancien et le nouveau texte s’affichent', await page.evaluate(() => /Historique de cette appréciation/.test(document.querySelector('#vue').innerText) && /Ancien texte de test/.test(document.querySelector('#vue').innerText)));
// bulletins : suivi, validation, aperçu, impression
await onglet('bulletins'); await w(700);
ok('bulletins : suivi du remplissage par matière', await page.evaluate(n => /Appréciations des matières/.test(document.querySelector('#vue').innerText) && new RegExp(`${n}/${n}`).test(document.querySelector('#vue').innerText) && /manquants/.test(document.querySelector('#vue').innerText), ctx4.nb));
await page.$$eval('[data-bsub="apercu"]', b => b[0].click()); await w(800);
ok('aperçu : bulletin complet (en-tête, élève, matières, éléments du programme, vie scolaire, appréciation générale, PROVISOIRE)', await page.evaluate(() => { const b = document.querySelector('#b-rendu .bulletin'); const t = b ? b.innerText : '';
  return !!b && /Collège Luqmân/.test(t) && /Bilan périodique/.test(t) && b.querySelectorAll('tbody tr').length === __DB.enseignements.filter(e => e.classe_id === __LC.B.classeId).length && /Course de durée ; badminton/.test(t) && /Demi-journées d’absence/.test(t) && /PROVISOIRE/.test(t); }));
await page.$eval('#b-eleve', (s, id) => { s.value = id; s.dispatchEvent(new Event('change')); }, ctx4.top); await w(300);
ok('aperçu : appréciation générale et mention de l’élève affichées', await page.evaluate(() => /Excellent trimestre\./.test(document.querySelector('#b-rendu').innerText) && /Compliments/i.test(document.querySelector('#b-rendu .mention').textContent)));
await page.screenshot({ path: CAP('8-bulletin.png'), fullPage: true });
await page.evaluate(() => { window.__impressions = 0; window.print = () => { window.__impressions++; window.__pages = document.querySelectorAll('#lc-impression .bulletin').length; }; });
await clic('#b-imp1'); await w(200);
const p1 = await page.evaluate(() => ({ n: window.__impressions, p: window.__pages }));
await clic('#b-impc'); await w(200);
const pc = await page.evaluate(() => ({ n: window.__impressions, p: window.__pages }));
ok('impression : un bulletin, puis toute la classe (une page par élève)', p1.n === 1 && p1.p === 1 && pc.n === 2 && pc.p === ctx4.nb, JSON.stringify([p1, pc]));
// mise en page du bulletin (direction)
await clic('#b-mep-ouvrir'); await w(300);
const ordreBlocs = () => page.evaluate(() => [...document.querySelectorAll('#b-rendu .bulletin > *')].map(x => x.className.split(' ')[0] || x.tagName));
const av = await ordreBlocs();
await page.$eval('[data-mep-bas="b:tete"]', b => b.click()); await w(200);
const ap = await ordreBlocs();
ok('mise en page : un bloc descend d’un cran dans l’aperçu', av[0] === 'bu-tete' && ap[0] !== 'bu-tete' && ap[1] === 'bu-tete', JSON.stringify([av.slice(0, 3), ap.slice(0, 3)]));
await page.$eval('[data-mep-vis="c:classe"]', c => c.click()); await w(200);
ok('mise en page : une colonne se masque (aperçu et impression)', await page.evaluate(() => document.querySelectorAll('#b-rendu thead th').length === 4 && !/classe \(min/i.test(document.querySelector('#b-rendu thead').innerText)));
await page.$eval('[data-mep-bas="c:elements"]', b => b.click()); await w(200);
ok('mise en page : l’ordre des colonnes change', await page.evaluate(() => /moyenne élève/i.test(document.querySelectorAll('#b-rendu thead th')[1].innerText)));
await page.$eval('[data-mep-vis="b:signatures"]', c => c.click()); await w(200);
ok('mise en page : les signatures se masquent', await page.evaluate(() => !document.querySelector('#b-rendu .bu-sign')));
await page.select('#mep-taille', 'compact'); await w(200);
ok('mise en page : taille compacte', await page.evaluate(() => !!document.querySelector('#b-rendu .bulletin.bu-compact')));
await clic('#mep-enreg'); await w(400);
ok('mise en page : enregistrée comme réglage par défaut', await page.evaluate(() => { const p = __DB.parametres.find(x => x.cle === 'bulletin_mise_en_page'); return p && p.valeur && p.valeur.colMasques.includes('classe') && p.valeur.masques.includes('signatures') && p.valeur.taille === 'compact' && p.valeur.blocs[0] !== 'tete'; }));
await page.$eval('#mep-retouche', c => c.click()); await w(200);
await page.evaluate(() => { const h = document.querySelector('#b-rendu .bu-tete h2'); h.textContent = 'Collège Luqmân — RETOUCHÉ'; h.dispatchEvent(new Event('input', { bubbles: true })); });
await clic('#b-imp1'); await w(200);
ok('retouche : le texte modifié part à l’impression, sans mode édition', await page.evaluate(() => /RETOUCHÉ/.test(document.querySelector('#lc-impression').innerText) && !document.querySelector('#lc-impression [contenteditable]')));
await page.$eval('#mep-annuler-retouches', b => b.click()); await w(200);
ok('retouche : annulable', await page.evaluate(() => !/RETOUCHÉ/.test(document.querySelector('#b-rendu').innerText)));
await page.$eval('#mep-reset', b => b.click()); await w(200);
ok('mise en page : rétablir la mise en page standard', await page.evaluate(() => document.querySelectorAll('#b-rendu thead th').length === 5 && !!document.querySelector('#b-rendu .bu-sign')));
// tableau de remplissage toutes classes
await page.$$eval('[data-bsub="toutes"]', b => b[0].click()); await w(500);
ok('toutes les classes : une carte par classe avec progression', await page.evaluate(() => document.querySelectorAll('#vue .carte .barre-prog').length >= 1 && /Classes complètes/.test(document.querySelector('#vue').innerText)));
await page.$$eval('[data-ouvrir-classe]', b => b[0].click()); await w(500);
ok('toutes les classes : « Ouvrir le suivi » mène au suivi de la classe', await page.evaluate(() => /Appréciations des matières/.test(document.querySelector('#vue').innerText)));
await page.$$eval('[data-bsub="suivi"]', b => b[0].click()); await w(500);
await clic('[data-statut="valide"]'); await w(500);
ok('validation des bulletins par la direction', await page.evaluate(() => __DB.bulletins_periode[0]?.statut === 'valide' && /Validé/.test(document.querySelector('#vue').innerText)));
await page.evaluate(e => { __DB.__droits = { admin: false, classes_pp: [], enseignements: [e] }; __LC.N.pret = false; __LC.B.sub = 'matiere'; }, ctx4.ens);
await onglet('appreciations'); await w(700);
ok('bulletin validé : saisies figées pour le professeur (zones grisées, message)', await page.evaluate(() => [...document.querySelectorAll('[data-appr]')].every(t => t.disabled) && /saisies sont figées/.test(document.querySelector('#vue').innerText) && !document.querySelector('#a-prop-tous')));
await onglet('bulletins'); await w(500);
ok('rôle prof : ni validation, ni réglages, ni aperçu des bulletins de la classe', await page.evaluate(() => !document.querySelector('[data-statut]') && !document.querySelector('[data-bsub="reglages"]')));
await page.evaluate(() => { __DB.__droits = null; __LC.N.pret = false; });
await onglet('appel'); await onglet('bulletins'); await w(600);
await page.$$eval('[data-bsub="reglages"]', b => b[0].click()); await w(500);
await page.$eval('#g-nom', i => { i.value = 'Collège Luqmân — test'; }); await clic('#g-enreg'); await w(500);
ok('réglages des bulletins enregistrés (en-tête)', await page.evaluate(() => __DB.parametres.find(p => p.cle === 'etablissement_nom').valeur === 'Collège Luqmân — test'));
await page.evaluate(() => { __DB.bulletins_periode.length = 0; __LC.B.bsub = 'suivi'; });
await onglet('appel');

// --- Réglages (direction) ---
await onglet('notes'); await w(300);
await page.$$eval('[data-vue="reglages"]', b => b[0].click()); await w(400);
ok('réglages : la direction voit l’onglet et les 4 niveaux', /Qui voit les notes/.test(await texte()) && (await page.$$('.r-niv')).length === 4);
await page.$eval('#r-vis', c => c.click()); await page.$eval('#r-haut', i => { i.value = '17'; }); await page.$eval('#r-bas', i => { i.value = '9,5'; });
await clic('#r-enreg'); await w(400);
ok('réglages enregistrés (visibilité, seuils)', await page.evaluate(() => { const p = k => __DB.parametres.find(x => x.cle === k); return p('notes_visibles_tout_personnel').valeur === true && p('note_seuil_haut').valeur === 17 && p('note_seuil_bas').valeur === 9.5; }) && /Réglages enregistrés/.test(await texte()));
await page.$eval('#r-haut', i => { i.value = '5'; }); await clic('#r-enreg'); await w(300);
ok('réglages : seuil rouge au-dessus du jaune refusé', /plus bas que le seuil jaune/.test(await texte()));
await page.$eval('#r-haut', i => { i.value = '18'; }); await page.$eval('#r-bas', i => { i.value = '8'; }); await clic('#r-enreg'); await w(300);

// --- Boutons selon le rôle (professeur simple : ni sa matière, ni principal, ni direction) ---
await page.evaluate(() => { __DB.__droits = { admin: false, classes_pp: [], enseignements: [] }; __LC.N.pret = false; __LC.N.vue = 'evals'; __LC.N.evalId = null; });
await onglet('appel'); await onglet('notes'); await w(600);
ok('rôle prof (pas sa matière) : pas de bouton Réglages, ni Nouvelle évaluation', await page.evaluate(() => !document.querySelector('[data-vue="reglages"]') && ![...document.querySelectorAll('#vue button')].some(b => /Nouvelle évaluation/.test(b.textContent)) && /Lecture seule/.test(document.querySelector('#vue').innerText)));
await page.$eval('[data-vue="releve"]', b => b.click()); await w(500);
ok('rôle prof : pas de bouton de verrouillage de période', await page.evaluate(() => !document.querySelector('#r-verrou')));
await onglet('competences'); await w(500);
await page.$$eval('[data-sub="catalogue"]', b => b[0].click()); await w(400);
ok('rôle prof : catalogue en lecture seule', await page.evaluate(() => !document.querySelector('#k-ajout') && !document.querySelector('[data-actif]') && /Lecture seule/.test(document.querySelector('#vue').innerText)));
await page.$$eval('[data-sub="bilan"]', b => b[0].click()); await w(500);
ok('rôle prof : pas de correction de bilan', await page.evaluate(() => !document.querySelector('[data-bil]')));
await page.evaluate(() => { __DB.__droits = null; __LC.N.pret = false; __LC.N.vue = 'evals'; });
await onglet('appel');

// Suppression en deux temps
await onglet('notes'); await w(300);
await page.$$eval('[data-vue="evals"]', b => b[0] && b[0].click()); await w(400);
await clic('[data-suppr]'); ok('suppression : première touche demande confirmation', /Confirmer la suppression/.test(await texte()));
await clic('[data-suppr]'); await w(300);
ok('évaluation supprimée après confirmation', /Aucune évaluation/.test(await texte()) && (await page.evaluate(() => __DB.evaluations.length)) === 0);

for (const k of ['eleves', 'classes', 'matieres', 'import', 'export', 'fiche']) { await onglet(k); }
ok('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
await onglet('appel'); await page.screenshot({ path: CAP('5-accueil.png') });
console.log(`${n - ko}/${n} tests d’écran réussis`);
await browser.close(); serveur.close();
process.exit(ko ? 1 : 0);
