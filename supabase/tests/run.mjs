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
`);
await db.exec(readFileSync(new URL('../migrations/0001_fondations.sql', import.meta.url), 'utf8'));

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

console.log(`\n${n - fails}/${n} tests réussis`);
process.exit(fails ? 1 : 0);
