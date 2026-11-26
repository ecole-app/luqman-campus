// Tests des droits et de l'horodatage (étape 0a). Lance : npm run test:db
// Base PostgreSQL locale en mémoire (PGlite), avec un faux "auth" qui imite Supabase.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
`);
await db.exec(readFileSync(new URL('../migrations/0001_fondations.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../migrations/0002_donnees_etablissement.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../migrations/0003_vie_scolaire.sql', import.meta.url), 'utf8'));

const U = { gest:'00000000-0000-0000-0000-000000000001', dir:'00000000-0000-0000-0000-000000000002',
  prof:'00000000-0000-0000-0000-000000000003', eleve:'00000000-0000-0000-0000-000000000004',
  eleve2:'00000000-0000-0000-0000-000000000005', vs:'00000000-0000-0000-0000-000000000006' };
for (const id of Object.values(U)) await db.exec(`insert into auth.users values ('${id}')`);
const profils = [['gest','Gestionnaire','App','gestionnaire'],['dir','Directeur','Test','direction'],
  ['prof','Benali','Test','professeur'],['eleve','Ferhat','Sarah','eleve'],['eleve2','Amrani','Adam','eleve'],['vs','Kaci','Test','vie_scolaire']];
for (const [k,n,p,r] of profils) await db.exec(`insert into profils(id,nom,prenom) values ('${U[k]}','${n}','${p}');
  insert into user_roles(user_id,role) values ('${U[k]}','${r}')`);
await db.exec(`insert into user_roles(user_id,role) values ('${U.dir}','administrateur')`);

async function as(user, sql) {
  await db.exec(`set role ${user === 'anon' ? 'anon' : 'authenticated'}; select set_config('request.jwt.claim.sub','${user === 'anon' ? '' : U[user]}', false)`);
  try { return { ok: true, res: await db.query(sql) }; }
  catch (e) { return { ok: false, err: e.message }; }
  finally { await db.exec('reset role'); }
}

let n = 0, fails = 0;
const test = async (nom, fn) => { n++; try { const r = await fn(); if (r !== true) throw new Error(String(r)); console.log('  OK  ', nom); } catch (e) { fails++; console.log('  ÉCHEC', nom, '→', e.message); } };

await test('un visiteur non connecté ne voit rien', async () => { const r = await as('anon', 'select * from profils'); return !r.ok || r.res.rows.length === 0; });
await test('un élève ne voit que son propre profil', async () => { const r = await as('eleve', 'select id from profils'); return r.ok && r.res.rows.length === 1 && r.res.rows[0].id === U.eleve; });
await test('un élève ne lit pas les réglages', async () => { const r = await as('eleve', 'select * from parametres'); return !r.ok || r.res.rows.length === 0; });
await test('un professeur lit les réglages', async () => { const r = await as('prof', 'select * from parametres'); return r.ok && r.res.rows.length > 10; });
await test('un professeur ne modifie pas les réglages', async () => { const r = await as('prof', `update parametres set valeur='99' where cle='appel_delai_min' returning cle`); return !r.ok || r.res.rows.length === 0; });
await test('la direction modifie les réglages', async () => { const r = await as('dir', `update parametres set valeur='20' where cle='appel_delai_min' returning cle`); return r.ok && r.res.rows.length === 1; });
await test('la modification est écrite dans le journal avec son auteur', async () => { const r = await as('dir', `select auteur, table_nom, operation, ligne_id, avant->>'valeur' as avant, apres->>'valeur' as apres from journal_audit where ligne_id='appel_delai_min' and operation='UPDATE' order by id limit 1`);
  const x = r.res?.rows?.[0]; return r.ok && x && x.auteur === U.dir && x.operation === 'UPDATE' && x.avant === '30' && x.apres === '20'; });
await test('l’heure est celle du serveur, pas celle du client', async () => { await as('dir', `update parametres set valeur='25', updated_at='2000-01-01' where cle='appel_delai_min'`);
  const r = await db.query(`select updated_at > now() - interval '1 minute' as recent, updated_by from parametres where cle='appel_delai_min'`); return r.rows[0].recent === true && r.rows[0].updated_by === U.dir; });
await test('un professeur ne lit pas le journal', async () => { const r = await as('prof', 'select * from journal_audit'); return !r.ok || r.res.rows.length === 0; });
await test('la direction lit le journal', async () => { const r = await as('dir', 'select * from journal_audit'); return r.ok && r.res.rows.length > 0; });
await test('personne ne peut modifier le journal (même le gestionnaire)', async () => { const r = await as('gest', `update journal_audit set auteur=null`); return !r.ok || r.res.rowCount === 0; });
await test('même le propriétaire de la base ne peut pas effacer le journal', async () => { try { await db.exec('delete from journal_audit'); return 'suppression acceptée'; } catch (e) { return true; } });
await test('la direction ne peut pas donner le rôle gestionnaire', async () => { const r = await as('dir', `insert into user_roles(user_id,role) values ('${U.prof}','gestionnaire')`); return !r.ok; });
await test('le gestionnaire peut donner le rôle gestionnaire', async () => { const r = await as('gest', `insert into user_roles(user_id,role) values ('${U.vs}','gestionnaire') returning role`); return r.ok && r.res.rows.length === 1; });
await test('la direction ne peut pas retirer le rôle gestionnaire', async () => { const r = await as('dir', `delete from user_roles where role='gestionnaire' returning user_id`); return !r.ok || r.res.rows.length === 0; });
await test('la direction peut être aussi administrateur (2 rôles)', async () => { const r = await as('dir', `select role from user_roles where user_id='${U.dir}'`); return r.ok && r.res.rows.length === 2; });
await test('un professeur ne peut pas se donner un rôle', async () => { const r = await as('prof', `insert into user_roles(user_id,role) values ('${U.prof}','direction')`); return !r.ok; });
await test('un compte désactivé perd tous ses droits', async () => { await as('dir', `update profils set actif=false where id='${U.prof}'`); const r = await as('prof', 'select * from parametres'); await as('dir', `update profils set actif=true where id='${U.prof}'`); return !r.ok || r.res.rows.length === 0; });
await test('le gestionnaire passe partout (au-dessus des rôles)', async () => { const r = await as('gest', `update parametres set valeur='6' where cle='edt_heures_max_jour' returning cle`); return r.ok && r.res.rows.length === 1; });

// ---------- Étape 1 : données de l'établissement ----------
await db.exec(`
  insert into annees_scolaires(libelle, debut, fin, active) values ('2026-2027','2026-09-01','2027-07-04', true);
  insert into classes(annee_id, niveau, nom) select id, '5e', '5e A' from annees_scolaires;
  insert into classes(annee_id, niveau, nom) select id, '6e', '6e A' from annees_scolaires;
  insert into eleves(nom, prenom, date_naissance, ine, classe_id, profil_id)
    select 'Ferhat','Sarah','2013-03-02','12345678901', id, '${U.eleve}' from classes where nom='5e A';
  insert into eleves(nom, prenom, date_naissance, ine, classe_id, profil_id)
    select 'Amrani','Adam','2013-07-19','12345678902', id, '${U.eleve2}' from classes where nom='5e A';
  insert into matieres(code, nom) values ('EPS','Éducation physique et sportive'), ('MATH','Mathématiques');
