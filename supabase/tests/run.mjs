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
await db.exec(readFileSync(new URL('../migrations/0004_vie_scolaire_complements.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../migrations/0005_notes_competences.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../migrations/0006_socle_officiel.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../migrations/0007_droits_notes.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../migrations/0008_notes_ameliorations.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../migrations/0009_modeles_auteur_optionnel.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../migrations/0010_appreciations_bulletins.sql', import.meta.url), 'utf8'));

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

// ---------- Étape 2 (compléments) ----------
const nouveauCours = async (ens, debutMin, extra = '') => (await db.query(
  `insert into cours(enseignement_id, debut, fin${extra ? ', ' + extra.split('=')[0] : ''}) select ${ens}, now() + interval '${debutMin} minutes', now() + interval '${debutMin + 55} minutes'${extra ? ', ' + extra.split('=')[1] : ''} from ids returning id`)).rows[0].id;
const statutDe = async (cours, eleve) => (await db.query(`select * from presences where cours_id='${cours}' and eleve_id='${eleve}'`)).rows[0];

await test('appel validé : le professeur ne peut plus modifier une présence', async () => {
  const r = await as('prof', `update presences set statut='absent' where cours_id='${C1}' and eleve_id='${adam}'`); return !r.ok && /correction/.test(r.err); });
await test('correction : refusée au professeur et sans motif, acceptée par la vie scolaire avec heure réelle, tracée', async () => {
  const pid = (await statutDe(C1, adam)).id;
  const a = await as('prof', `select corriger_presence('${pid}', 'retard', 'erreur')`);
  const b = await as('vs2', `select corriger_presence('${pid}', 'retard', '  ')`);
  const c = await as('vs2', `select corriger_presence('${pid}', 'retard', 'Arrivé en retard, oubli du prof', (select debut + interval '7 minutes' from cours where id='${C1}'))`);
  const x = await statutDe(C1, adam); const k = await db.query(`select count(*)::int n from corrections_presence where presence_id='${pid}' and auteur_id='${U.vs2}'`);
  return !a.ok && !b.ok && c.ok && x.statut === 'retard' && x.minutes_retard === 10 && k.rows[0].n === 1; });
await test('justification : le professeur ne peut pas justifier, la vie scolaire oui (qui et quand)', async () => {
  await as('vs2', `update presences set statut='absent' where cours_id='${C2}' and eleve_id='${adam}'`);
  await as('prof2', `update presences set justifiee=true, justificatif_recu=true where cours_id='${C2}'`);
  const a = await statutDe(C2, adam);
  const r = await as('vs2', `select justifier_absences(array[(select id from presences where cours_id='${C2}' and eleve_id='${adam}')], true, 'Malade', true) as n`);
  const b = await statutDe(C2, adam);
  return a.justifiee === false && r.ok && r.res.rows[0].n === 1 && b.justifiee === true && b.justificatif_recu === true && b.justifie_par === U.vs2 && b.motif === 'Malade'; });
await test('un professeur ne crée pas d’absence prévue', async () => {
  const r = await as('prof', `insert into absences_prevues(eleve_id, debut, fin, motif) values ('${sarah}', now(), now() + interval '1 hour', 'x')`); return !r.ok; });
let C4, C5;
await test('absence prévue : l’élève est pré-rempli « absent justifié » à l’ouverture de l’appel', async () => {
  C5 = await nouveauCours('ens_prof', 240);
  await as('vs2', `insert into absences_prevues(eleve_id, debut, fin, type, motif, justificatif_recu) values ('${adam}', now() + interval '3 hours', now() + interval '6 hours', 'rendez_vous', 'Orthodontiste', true)`);
  const r = await as('prof', `select ouvrir_appel('${C5}')`); const a = await statutDe(C5, adam), s = await statutDe(C5, sarah);
  return r.ok && a.statut === 'absent' && a.justifiee && a.justificatif_recu && a.motif === 'Rendez-vous : Orthodontiste' && s.statut === 'present'; });
await test('absence prévue saisie après l’ouverture : l’appel non validé est mis à jour', async () => {
  C4 = await nouveauCours('ens_prof', 120); await as('prof', `select ouvrir_appel('${C4}')`);
  await as('vs2', `insert into absences_prevues(eleve_id, debut, fin, type, motif) values ('${sarah}', now() + interval '1 hour', now() + interval '3 hours', 'sortie_pedagogique', 'Musée')`);
  const s = await statutDe(C4, sarah); return s.statut === 'absent' && s.justifiee && s.motif === 'Sortie pédagogique : Musée'; });
await test('hors ligne : l’heure du téléphone est retenue (retard de 10 min) et la saisie marquée', async () => {
  const r = await as('prof2', `select synchroniser_presences('${C3}', jsonb_build_array(jsonb_build_object('eleve_id','${adam}','statut','retard','heure', (select (debut + interval '10 minutes')::text from cours where id='${C3}')))) as r`);
  const a = await statutDe(C3, adam); return r.ok && r.res.rows[0].r.appliques === 1 && a.minutes_retard === 10 && a.saisie_hors_ligne === true; });
await test('hors ligne : une heure dans le futur est ramenée à l’heure du serveur', async () => {
  await as('prof2', `select synchroniser_presences('${C3}', jsonb_build_array(jsonb_build_object('eleve_id','${sarah}','statut','retard','heure', (now() + interval '1 hour')::text)))`);
  const s = await statutDe(C3, sarah); return s.minutes_retard >= 35 && Math.abs(new Date(s.heure_evenement) - Date.now()) < 120000; });
await test('hors ligne : rien n’est appliqué si l’appel a été validé entre-temps', async () => {
  const r = await as('prof', `select synchroniser_presences('${C1}', jsonb_build_array(jsonb_build_object('eleve_id','${sarah}','statut','absent')))  as r`);
  return r.ok && r.res.rows[0].r.appliques === 0 && /validé/.test(r.res.rows[0].r.raison); });
await test('un client ne peut pas se marquer « saisie hors ligne » lui-même', async () => {
  await as('prof', `update presences set saisie_hors_ligne=true where cours_id='${C4}'`); const s = await statutDe(C4, adam); return s.saisie_hors_ligne === false; });
let C6, C7;
await test('cours annulé : plus dans les appels manquants, appel impossible ; le professeur ne peut pas annuler', async () => {
  C6 = await nouveauCours('ens_prof2', -50);
  const av = await as('vs2', `select cours_id from appels_manquants() where cours_id='${C6}'`);
  const a = await as('prof2', `select annuler_cours('${C6}', true, 'Absent')`);
  const b = await as('vs2', `select annuler_cours('${C6}', true, 'Professeur absent')`);
  const ap = await as('vs2', `select cours_id from appels_manquants() where cours_id='${C6}'`);
  const c = await as('vs2', `select ouvrir_appel('${C6}')`);
  return av.res.rows.length === 1 && !a.ok && b.ok && ap.res.rows.length === 0 && !c.ok && /annulé/.test(c.err); });
