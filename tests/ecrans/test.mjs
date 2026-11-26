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
ok('tous les onglets sont là', ['appel', 'suivi', 'fiche', 'pun', 'incidents', 'tel', 'infirmerie', 'tdb', 'eleves', 'classes', 'groupes', 'calendrier', 'notes', 'competences'].every(k => onglets.includes(k)), onglets.join(','));

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
await page.evaluate(async m => { const c = await caches.open('lc-app-v5'); await c.put('http://localhost:8765/app/vendor/supabase-2.119.2.js', new Response(m, { headers: { 'Content-Type': 'application/javascript' } })); }, MOCK);
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
await page.$$eval('[data-actif]', b => b[b.length - 1].click()); await w(300);
ok('catalogue : compétence désactivée', /Désactivée/.test(await texte()));

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