`);

await test('une seule année scolaire peut être active', async () => { const r = await as('dir', `insert into annees_scolaires(libelle,debut,fin,active) values ('2027-2028','2027-09-01','2028-07-04', true)`); return !r.ok; });
await test('un élève ne voit que sa propre fiche', async () => { const r = await as('eleve', 'select nom from eleves'); return r.ok && r.res.rows.length === 1 && r.res.rows[0].nom === 'Ferhat'; });
await test('un élève ne voit pas les classes', async () => { const r = await as('eleve', 'select * from classes'); return !r.ok || r.res.rows.length === 0; });
await test('un professeur lit les élèves et les classes', async () => { const a = await as('prof', 'select * from eleves'); const b = await as('prof', 'select * from classes'); return a.ok && a.res.rows.length === 2 && b.ok && b.res.rows.length === 2; });
await test('un professeur ne modifie pas un élève', async () => { const r = await as('prof', `update eleves set nom='X' returning id`); return !r.ok || r.res.rows.length === 0; });
await test('un professeur ne crée pas de classe', async () => { const r = await as('prof', `insert into classes(annee_id,niveau,nom) select id,'4e','4e A' from annees_scolaires`); return !r.ok; });
await test('la direction crée une matière et un enseignement', async () => {
  const a = await as('dir', `insert into matieres(code,nom) values ('SVT','Sciences de la vie et de la Terre') returning id`);
  const b = await as('dir', `insert into enseignements(classe_id, matiere_id, professeur_id, coefficient, heures_hebdo)
    select c.id, m.id, '${U.prof}', 2, 3 from classes c, matieres m where c.nom='5e A' and m.code='EPS' returning id`);
  return a.ok && b.ok && b.res.rows.length === 1; });
await test('un coefficient nul ou négatif est refusé', async () => { const r = await as('dir', `insert into enseignements(classe_id, matiere_id, coefficient) select c.id, m.id, 0 from classes c, matieres m where c.nom='6e A' and m.code='MATH'`); return !r.ok; });
await test('un INE mal formé est refusé', async () => { const r = await as('dir', `insert into eleves(nom,prenom,date_naissance,ine) values ('A','B','2013-01-01','abc')`); return !r.ok; });
await test('deux élèves ne peuvent pas avoir le même INE', async () => { const r = await as('dir', `insert into eleves(nom,prenom,date_naissance,ine) values ('A','B','2013-01-01','12345678901')`); return !r.ok; });
await test('la création d’un élève est écrite au journal', async () => { const r = await db.query(`select count(*)::int as n from journal_audit where table_nom='eleves' and operation='INSERT'`); return r.rows[0].n === 2; });

// Import CSV : une classe fictive de 25 élèves contenant des erreurs volontaires
const bonnes = Array.from({ length: 22 }, (_, k) => ({ nom: `Nom${k}`, prenom: `Prenom${k}`, naissance: '2014-05-1' + (k % 9), ine: String(20000000000 + k), classe: '6e A' }));
const fautes = [
  { nom: '', prenom: 'Sans', naissance: '2014-01-01', ine: '', classe: '6e A' },                       // ligne 23 : nom manquant
  { nom: 'Date', prenom: 'Fausse', naissance: '31/02/2014', ine: '', classe: '6e A' },                 // ligne 24 : mauvais format
  { nom: 'Ailleurs', prenom: 'Classe', naissance: '2014-02-02', ine: '', classe: '9z Z' }              // ligne 25 : classe inconnue
];
const fichier = [...bonnes, ...fautes];
const compte = async () => (await db.query('select count(*)::int as n from eleves')).rows[0].n;

await test('un professeur ne peut pas lancer un import', async () => { const r = await as('prof', `select controler_import_eleves('${JSON.stringify(bonnes)}'::jsonb)`); return !r.ok; });
await test('le contrôle signale exactement les 3 erreurs, ligne par ligne', async () => {
  const avant = await compte();
  const r = await as('dir', `select controler_import_eleves('${JSON.stringify(fichier).replace(/'/g, "''")}'::jsonb) as r`);
  const x = r.res.rows[0].r; const lignes = x.erreurs.map(e => e.ligne).sort((a, b) => a - b);
  return x.ok === false && x.nb === 25 && JSON.stringify(lignes) === '[23,24,25]' && (await compte()) === avant; });