await test('remplaçant : il fait l’appel du cours et c’est lui qu’on relance', async () => {
  C7 = await nouveauCours('ens_prof', -40);
  const a = await as('prof2', `select ouvrir_appel('${C7}')`);
  const b = await as('vs2', `select remplacer_cours('${C7}', '${U.prof2}')`);
  const c = await as('prof2', `select ouvrir_appel('${C7}')`);
  const m = await as('vs2', `select professeur_id from appels_manquants() where cours_id='${C7}'`);
  return !a.ok && b.ok && c.ok && m.res.rows[0].professeur_id === U.prof2; });
await test('liste des professeurs : réservée au personnel connecté', async () => {
  const a = await as('vs2', 'select * from liste_professeurs()'); const b = await as('eleve', 'select * from liste_professeurs()');
  return a.ok && a.res.rows.length >= 2 && (!b.ok || b.res.rows.length === 0); });
await test('jour fermé (vacances) : pas d’appel manquant ce jour-là ; un professeur ne saisit pas le calendrier', async () => {
  const p = await as('prof', `insert into fermetures(debut, fin, motif) values (current_date, current_date, 'x')`);
  await as('dir', `insert into fermetures(debut, fin, motif) values (current_date, current_date, 'Journée pédagogique')`);
  const m = await as('vs2', 'select * from appels_manquants()');
  await as('dir', `delete from fermetures`);
  const m2 = await as('vs2', 'select * from appels_manquants()');
  return !p.ok && m.res.rows.length === 0 && m2.res.rows.length >= 1; });
await test('groupe : l’appel ne liste que les élèves du groupe ; un professeur ne crée pas de groupe', async () => {
  const p = await as('prof', `insert into groupes(classe_id, nom) select classe, 'X' from ids`);
  const g = (await as('vs2', `insert into groupes(classe_id, nom) values ((select id from classes where nom='5e A'), 'Groupe 1') returning id`)).res.rows[0].id;
  await as('vs2', `insert into groupe_eleves(groupe_id, eleve_id) values ('${g}', '${sarah}')`);
  const c = await nouveauCours('ens_prof', 300, `groupe_id='${g}'`);
  const r = await as('prof', `select ouvrir_appel('${c}') as n`);
  return !p.ok && r.ok && r.res.rows[0].n === 1 && (await statutDe(c, sarah)).statut === 'present'; });
let RET;
await test('retenue d’un professeur : demande, heures obligatoires, il ne peut pas la valider lui-même', async () => {
  const a = await as('prof', `insert into punitions(eleve_id, type, motif) values ('${sarah}', 'Retenue', 'Insolence')`);
  const b = await as('prof', `insert into punitions(eleve_id, type, motif, duree_heures, statut) values ('${sarah}', 'Retenue', 'Insolence', 2, 'faite') returning id, statut`);
  RET = b.res?.rows?.[0]?.id;
  await as('prof', `update punitions set statut='a_faire' where id='${RET}'`);
  const x = (await db.query(`select statut from punitions where id='${RET}'`)).rows[0].statut;
  return !a.ok && /heures/.test(a.err) && b.ok && b.res.rows[0].statut === 'demandee' && x === 'demandee'; });
await test('retenue : la vie scolaire la place sur une séance puis pointe la présence', async () => {
  const s = (await as('vs2', `insert into seances_retenue(debut, fin, salle, surveillant) values (now() + interval '2 days', now() + interval '2 days 2 hours', 'Salle 3', 'M. Kaci') returning id`)).res.rows[0].id;
  const a = await as('vs2', `update punitions set seance_id='${s}', statut='a_faire' where id='${RET}' returning statut`);
  const b = await as('prof', `update punitions set presence_retenue='present' where id='${RET}'`);
  const c = await as('vs2', `update punitions set presence_retenue='present', statut='faite' where id='${RET}' returning statut, presence_retenue`);
  return a.ok && a.res.rows[0].statut === 'a_faire' && c.ok && c.res.rows[0].statut === 'faite' && c.res.rows[0].presence_retenue === 'present'; });
await test('sanction : refusée au professeur, décidée par la direction', async () => {
  const a = await as('prof', `insert into punitions(eleve_id, nature, type, motif) values ('${adam}', 'sanction', 'Avertissement', 'Violence verbale')`);
  const b = await as('dir', `insert into punitions(eleve_id, nature, type, motif) values ('${adam}', 'sanction', 'Avertissement', 'Violence verbale') returning id`);
  return !a.ok && /direction/.test(a.err) && b.ok; });
await test('incident : rédigé par un professeur, lu par la vie scolaire, pas par un collègue ni un élève', async () => {
  const i = (await as('prof', `insert into incidents(lieu, description) values ('Cour', 'Bagarre') returning id`)).res.rows[0].id;
  const a = await as('prof', `insert into incident_eleves(incident_id, eleve_id, role) values ('${i}', '${adam}', 'auteur'), ('${i}', '${sarah}', 'victime')`);
  const b = await as('prof2', 'select * from incidents'); const c = await as('vs2', `select * from incident_eleves where incident_id='${i}'`);
  const d = await as('eleve', 'select * from incidents');
  return a.ok && (!b.ok || b.res.rows.length === 0) && c.res.rows.length === 2 && (!d.ok || d.res.rows.length === 0); });
await test('infirmerie : heure d’arrivée du serveur, lecture vie scolaire seulement', async () => {
  const a = await as('prof', `insert into passages_infirmerie(eleve_id, motif, arrivee_a) values ('${sarah}', 'Mal de tête', '2000-01-01')`);
  const b = await as('prof', 'select * from passages_infirmerie'); const x = (await db.query(`select arrivee_a > now() - interval '1 minute' r from passages_infirmerie`)).rows[0].r;
  return a.ok && (!b.ok || b.res.rows.length === 0) && x === true; });
await test('infirmerie : départ « récupéré par la famille » = sortie dans le cours en cours, tracée', async () => {
  const pid = (await db.query(`select id from passages_infirmerie limit 1`)).rows[0].id;
  const a = await as('prof', `select infirmerie_depart('${pid}', 'retour_classe')`);
  const b = await as('vs2', `select infirmerie_depart('${pid}', 'recupere_famille')`);
  const c = await as('vs2', `select infirmerie_depart('${pid}', 'recupere_famille', 'La mère')`);
  const p = (await db.query(`select p.statut, p.recupere_par from presences p join cours c on c.id=p.cours_id where p.eleve_id='${sarah}' and c.debut <= now() and c.fin > now() order by c.debut desc limit 1`)).rows[0];
  const k = await db.query(`select count(*)::int n from corrections_presence where motif like 'Départ depuis%'`);
  return !a.ok && !b.ok && c.ok && p.statut === 'sortie' && p.recupere_par === 'La mère' && k.rows[0].n === 1; });