await test('l’import refuse tout (rien écrit) s’il reste une seule erreur', async () => {
  const avant = await compte();
  const r = await as('dir', `select importer_eleves('${JSON.stringify(fichier).replace(/'/g, "''")}'::jsonb) as r`);
  return r.res.rows[0].r.importes === 0 && (await compte()) === avant; });
await test('un INE déjà dans la base ou en double dans le fichier est détecté', async () => {
  const f = [{ nom: 'Z', prenom: 'Z', naissance: '2014-01-01', ine: '12345678901', classe: '6e A' },
             { nom: 'Y', prenom: 'Y', naissance: '2014-01-02', ine: '30000000000', classe: '6e A' },
             { nom: 'X', prenom: 'X', naissance: '2014-01-03', ine: '30000000000', classe: '6e A' }];
  const r = await as('dir', `select controler_import_eleves('${JSON.stringify(f)}'::jsonb) as r`);
  const lignes = r.res.rows[0].r.erreurs.map(e => e.ligne); return JSON.stringify(lignes) === '[1,3]'; });
await test('un élève déjà présent (même nom, prénom, naissance) est détecté', async () => {
  const f = [{ nom: 'ferhat', prenom: 'SARAH', naissance: '2013-03-02', ine: '', classe: '5e A' }];
  const r = await as('dir', `select controler_import_eleves('${JSON.stringify(f)}'::jsonb) as r`); return r.res.rows[0].r.ok === false; });
await test('le fichier corrigé (22 lignes valides) est importé en une fois', async () => {
  const avant = await compte();
  const r = await as('dir', `select importer_eleves('${JSON.stringify(bonnes)}'::jsonb) as r`);
  return r.res.rows[0].r.importes === 22 && (await compte()) === avant + 22; });
await test('réimporter le même fichier est refusé (doublons)', async () => {
  const avant = await compte();
  const r = await as('dir', `select importer_eleves('${JSON.stringify(bonnes)}'::jsonb) as r`);
  return r.res.rows[0].r.importes === 0 && (await compte()) === avant; });

// ---------- Étape 2 : vie scolaire du quotidien ----------
U.prof2 = '00000000-0000-0000-0000-000000000007'; U.vs2 = '00000000-0000-0000-0000-000000000008';
for (const [k, n, r] of [['prof2', 'Autre', 'professeur'], ['vs2', 'Vie', 'vie_scolaire']]) {
  await db.exec(`insert into auth.users values ('${U[k]}'); insert into profils(id,nom,prenom) values ('${U[k]}','${n}','Test');
    insert into user_roles(user_id,role) values ('${U[k]}','${r}')`);
}
await db.exec(`
  insert into enseignements(classe_id, matiere_id, professeur_id, coefficient)
    select c.id, m.id, '${U.prof2}', 1 from classes c, matieres m where c.nom='5e A' and m.code='MATH';
  create temp table ids as select
    (select id from classes where nom='5e A') as classe,
    (select e.id from enseignements e join matieres m on m.id=e.matiere_id join classes c on c.id=e.classe_id where c.nom='5e A' and m.code='EPS' and e.professeur_id='${U.prof}') as ens_prof,
    (select e.id from enseignements e join matieres m on m.id=e.matiere_id join classes c on c.id=e.classe_id where c.nom='5e A' and m.code='MATH') as ens_prof2;
  insert into cours(enseignement_id, debut, fin) select ens_prof, now() - interval '12 minutes', now() + interval '43 minutes' from ids;
  insert into cours(enseignement_id, debut, fin) select ens_prof2, now() - interval '100 minutes', now() - interval '45 minutes' from ids;
  insert into cours(enseignement_id, debut, fin) select ens_prof2, now() - interval '35 minutes', now() + interval '20 minutes' from ids;
`);
const cid = async (min) => (await db.query(`select id from cours where debut::timestamp(0) = (now() - interval '${min} minutes')::timestamp(0) or abs(extract(epoch from (now() - debut))/60 - ${min}) < 1 limit 1`)).rows[0].id;
const C1 = await cid(12), C2 = await cid(100), C3 = await cid(35);
const sarah = (await db.query(`select id from eleves where nom='Ferhat' and prenom='Sarah'`)).rows[0].id;
const adam = (await db.query(`select id from eleves where nom='Amrani' and prenom='Adam'`)).rows[0].id;