await test('observation confidentielle : invisible pour un collègue, visible pour la vie scolaire et son auteur', async () => {
  await as('prof', `insert into observations(eleve_id, type, texte, confidentielle) values ('${sarah}', 'autre', 'Situation familiale', true)`);
  const a = await as('prof2', `select * from observations where confidentielle`); const b = await as('vs2', `select * from observations where confidentielle`);
  const c = await as('prof', `select * from observations where confidentielle`);
  return a.res.rows.length === 0 && b.res.rows.length === 1 && c.res.rows.length === 1; });
await test('élèves à surveiller : seuil de retards réglable ; rien pour un élève', async () => {
  await as('dir', `update parametres set valeur='1' where cle='retards_seuil_alerte'`);
  const r = await as('vs2', 'select * from eleves_a_surveiller()'); const e = await as('eleve', 'select * from eleves_a_surveiller()');
  await as('dir', `update parametres set valeur='3' where cle='retards_seuil_alerte'`);
  const s = r.res?.rows?.find(x => x.eleve_id === sarah);
  return r.ok && s && s.motifs.includes('retards') && (!e.ok || e.res.rows.length === 0); });
await test('élèves à surveiller : demi-journées d’absence non justifiées du mois', async () => {
  await as('dir', `update parametres set valeur='1' where cle='absences_demi_journees_seuil'`);
  await as('vs2', `update presences set statut='absent' where cours_id='${C7}' and eleve_id='${adam}'`);
  const r = await as('vs2', 'select * from eleves_a_surveiller()');
  await as('dir', `update parametres set valeur='4' where cle='absences_demi_journees_seuil'`);
  const a = r.res?.rows?.find(x => x.eleve_id === adam); return r.ok && a && a.demi_journees_mois >= 1 && a.motifs.includes('absences'); });
await test('statistiques d’absentéisme par classe', async () => {
  const r = await as('vs2', `select * from stats_absenteisme(current_date - 1, current_date + 1) where classe='5e A'`);
  const x = r.res?.rows?.[0]; return r.ok && x.saisies > 0 && x.absences >= 1 && Number(x.taux_absence) > 0; });

// ---------- Étape 3 : notes et compétences ----------
await db.exec(`
  insert into periodes(annee_id, numero, libelle, debut, fin) select id, 1, 'Trimestre 1', '2026-09-01', '2026-12-18' from annees_scolaires where active;
  insert into periodes(annee_id, numero, libelle, debut, fin) select id, 2, 'Trimestre 2', '2027-01-05', '2027-03-26' from annees_scolaires where active;
  insert into periodes(annee_id, numero, libelle, debut, fin) select id, 3, 'Trimestre 3', '2027-04-12', '2027-07-04' from annees_scolaires where active;
  insert into user_roles(user_id, role) values ('${U.prof2}', 'professeur_principal');
  update classes set prof_principal_id = '${U.prof2}' where nom = '5e A';
  update enseignements set coefficient = 3 where matiere_id = (select id from matieres where code='MATH');
  update enseignements set coefficient = 2 where matiere_id = (select id from matieres where code='EPS');
  insert into eleves(nom, prenom, date_naissance, classe_id) select 'Kaci','Lina','2014-01-10', id from classes where nom='6e A';
`);
const un = async sql => (await db.query(sql)).rows[0];
const T1 = (await un(`select id from periodes where numero=1`)).id, T2 = (await un(`select id from periodes where numero=2`)).id;
const cl5 = (await un(`select id from classes where nom='5e A'`)).id;
const ensEps = (await un(`select e.id from enseignements e join matieres m on m.id=e.matiere_id where e.classe_id='${cl5}' and m.code='EPS'`)).id;
const ensMath = (await un(`select e.id from enseignements e join matieres m on m.id=e.matiere_id where e.classe_id='${cl5}' and m.code='MATH'`)).id;
const lina = (await un(`select id from eleves where nom='Kaci' and prenom='Lina'`)).id;
const evid = async t => (await un(`select id from evaluations where titre='${t}'`)).id;
const saisir = (user, ev, lignes) => as(user, `select saisir_notes('${ev}', '${JSON.stringify(lignes)}'::jsonb) as n`);
const moyMat = async (user, per, ens) => (await as(user, `select eleve_id, moyenne, nb_notes, moyenne_classe, minimum, maximum from moyennes_matieres('${cl5}', ${per ? `'${per}'` : 'null'}) where enseignement_id='${ens}'`)).res?.rows || [];
const moyGen = async (user, per) => (await as(user, `select * from moyennes_generales('${cl5}', ${per ? `'${per}'` : 'null'})`)).res?.rows || [];
const de = (rows, id) => rows.find(r => r.eleve_id === id);

await test('évaluation : la période est déduite de la date et l’auteur posé par le serveur', async () => {
  const r = await as('prof', `insert into evaluations(enseignement_id, titre, date_eval, periode_id, created_by) values ('${ensEps}', 'Course longue', '2026-10-12', '${T2}', '${U.dir}') returning periode_id, created_by`);
  return r.ok && r.res.rows[0].periode_id === T1 && r.res.rows[0].created_by === U.prof; });
await test('un professeur ne crée pas d’évaluation dans l’enseignement d’un collègue', async () => {
  const r = await as('prof', `insert into evaluations(enseignement_id, titre, date_eval) values ('${ensMath}', 'Intrus', '2026-10-12')`); return !r.ok; });
await test('une date hors de toute période est refusée', async () => {
  const r = await as('prof', `insert into evaluations(enseignement_id, titre, date_eval) values ('${ensEps}', 'Été', '2026-08-15')`); return !r.ok && r.err.includes('Aucune période'); });
await test('saisie : virgule décimale acceptée, puis note, absent', async () => {
  const ev = await evid('Course longue');
  const a = await saisir('prof', ev, [{ eleve_id: sarah, valeur: '16,5' }]);
  const v1 = await un(`select valeur from notes where eleve_id='${sarah}' and evaluation_id='${ev}'`);
  const b = await saisir('prof', ev, [{ eleve_id: sarah, valeur: '16' }, { eleve_id: adam, valeur: '12' }]);
  return a.ok && Number(v1.valeur) === 16.5 && b.ok && b.res.rows[0].n === 2; });