await test('le professeur ouvre l’appel de son cours : tous présents par défaut', async () => {
  const r = await as('prof', `select ouvrir_appel('${C1}') as n`); const p = await db.query(`select count(*)::int n, count(*) filter (where statut='present')::int pr from presences where cours_id='${C1}'`);
  return r.ok && r.res.rows[0].n === 2 && p.rows[0].n === 2 && p.rows[0].pr === 2; });
await test('un autre professeur ne peut pas faire l’appel de ce cours', async () => { const r = await as('prof2', `select ouvrir_appel('${C1}')`); return !r.ok; });
await test('la vie scolaire peut faire l’appel de n’importe quel cours', async () => { const r = await as('vs2', `select ouvrir_appel('${C2}') as n`); return r.ok && r.res.rows[0].n === 2; });
await test('retard : heure du serveur et arrondi au palier de 5 min (12 min → 15)', async () => {
  const r = await as('prof', `update presences set statut='retard', heure_evenement='2000-01-01', minutes_retard=1 where cours_id='${C1}' and eleve_id='${sarah}' returning heure_evenement > now() - interval '1 minute' as recent, minutes_retard as m`);
  return r.ok && r.res.rows[0].recent === true && r.res.rows[0].m === 15; });
await test('le palier de retard suit le réglage (10 min → 20)', async () => {
  await as('dir', `update parametres set valeur='10' where cle='retard_palier_min' returning valeur`); 
  const r = await as('prof', `update presences set statut='retard' where cours_id='${C1}' and eleve_id='${adam}' returning minutes_retard as m`);
  await as('dir', `update parametres set valeur='5' where cle='retard_palier_min'`); return r.ok && r.res.rows[0].m === 20; });
await test('le client ne peut pas modifier l’heure sans changer le statut', async () => {
  await as('prof', `update presences set heure_evenement='2000-01-01', minutes_retard=99, motif='transport' where cours_id='${C1}' and eleve_id='${sarah}'`);
  const r = await db.query(`select heure_evenement > now() - interval '1 minute' as recent, minutes_retard m, motif from presences where cours_id='${C1}' and eleve_id='${sarah}'`);
  return r.rows[0].recent === true && r.rows[0].m === 15 && r.rows[0].motif === 'transport'; });
await test('sortie anticipée : heure serveur, qui autorise, qui récupère', async () => {
  const r = await as('prof', `update presences set statut='sortie', autorise_par='M. Directeur', recupere_par='Le père' where cours_id='${C1}' and eleve_id='${adam}' returning heure_evenement is not null as h, minutes_retard m, autorise_par a, recupere_par r`);
  const x = r.res?.rows?.[0]; return r.ok && x.h === true && x.m === null && x.a === 'M. Directeur' && x.r === 'Le père'; });
await test('une dispense est enregistrée', async () => { const r = await as('prof', `update presences set statut='dispense' where cours_id='${C1}' and eleve_id='${sarah}' returning statut`); return r.ok && r.res.rows[0].statut === 'dispense'; });
await test('repasser « présent » efface l’heure et les champs de sortie', async () => {
  const r = await as('prof', `update presences set statut='present' where cours_id='${C1}' and eleve_id='${adam}' returning heure_evenement h, autorise_par a, recupere_par r`);
  const x = r.res?.rows?.[0]; return r.ok && x.h === null && x.a === null && x.r === null; });
await test('un autre professeur ne modifie pas les présences de ce cours', async () => { const r = await as('prof2', `update presences set statut='absent' where cours_id='${C1}' returning id`); return !r.ok || r.res.rows.length === 0; });
await test('un élève voit ses propres présences, pas celles des autres, et ne peut rien modifier', async () => {
  const a = await as('eleve', 'select eleve_id from presences'); const b = await as('eleve', `update presences set statut='absent' returning id`);
  return a.ok && a.res.rows.length >= 1 && a.res.rows.every(x => x.eleve_id === sarah) && (!b.ok || b.res.rows.length === 0); });
await test('le professeur valide l’appel de son cours : heure serveur et totaux', async () => {
  const r = await as('prof', `select valider_appel('${C1}') as r`); const x = r.res?.rows?.[0]?.r;
  const a = await db.query(`select valide_a > now() - interval '1 minute' as recent, valide_par from appels where cours_id='${C1}'`);
  return r.ok && x.dispenses === 1 && x.presents === 1 && a.rows[0].recent === true && a.rows[0].valide_par === U.prof; });
await test('un autre professeur ne peut pas valider cet appel', async () => { const r = await as('prof2', `select valider_appel('${C1}')`); return !r.ok; });
await test('appels manquants : alerte professeur à 35 min, alerte vie scolaire à 100 min, rien pour un appel validé', async () => {
  const r = await as('vs2', `select cours_id, niveau from appels_manquants()`); if (!r.ok) return r.err;
  const m = Object.fromEntries(r.res.rows.map(x => [x.cours_id, x.niveau]));
  return m[C3] === 'professeur' && m[C2] === 'vie_scolaire' && !(C1 in m); });
await test('un élève ne voit pas les appels manquants', async () => { const r = await as('eleve', 'select * from appels_manquants()'); return !r.ok || r.res.rows.length === 0; });
await test('un professeur voit les appels manquants (lecture des réglages incluse)', async () => { const r = await as('prof', 'select * from appels_manquants()'); return r.ok && r.res.rows.length >= 1; });
await test('l’auteur d’une observation est celui du serveur (non falsifiable)', async () => {
  const r = await as('prof', `insert into observations(eleve_id, cours_id, auteur_id, type, texte) values ('${sarah}','${C1}','${U.dir}','travail','Travail non fait') returning auteur_id`);
  return r.ok && r.res.rows[0].auteur_id === U.prof; });
await test('un autre professeur ne modifie ni ne supprime l’observation d’un collègue', async () => {
  const a = await as('prof2', `update observations set texte='X' returning id`); const b = await as('prof2', `delete from observations returning id`);
  return (!a.ok || a.res.rows.length === 0) && (!b.ok || b.res.rows.length === 0); });
await test('un élève ne lit pas les observations', async () => { const r = await as('eleve', 'select * from observations'); return !r.ok || r.res.rows.length === 0; });
await test('le professeur crée une punition ; un collègue ne la modifie pas, la vie scolaire oui', async () => {
  const a = await as('prof', `insert into punitions(eleve_id, nature, type, motif, echeance) values ('${sarah}','punition','devoir supplémentaire','Bavardages', current_date + 3) returning id`);
  const b = await as('prof2', `update punitions set statut='faite' returning id`); const c = await as('vs2', `update punitions set statut='faite' returning statut`);
  return a.ok && (!b.ok || b.res.rows.length === 0) && c.ok && c.res.rows[0].statut === 'faite'; });
await test('une retenue enregistre son nombre d’heures (0 refusé)', async () => {
  const a = await as('prof', `insert into punitions(eleve_id, type, motif, duree_heures) values ('${sarah}','Retenue','Oubli répété', 2) returning duree_heures`);
  const b = await as('prof', `insert into punitions(eleve_id, type, motif, duree_heures) values ('${sarah}','Retenue','x', 0)`);
  return a.ok && Number(a.res.rows[0].duree_heures) === 2 && !b.ok; });
await test('un élève ne voit pas les punitions', async () => { const r = await as('eleve', 'select * from punitions'); return !r.ok || r.res.rows.length === 0; });
await test('coffre : la vie scolaire dépose (heure serveur) et restitue ; un professeur ne peut pas', async () => {
  const a = await as('vs2', `select deposer_telephone('${sarah}', 'B12')`); const b = await as('prof', `select deposer_telephone('${adam}', 'B13')`);
  const c = await db.query(`select casier, depose_a > now() - interval '1 minute' as recent from coffre_telephone where eleve_id='${sarah}'`);
  const d = await as('vs2', `select restituer_telephone('${sarah}')`); const e = await db.query(`select restitue_a is not null as r from coffre_telephone where eleve_id='${sarah}'`);
  return a.ok && !b.ok && c.rows[0].casier === 'B12' && c.rows[0].recent === true && d.ok && e.rows[0].r === true; });