await test('saisie : note au-dessus du barème, négative ou illisible refusée', async () => {
  const ev = await evid('Course longue');
  const a = await saisir('prof', ev, [{ eleve_id: sarah, valeur: '21' }]); const b = await saisir('prof', ev, [{ eleve_id: sarah, valeur: '-1' }]);
  const c = await saisir('prof', ev, [{ eleve_id: sarah, valeur: 'abc' }]);
  return !a.ok && a.err.includes('barème') && !b.ok && b.err.includes('négative') && !c.ok && c.err.includes('illisible'); });
await test('saisie : un élève d’une autre classe est refusé, et rien n’est écrit (tout ou rien)', async () => {
  const ev = await evid('Course longue');
  const a = await saisir('prof', ev, [{ eleve_id: adam, valeur: '5' }, { eleve_id: lina, valeur: '5' }]);
  const k = await un(`select valeur from notes where eleve_id='${adam}' and evaluation_id='${ev}'`);
  return !a.ok && a.err.includes('pas dans la classe') && Number(k.valeur) === 12; });
await test('un autre professeur ne saisit pas dans l’évaluation d’un collègue', async () => {
  const r = await saisir('prof2', await evid('Course longue'), [{ eleve_id: sarah, valeur: '1' }]); return !r.ok; });
await test('élève et visiteur ne voient aucune note ni compétence ; la direction les lit', async () => {
  const noms = ['evaluations', 'notes', 'acquisitions', 'bilans_competences'];
  for (const t of noms) { const e = await as('eleve', `select * from ${t}`); const a = await as('anon', `select * from ${t}`);
    if ((e.ok && e.res.rows.length) || (a.ok && a.res.rows.length)) return `fuite sur ${t}`; }
  const v = await as('dir', 'select * from notes'); return v.ok && v.res.rows.length > 0; });
await test('réglages des couleurs : 18 et 8 par défaut, lisibles par les professeurs', async () => {
  const r = await as('prof', `select cle, valeur #>> '{}' as v from parametres where cle in ('note_seuil_haut','note_seuil_bas')`);
  const m = Object.fromEntries((r.res?.rows || []).map(x => [x.cle, x.v])); return m.note_seuil_haut === '18' && m.note_seuil_bas === '8'; });

// Moyennes : MATH = contrôle /20 coef 1 + interro /10 coef 2 ; EPS = course /20
for (const [titre, date, bareme, coef] of [['Contrôle 1', '2026-10-20', 20, 1], ['Interro 2', '2026-11-05', 10, 2]])
  await as('prof2', `insert into evaluations(enseignement_id, titre, date_eval, bareme, coefficient) values ('${ensMath}', '${titre}', '${date}', ${bareme}, ${coef})`);
await saisir('prof2', await evid('Contrôle 1'), [{ eleve_id: sarah, valeur: '10' }, { eleve_id: adam, valeur: '14' }]);
await saisir('prof2', await evid('Interro 2'), [{ eleve_id: sarah, valeur: '8' }, { eleve_id: adam, statut: 'absent' }]);
await test('moyenne d’une matière : notes ramenées sur 20 et pondérées, absent ignoré', async () => {
  const m = await moyMat('dir', null, ensMath); const s = de(m, sarah), a = de(m, adam);
  return Number(s.moyenne) === 14 && Number(a.moyenne) === 14 && s.nb_notes === 2 && a.nb_notes === 1; });
await test('moyenne générale : coefficients des matières, rang et statistiques de classe', async () => {
  const g = await moyGen('dir', null); const s = de(g, sarah), a = de(g, adam);
  return Number(s.moyenne) === 14.8 && s.rang === 1 && Number(a.moyenne) === 13.2 && a.rang === 2
    && Number(s.moyenne_classe) === 14 && Number(s.minimum) === 13.2 && Number(s.maximum) === 14.8; });
await test('un devoir non rendu compte 0 ; dispensé est ignoré ; le réglage change le calcul', async () => {
  await as('prof2', `insert into evaluations(enseignement_id, titre, date_eval) values ('${ensMath}', 'Devoir maison', '2026-11-20')`);
  await saisir('prof2', await evid('Devoir maison'), [{ eleve_id: sarah, statut: 'dispense' }, { eleve_id: adam, statut: 'non_rendu' }]);
  const m = await moyMat('dir', null, ensMath); const g = await moyGen('dir', null);
  const ok1 = Number(de(m, adam).moyenne) === 7 && Number(de(m, sarah).moyenne) === 14 && Number(de(m, adam).moyenne_classe) === 10.5 && Number(de(g, adam).moyenne) === 9;
  await as('dir', `update parametres set valeur='false' where cle='note_non_rendu_compte_zero'`);
  const m2 = await moyMat('dir', null, ensMath);
  await as('dir', `update parametres set valeur='true' where cle='note_non_rendu_compte_zero'`);
  return ok1 && Number(de(m2, adam).moyenne) === 14; });
await test('moyennes par période et sur l’année', async () => {
  await as('prof2', `insert into evaluations(enseignement_id, titre, date_eval) values ('${ensMath}', 'Contrôle T2', '2027-01-20')`);
  await saisir('prof2', await evid('Contrôle T2'), [{ eleve_id: sarah, valeur: '20' }]);
  const t1 = de(await moyMat('dir', T1, ensMath), sarah), t2 = de(await moyMat('dir', T2, ensMath), sarah), an = de(await moyMat('dir', null, ensMath), sarah);
  return Number(t1.moyenne) === 14 && Number(t2.moyenne) === 20 && Number(an.moyenne) === 15.5; });
await test('un élève ou un visiteur ne peut calculer aucune moyenne', async () => {
  const a = await as('eleve', `select * from moyennes_generales('${cl5}', null)`); const b = await as('anon', `select * from moyennes_generales('${cl5}', null)`);
  const c = await as('eleve', `select * from calcul_moyennes_ens('${cl5}', null)`);
  return (!a.ok || a.res.rows.length === 0) && !b.ok && !c.ok; });
await test('chaque modification de note est dans le journal, avec son auteur', async () => {
  const x = await un(`select auteur, (avant->>'valeur')::numeric as avant, (apres->>'valeur')::numeric as apres from journal_audit
                      where table_nom='notes' and operation='UPDATE' and (avant->>'valeur')::numeric = 16.5 limit 1`);
  return x && x.auteur === U.prof && Number(x.apres) === 16; });
await test('le barème ne peut pas passer sous une note déjà saisie', async () => {
  const r = await as('prof', `update evaluations set bareme=10 where titre='Course longue'`); return !r.ok && r.err.includes('barème'); });

// Verrouillage de période
await db.exec(`update periodes set verrouillee = true where id = '${T1}'`);
await test('période verrouillée : le professeur ne modifie, n’ajoute ni ne supprime plus rien', async () => {
  const ev = await evid('Course longue');
  const a = await saisir('prof', ev, [{ eleve_id: sarah, valeur: '15' }]);
  const b = await as('prof', `insert into evaluations(enseignement_id, titre, date_eval) values ('${ensEps}', 'Tardif', '2026-10-30')`);
  const c = await as('prof', `delete from evaluations where id='${ev}'`);
  const d = await as('prof', `update evaluations set titre='Renommée' where id='${ev}'`);
  return !a.ok && a.err.includes('verrouillée') && !b.ok && !c.ok && !d.ok; });
await test('période verrouillée : la direction peut encore corriger', async () => {
  const r = await as('dir', `update notes set valeur=15 where eleve_id='${sarah}' and evaluation_id='${await evid('Course longue')}' returning valeur`); return r.ok && r.res.rows.length === 1; });
await db.exec(`update periodes set verrouillee = false where id = '${T1}'`);
await saisir('prof', await evid('Course longue'), [{ eleve_id: sarah, valeur: '16' }]);
await test('période déverrouillée : le professeur peut de nouveau saisir', async () => {
  const r = await un(`select valeur from notes where eleve_id='${sarah}' and evaluation_id='${await evid('Course longue')}'`); return Number(r.valeur) === 16; });

// Compétences
await test('catalogue du socle : 8 compétences par cycle, cycle selon le niveau', async () => {
  const r = await as('prof', `select cycle, count(*)::int n from competences group by cycle order by cycle`);
  const c = await un(`select cycle_du_niveau('6e') a, cycle_du_niveau('5e') b, cycle_du_niveau('3e') c`);
  return r.ok && r.res.rows.length === 2 && r.res.rows.every(x => x.n === 8) && c.a === 3 && c.b === 4 && c.c === 4; });
await test('seule l’administration modifie le catalogue de compétences', async () => {
  const a = await as('prof', `insert into competences(cycle, code, domaine, libelle) values (4, 'X1', 'Établissement', 'Test')`);
  const b = await as('dir', `insert into competences(cycle, code, domaine, libelle) values (4, 'X1', 'Établissement', 'Compétence propre au collège') returning id`);
  return !a.ok && b.ok; });
const d14 = (await un(`select id from competences where cycle=4 and code='D1.4'`)).id, d11 = (await un(`select id from competences where cycle=4 and code='D1.1'`)).id;
await as('prof', `insert into evaluations(enseignement_id, titre, date_eval) values ('${ensEps}', 'Match basket', '2026-11-10')`);
for (const t of ['Course longue', 'Match basket']) await as('prof', `insert into evaluation_competences values ('${await evid(t)}', '${d14}')`);
await test('compétences : niveaux saisis, un niveau sur une compétence non liée est refusé', async () => {
  const ev1 = await evid('Course longue'), ev2 = await evid('Match basket');
  const a = await as('prof', `select saisir_acquisitions('${ev1}', '${JSON.stringify([{ eleve_id: sarah, competence_id: d14, niveau: 3 }, { eleve_id: adam, competence_id: d14, niveau: 2 }])}'::jsonb) as n`);
  const b = await as('prof', `select saisir_acquisitions('${ev2}', '${JSON.stringify([{ eleve_id: sarah, competence_id: d14, niveau: 4 }])}'::jsonb) as n`);
  const c = await as('prof', `select saisir_acquisitions('${ev1}', '${JSON.stringify([{ eleve_id: sarah, competence_id: d11, niveau: 4 }])}'::jsonb) as n`);
  const d = await as('prof', `select saisir_acquisitions('${ev1}', '${JSON.stringify([{ eleve_id: sarah, competence_id: d14, niveau: 5 }])}'::jsonb) as n`);
  return a.ok && a.res.rows[0].n === 2 && b.ok && !c.ok && !d.ok; });
await test('bilan : niveau proposé = moyenne arrondie des niveaux saisis', async () => {
  const r = await as('dir', `select * from bilan_competences('${cl5}', '${T1}') where competence_id='${d14}'`); const s = de(r.res.rows, sarah), a = de(r.res.rows, adam);
  return Number(s.moyenne) === 3.5 && s.niveau_propose === 4 && s.niveau_retenu === 4 && s.nb === 2 && a.niveau_propose === 2 && s.modifie === false; });
await test('bilan : seul le professeur principal de la classe (ou la direction) corrige un niveau', async () => {
  const ins = (u, e) => as(u, `insert into bilans_competences(eleve_id, competence_id, periode_id, niveau) values ('${e}', '${d14}', '${T1}', 1)`);
  const a = await ins('prof', sarah), b = await ins('prof2', lina), c = await ins('prof2', sarah);
  const r = await as('dir', `select * from bilan_competences('${cl5}', '${T1}') where competence_id='${d14}'`); const s = de(r.res.rows, sarah);
  return !a.ok && !b.ok && c.ok && s.niveau_propose === 4 && s.niveau_retenu === 1 && s.modifie === true; });
await test('un élève ne lit pas le bilan de compétences', async () => {
  const r = await as('eleve', `select * from bilan_competences('${cl5}', '${T1}')`); return !r.ok || r.res.rows.length === 0; });

// ---------- Accès libre de test : ouverture puis retrait ----------
const lire = f => readFileSync(new URL('../dev_only/' + f, import.meta.url), 'utf8');
await db.exec(`grant usage on schema public to anon`);   // état par défaut de Supabase
await test('avant l’accès libre, un visiteur ne voit aucun élève', async () => { const r = await as('anon', 'select * from eleves'); return !r.ok || r.res.rows.length === 0; });