await test('un professeur ne lit pas le coffre à téléphones', async () => { const r = await as('prof', 'select * from coffre_telephone'); return !r.ok || r.res.rows.length === 0; });
await test('téléphone non déposé : une observation est créée ; à partir de 3 non-dépôts, sanction à prévoir', async () => {
  await db.exec(`insert into coffre_telephone(eleve_id, jour, non_depose) values ('${adam}', current_date - 1, true), ('${adam}', current_date - 2, true)`);
  const r = await as('vs2', `select signaler_non_depot('${adam}') as r`); const x = r.res?.rows?.[0]?.r;
  const o = await db.query(`select count(*)::int n from observations where eleve_id='${adam}' and type='telephone'`);
  return r.ok && x.total === 3 && x.seuil === 3 && x.sanction_a_prevoir === true && o.rows[0].n === 1; });
await test('les changements de présence sont écrits au journal avec leur auteur', async () => {
  const r = await db.query(`select count(*)::int n from journal_audit where table_nom='presences' and auteur='${U.prof}' and operation='UPDATE'`); return r.rows[0].n >= 4; });

// ---------- Accès libre de test : ouverture puis retrait ----------
const lire = f => readFileSync(new URL('../dev_only/' + f, import.meta.url), 'utf8');
await db.exec(`grant usage on schema public to anon`);   // état par défaut de Supabase
await test('avant l’accès libre, un visiteur ne voit aucun élève', async () => { const r = await as('anon', 'select * from eleves'); return !r.ok || r.res.rows.length === 0; });
await db.exec(lire('acces_libre.sql'));
await test('accès libre : un visiteur voit les élèves et peut lancer le contrôle d’import', async () => {
  const a = await as('anon', 'select * from eleves'); const b = await as('anon', `select controler_import_eleves('[{"nom":"A"}]'::jsonb) as r`);
  return a.ok && a.res.rows.length > 0 && b.ok; });
await test('accès libre : appel, cours fictifs du jour et coffre fonctionnent sans connexion', async () => {
  const a = await as('anon', 'select dev_creer_cours_du_jour() as n'); const c = await as('anon', 'select id from cours limit 1');
  const b = await as('anon', `select ouvrir_appel('${c.res?.rows?.[0]?.id}') as n`);
  const d = await as('anon', `select deposer_telephone('${sarah}', 'C1')`);
  const e = await as('anon', `update presences set statut='absent' where cours_id='${c.res?.rows?.[0]?.id}' and eleve_id='${adam}' returning statut`);
  const f = await as('anon', `insert into observations(eleve_id,type,texte) values ('${adam}','autre','test libre') returning id`);
  return a.ok && a.res.rows[0].n > 0 && b.ok && b.res.rows[0].n > 0 && d.ok && e.ok && e.res.rows.length === 1 && f.ok; });
await db.exec(lire('retirer_acces_libre.sql'));
await test('après le retrait : plus d’appel ni de coffre sans connexion, fonction de test supprimée', async () => {
  const a = await as('anon', 'select * from presences'); const b = await as('anon', `select deposer_telephone('${sarah}', 'C1')`); const c = await as('anon', 'select dev_creer_cours_du_jour()');
  return (!a.ok || a.res.rows.length === 0) && !b.ok && !c.ok; });
await test('après le retrait : un visiteur ne voit plus rien et ne peut plus importer', async () => {
  const a = await as('anon', 'select * from eleves'); const b = await as('anon', `select controler_import_eleves('[]'::jsonb)`);
  return (!a.ok || a.res.rows.length === 0) && !b.ok; });
await test('après le retrait : les droits par rôle sont revenus (professeur, élève)', async () => {
  const a = await as('prof', `update eleves set nom='X' returning id`); const b = await as('eleve', 'select nom from eleves');
  const c = await as('dir', 'select count(*)::int as n from eleves');
  return (!a.ok || a.res.rows.length === 0) && b.ok && b.res.rows.length === 1 && c.ok && c.res.rows[0].n > 0; });

console.log(`\n${n - fails}/${n} tests réussis`);
process.exit(fails ? 1 : 0);