// ---------- Socle commun : libellés officiels et protection ----------
await test('socle : 8 composantes officielles par cycle, avec libellés exacts du décret 2015-372 et source', async () => {
  const r = await as('dir', `select cycle, code, libelle, domaine, officiel, source_ref from competences where officiel order by cycle, ordre`);
  const l3 = r.res.rows.filter(x => x.cycle === 3), l4 = r.res.rows.filter(x => x.cycle === 4);
  const att = ['Comprendre, s\u2019exprimer en utilisant la langue française à l\u2019oral et à l\u2019écrit', 'Comprendre, s\u2019exprimer en utilisant une langue étrangère et, le cas échéant, une langue régionale',
    'Comprendre, s\u2019exprimer en utilisant les langages mathématiques, scientifiques et informatiques', 'Comprendre, s\u2019exprimer en utilisant les langages des arts et du corps',
    'Les méthodes et outils pour apprendre', 'La formation de la personne et du citoyen', 'Les systèmes naturels et les systèmes techniques', 'Les représentations du monde et l\u2019activité humaine'];
  const n = s => s.replace(/'/g, '\u2019');
  return l3.length === 8 && l4.length === 8 && [l3, l4].every(l => l.every((x, i) => n(x.libelle) === att[i] && /2015-372/.test(x.source_ref))); });
await test('socle : une compétence officielle ne se modifie ni ne se supprime ; on peut la désactiver', async () => {
  const a = await as('dir', `update competences set libelle='Autre texte' where code='D2' and cycle=4 returning id`);
  const b = await as('dir', `delete from competences where code='D2' and cycle=4 returning id`);
  const c = await as('dir', `update competences set actif=false where code='D2' and cycle=4 returning id`);
  await as('dir', `update competences set actif=true where code='D2' and cycle=4`);
  return !a.ok && !b.ok && c.ok && c.res.rows.length === 1; });
await test('socle : une compétence ajoutée par le collège n’est jamais « officielle »', async () => {
  const r = await as('dir', `insert into competences(cycle, code, domaine, libelle, officiel, source_ref) values (4, 'LOC1', 'Local', 'Compétence du collège', true, 'faux') returning officiel, source_ref`);
  return r.ok && r.res.rows[0].officiel === false && r.res.rows[0].source_ref === null; });
await test('droits d’affichage : la direction est admin ; le prof connaît sa matière ; le prof principal sa classe', async () => {
  const d = await as('dir', 'select mes_droits_notes() r'); const p = await as('prof', 'select mes_droits_notes() r'); const p2 = await as('prof2', 'select mes_droits_notes() r');
  return d.res.rows[0].r.admin === true && p.res.rows[0].r.admin === false && p.res.rows[0].r.enseignements.includes(ensEps)
      && p2.res.rows[0].r.classes_pp.includes(cl5) && p2.res.rows[0].r.enseignements.includes(ensMath); });
await test('droits d’affichage : fermés aux visiteurs sans connexion', async () => { const r = await as('anon', 'select mes_droits_notes()'); return !r.ok; });

// ---------- Historique, copie d'évaluation, bibliothèque entre professeurs ----------
const evCL = (await un(`select id from evaluations where titre='Course longue'`)).id;
await test('historique : les saisies sont tracées, visibles du professeur, du prof principal et de la direction, pas des élèves', async () => {
  const h = await as('prof', `select * from historique_notes('${evCL}')`); const d = await as('dir', `select * from historique_notes('${evCL}')`);
  const p2 = await as('prof2', `select * from historique_notes('${evCL}')`); const e = await as('eleve', `select * from historique_notes('${evCL}')`);
  return h.ok && h.res.rows.length > 0 && h.res.rows.some(r => r.operation === 'INSERT') && d.res.rows.length === h.res.rows.length && p2.res.rows.length > 0 && (!e.ok || e.res.rows.length === 0); });
await test('historique : fermé à la vie scolaire et aux visiteurs (tant que le réglage « tout le personnel » est coupé)', async () => {
  const v = await as('vs2', `select * from historique_notes('${evCL}')`); const a = await as('anon', `select * from historique_notes('${evCL}')`); return v.ok && v.res.rows.length === 0 && !a.ok; });
await test('copie : le professeur copie son évaluation (sans les notes) ; pas sur la matière d’un collègue', async () => {
  const ok = await as('prof', `select copier_evaluation('${evCL}', '${ensEps}', '2026-12-05') id`); const nouv = ok.res?.rows?.[0]?.id;
  const n = nouv && await as('prof', `select e.titre, e.bareme, (select count(*)::int from notes where evaluation_id = e.id) nb, e.periode_id from evaluations e where e.id = '${nouv}'`);
  const non = await as('prof', `select copier_evaluation('${evCL}', '${ensMath}', '2026-12-05')`);
  return ok.ok && n.res.rows[0].titre === 'Course longue' && n.res.rows[0].nb === 0 && !!n.res.rows[0].periode_id && !non.ok; });
await test('bibliothèque : un modèle partagé est lu par les collègues et réutilisable ; un modèle privé reste privé', async () => {
  const pub = await as('prof', `select publier_modele('${evCL}', 'Course de durée, 3 niveaux', true) id`); const mid = pub.res?.rows?.[0]?.id;
  const priv = await as('prof', `select publier_modele('${evCL}', 'Brouillon', false) id`); const pid = priv.res?.rows?.[0]?.id;
  const vu = await as('prof2', `select id from modeles_evaluation`); const ids = (vu.res?.rows || []).map(r => r.id);
  const use = await as('prof2', `select utiliser_modele('${mid}', '${ensMath}', '2026-12-07') id`);
  const ev = use.ok && await as('prof2', `select titre, enseignement_id from evaluations where id = '${use.res.rows[0].id}'`);
  const eleve = await as('eleve', `select id from modeles_evaluation`);
  return pub.ok && priv.ok && ids.includes(mid) && !ids.includes(pid) && use.ok && ev.res.rows[0].titre === 'Course longue' && ev.res.rows[0].enseignement_id === ensMath && (!eleve.ok || eleve.res.rows.length === 0); });
await test('bibliothèque : on ne publie que ses propres évaluations ; on n’efface que ses propres modèles', async () => {
  const evMath = (await un(`select id from evaluations where enseignement_id='${ensMath}' limit 1`));
  const a = evMath && await as('prof', `select publier_modele('${evMath.id}', 'Volé', true)`);
  const b = await as('prof2', `delete from modeles_evaluation where created_by <> '${U.prof2}' returning id`);
  return (!evMath || !a.ok) && (!b.ok || b.res.rows.length === 0); });

// ---------- Étape 4 : appréciations et bulletins ----------
const appr0 = (u, ens, per, lignes) => as(u, `select saisir_appreciations('${ens}', '${per}', '${JSON.stringify(lignes).replace(/'/g, "''")}'::jsonb) n`);
const appr = appr0;
await test('appréciation : le professeur saisit, modifie et efface celle de sa matière', async () => {
  const a = await appr('prof', ensEps, T1, [{ eleve_id: sarah, texte: 'Bon trimestre, travail régulier.' }, { eleve_id: adam, texte: 'Des progrès.' }]);
  const b = await appr('prof', ensEps, T1, [{ eleve_id: adam, texte: 'En net progrès.' }]);
  const c = await as('prof', `select eleve_id, texte from appreciations where enseignement_id='${ensEps}' and periode_id='${T1}'`);
  await appr('prof', ensEps, T1, [{ eleve_id: adam, texte: '  ' }]);
  const d = await as('prof', `select count(*)::int n from appreciations where enseignement_id='${ensEps}' and periode_id='${T1}'`);
  return a.ok && b.ok && c.res.rows.length === 2 && de(c.res.rows, adam).texte === 'En net progrès.' && d.res.rows[0].n === 1; });
await test('appréciation : refusée sur la matière d’un collègue, pour un élève d’une autre classe, ou trop longue', async () => {
  const a = await appr('prof', ensMath, T1, [{ eleve_id: sarah, texte: 'Pas ma matière' }]);
  const b = await appr('prof', ensEps, T1, [{ eleve_id: lina, texte: 'Autre classe' }]);
  const c = await appr('prof', ensEps, T1, [{ eleve_id: adam, texte: 'x'.repeat(401) }]);
  return !a.ok && !b.ok && /pas dans la classe/.test(b.err) && !c.ok && /trop long/.test(c.err); });
await test('appréciation : lue par le professeur et le prof principal ; ni par la vie scolaire, ni par un élève', async () => {
  const p = await as('prof', `select * from appreciations`); const pp = await as('prof2', `select * from appreciations`);
  const v = await as('vs2', `select * from appreciations`); const e = await as('eleve', `select * from appreciations`);
  return p.res.rows.length === 1 && pp.res.rows.length === 1 && v.res.rows.length === 0 && (!e.ok || e.res.rows.length === 0); });
await test('éléments du programme : saisis par le professeur, lus par tout le personnel', async () => {
  const a = await as('prof', `select saisir_elements_programme('${ensEps}', '${T1}', 'Course de durée ; badminton')`);
  const b = await as('vs2', `select texte from elements_programme where enseignement_id='${ensEps}'`);
  const c = await as('prof', `select saisir_elements_programme('${ensMath}', '${T1}', 'Pas ma matière')`);
  return a.ok && b.res.rows[0]?.texte === 'Course de durée ; badminton' && !c.ok; });
await test('appréciation générale et mention : le prof principal seulement ; mention inconnue refusée', async () => {
  const a = await as('prof2', `select saisir_appreciation_generale('${sarah}', '${T1}', 'Trimestre encourageant.', 'Compliments')`);
  const b = await as('prof', `select saisir_appreciation_generale('${sarah}', '${T1}', 'Non', null)`);
  const c = await as('prof2', `select saisir_appreciation_generale('${adam}', '${T1}', 'Bien', 'Super bravo')`);
  const d = await as('prof2', `select texte, mention from appreciations_generales where eleve_id='${sarah}'`);
  return a.ok && !b.ok && !c.ok && /Mention inconnue/.test(c.err) && d.res.rows[0].mention === 'Compliments'; });
await test('bulletin : données complètes pour le prof principal (matières, moyennes, appréciations, absences, appréciation générale)', async () => {
  const r = await as('prof2', `select donnees_bulletins('${cl5}', '${T1}') b`); const b = r.res?.rows?.[0]?.b;
  const s = b && b.eleves.find(x => x.id === sarah);
  return r.ok && b.classe.nom === '5e A' && b.periode.libelle && b.enseignements.length >= 2 && b.enseignements.find(x => x.id === ensEps).elements === 'Course de durée ; badminton'
    && s.resultats[ensEps].appreciation === 'Bon trimestre, travail régulier.' && s.generale === 'Trimestre encourageant.' && s.mention === 'Compliments'
    && typeof s.absences.demi_journees === 'number' && s.rang === 1 && s.absences.retards === 1 && b.etablissement.nom === 'Collège Luqmân'; });
await test('bulletin : le rang disparaît quand le réglage est coupé', async () => {
  await as('dir', `update parametres set valeur='false' where cle='bulletin_afficher_rang'`);
  const r = await as('prof2', `select donnees_bulletins('${cl5}', '${T1}') b`);
  await as('dir', `update parametres set valeur='true' where cle='bulletin_afficher_rang'`);
  return r.res.rows[0].b.eleves.every(e => e.rang === null) && r.res.rows[0].b.afficher_rang === false; });
await test('bulletin : refusé à un professeur qui n’est pas principal de la classe et à un élève', async () => {
  const a = await as('prof', `select donnees_bulletins('${cl5}', '${T1}')`); const b = await as('eleve', `select donnees_bulletins('${cl5}', '${T1}')`);
  return !a.ok && !b.ok; });
await test('bulletin validé : saisies figées pour les professeurs, la direction peut encore corriger ; seul l’admin change le statut', async () => {
  const x = await as('prof', `select changer_statut_bulletin('${cl5}', '${T1}', 'valide')`);
  const v = await as('dir', `select changer_statut_bulletin('${cl5}', '${T1}', 'valide')`);
  const a = await appr('prof', ensEps, T1, [{ eleve_id: sarah, texte: 'Changement tardif' }]);
  const g = await as('prof2', `select saisir_appreciation_generale('${adam}', '${T1}', 'Tard', null)`);
  const d = await appr('dir', ensEps, T1, [{ eleve_id: sarah, texte: 'Corrigé par la direction.' }]);
  const s = await as('dir', `select statut, valide_le is not null v from bulletins_periode where classe_id='${cl5}' and periode_id='${T1}'`);
  await as('dir', `select changer_statut_bulletin('${cl5}', '${T1}', 'ouvert')`);
  const r = await appr('prof', ensEps, T1, [{ eleve_id: sarah, texte: 'Bon trimestre, travail régulier.' }]);
  return !x.ok && v.ok && !a.ok && /Bulletin validé/.test(a.err) && !g.ok && d.ok && s.res.rows[0].statut === 'valide' && s.res.rows[0].v && r.ok; });
await test('suivi du remplissage : compteurs par matière et appréciations générales', async () => {
  const r = await as('dir', `select suivi_appreciations('${cl5}', '${T1}') s`); const s = r.res.rows[0].s;
  const eps = s.matieres.find(m => m.enseignement_id === ensEps);
  return s.eleves >= 2 && s.generales === 1 && eps.appreciations === 1 && eps.elements === true && s.statut === 'ouvert'; });
await test('banque de phrases : phrases de départ visibles ; une phrase privée reste privée', async () => {
  const a = await as('prof', `select count(*)::int n from banque_phrases`);
  const b = await as('prof', `insert into banque_phrases(categorie, texte, partage) values ('Perso', 'Ma phrase', false) returning id`);
  const c = await as('prof2', `select * from banque_phrases where texte='Ma phrase'`);
  const d = await as('prof2', `delete from banque_phrases where texte='Ma phrase' returning id`);
  return a.res.rows[0].n >= 20 && b.ok && c.res.rows.length === 0 && (!d.ok || d.res.rows.length === 0); });
await test('appréciations et bulletins fermés aux visiteurs sans connexion (avant le mode test)', async () => {
  const a = await as('anon', `select * from appreciations`); const b = await as('anon', `select donnees_bulletins('${cl5}', '${T1}')`);
  return (!a.ok || a.res.rows.length === 0) && !b.ok; });

// ---------- Visibilité des notes (réglage notes_visibles_tout_personnel) ----------
await test('visibilité : un professeur ne lit que les notes de sa matière (EPS), pas celles de la matière d’un collègue', async () => {
  const e = await as('prof', `select distinct enseignement_id from evaluations`); const ids = e.res.rows.map(r => r.enseignement_id);
  const n = await as('prof', `select count(*)::int c from notes`); const mm = await as('prof', `select * from moyennes_matieres('${cl5}', null)`);
  return e.ok && ids.length > 0 && ids.every(i => i === ensEps) && n.res.rows[0].c > 0 && mm.res.rows.every(r => r.enseignement_id === ensEps); });
await test('visibilité : un professeur simple n’a ni moyenne générale ni bilan de classe', async () => {
  const g = await as('prof', `select * from moyennes_generales('${cl5}', null)`); const b = await as('prof', `select * from bilan_competences('${cl5}', '${T1}')`);
  return g.ok && g.res.rows.length === 0 && b.ok && b.res.rows.length === 0; });
await test('visibilité : le professeur principal de la classe voit toutes les matières et la moyenne générale', async () => {
  const e = await as('prof2', `select distinct enseignement_id from evaluations`); const g = await as('prof2', `select * from moyennes_generales('${cl5}', null)`);
  return e.res.rows.length >= 2 && g.res.rows.length > 0; });
await test('visibilité : la vie scolaire ne lit pas les notes par défaut', async () => {
  const n = await as('vs2', 'select * from notes'); const g = await as('vs2', `select * from moyennes_generales('${cl5}', null)`); return n.ok && n.res.rows.length === 0 && g.res.rows.length === 0; });
await test('visibilité : le réglage « tout le personnel » ouvre la lecture, le retirer la referme', async () => {
  await as('dir', `update parametres set valeur='true' where cle='notes_visibles_tout_personnel'`);
  const ouvert = await as('vs2', 'select * from notes'); const gen = await as('vs2', `select * from moyennes_generales('${cl5}', null)`);
  const eleve = await as('eleve', 'select * from notes');
  await as('dir', `update parametres set valeur='false' where cle='notes_visibles_tout_personnel'`);
  const ferme = await as('vs2', 'select * from notes');
  return ouvert.res.rows.length > 0 && gen.res.rows.length > 0 && eleve.res.rows.length === 0 && ferme.res.rows.length === 0; });
await test('visibilité : un professeur ne peut pas changer le réglage', async () => {
  const r = await as('prof', `update parametres set valeur='true' where cle='notes_visibles_tout_personnel' returning cle`); return !r.ok || r.res.rows.length === 0; });

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
await test('accès libre : justification, surveillance et calendrier fonctionnent sans connexion', async () => {
  const a = await as('anon', 'select * from eleves_a_surveiller()'); const b = await as('anon', `insert into fermetures(debut, fin, motif) values (current_date + 100, current_date + 101, 'Test') returning id`);
  const c = await as('anon', 'select * from liste_professeurs()');
  return a.ok && b.ok && (!c.ok || c.res.rows.length === 0); });
await test('accès libre : évaluations, notes, moyennes et compétences fonctionnent sans connexion', async () => {
  const e = await as('anon', `insert into evaluations(enseignement_id, titre, date_eval) values ('${ensEps}', 'Libre', '2026-11-12') returning id`);
  const ev = e.res?.rows?.[0]?.id;
  const n = await saisir('anon', ev, [{ eleve_id: sarah, valeur: '9,5' }]);
  const g = await as('anon', `select * from moyennes_generales('${cl5}', null)`); const c = await as('anon', 'select * from competences');
  return e.ok && n.ok && g.ok && g.res.rows.length > 0 && c.ok && c.res.rows.length > 0; });
await test('accès libre : on peut publier et utiliser un modèle d’évaluation sans connexion (pas d’auteur)', async () => {
  const e = await un(`select id from evaluations where titre='Libre' limit 1`);
  const p = await as('anon', `select publier_modele('${e.id}', 'Essai libre', true) id`);
  const u = p.ok && await as('anon', `select utiliser_modele('${p.res.rows[0].id}', '${ensEps}', '2026-12-09') id`);
  return p.ok && u.ok; });
await test('accès libre : appréciations, appréciation générale et bulletin utilisables sans connexion', async () => {
  const a = await appr('anon', ensEps, T2, [{ eleve_id: sarah, texte: 'Mode test' }]);
  const g = await as('anon', `select saisir_appreciation_generale('${sarah}', '${T2}', 'Mode test', null)`);
  const b = await as('anon', `select donnees_bulletins('${cl5}', '${T2}') b`);
  return a.ok && g.ok && b.ok && b.res.rows[0].b.eleves.length > 0; });
await db.exec(lire('retirer_acces_libre.sql'));
await test('après le retrait : plus de notes ni de moyennes sans connexion, et les droits par rôle reviennent', async () => {
  const a = await as('anon', 'select * from notes'); const b = await as('anon', `select * from moyennes_generales('${cl5}', null)`);
  const c = await as('anon', `insert into evaluations(enseignement_id, titre, date_eval) values ('${ensEps}', 'Intrus', '2026-11-12')`);
  const d = await as('prof2', `insert into evaluations(enseignement_id, titre, date_eval) values ('${ensEps}', 'Pas le mien', '2026-11-12')`);
  const f = await as('prof', `insert into evaluations(enseignement_id, titre, date_eval) values ('${ensEps}', 'Le mien', '2026-11-13') returning id`);
  return (!a.ok || a.res.rows.length === 0) && !b.ok && !c.ok && !d.ok && f.ok; });

await test('après le retrait : plus de calendrier, d’infirmerie ni de surveillance sans connexion', async () => {
  const a = await as('anon', 'select * from fermetures'); const b = await as('anon', 'select * from eleves_a_surveiller()');
  const c = await as('anon', `insert into passages_infirmerie(eleve_id) values ('${sarah}')`);
  return (!a.ok || a.res.rows.length === 0) && !b.ok && !c.ok; });
await test('après le retrait : le remplaçant garde le droit de faire l’appel', async () => { const c = await nouveauCours('ens_prof', 600, `remplacant_id='${U.prof2}'`);
  const r = await as('prof2', `select ouvrir_appel('${c}') as n`); return r.ok && r.res.rows[0].n === 2; });
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
