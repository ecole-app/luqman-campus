-- Luqmân Campus — étape 4, compléments : bilan de fin de cycle (6e = fin du cycle 3, 3e = fin du cycle 4).
-- Calqué sur le bilan de fin de cycle du livret scolaire : les 8 composantes du socle commun (décret 2015-372),
-- 4 niveaux de maîtrise, synthèse des acquis. Niveau proposé d'après les compétences évaluées pendant l'année ;
-- le professeur principal (ou la direction) ajuste. Points : 10 / 25 / 40 / 50 par composante (total sur 400),
-- barème de l'arrêté du 31-12-2015 utilisé pour le socle du diplôme national du brevet.
-- Données fictives uniquement tant que l'étape 0b n'est pas faite.

insert into public.parametres(cle, valeur, description) values
 ('bilan_cycle_afficher_points', 'true', 'Afficher le total de points du socle (sur 400) sur le bilan de fin de cycle')
on conflict (cle) do nothing;

create table public.bilans_cycle (
  id uuid primary key default gen_random_uuid(),
  eleve_id uuid not null references public.eleves(id) on delete cascade,
  competence_id uuid not null references public.competences(id),
  niveau smallint not null check (niveau between 1 and 4),
  saisi_par uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (eleve_id, competence_id)
);
create table public.syntheses_cycle (
  id uuid primary key default gen_random_uuid(),
  eleve_id uuid not null references public.eleves(id) on delete cascade,
  cycle smallint not null check (cycle in (3, 4)),
  texte text not null check (length(btrim(texte)) > 0 and length(texte) <= 2000),
  saisi_par uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (eleve_id, cycle)
);

-- Règle serveur : seulement les élèves de 6e et de 3e, et la composante doit être du bon cycle.
create function public.bilan_cycle_regles() returns trigger
language plpgsql security definer set search_path = public as $$
declare niv text; cy smallint; j jsonb := to_jsonb(new);
begin
  select c.niveau into niv from eleves e join classes c on c.id = e.classe_id where e.id = new.eleve_id;
  if niv is null or niv not in ('6e', '3e') then
    raise exception 'Le bilan de fin de cycle concerne les élèves de 6e (cycle 3) et de 3e (cycle 4).';
  end if;
  cy := public.cycle_du_niveau(niv);
  if j ? 'competence_id' then
    if not exists (select 1 from competences k where k.id = (j->>'competence_id')::uuid and k.cycle = cy) then
      raise exception 'Cette composante n''appartient pas au cycle de l''élève.';
    end if;
  end if;
  if j ? 'cycle' then
    if (j->>'cycle')::smallint <> cy then raise exception 'Le cycle ne correspond pas à la classe de l''élève.'; end if;
  end if;
  return new;
end $$;
create trigger regles_bilans_cycle before insert or update on public.bilans_cycle for each row execute function public.bilan_cycle_regles();
create trigger regles_syntheses_cycle before insert or update on public.syntheses_cycle for each row execute function public.bilan_cycle_regles();
create trigger horodater_bilans_cycle before insert or update on public.bilans_cycle for each row execute function public.horodater();
create trigger horodater_syntheses_cycle before insert or update on public.syntheses_cycle for each row execute function public.horodater();
create trigger auditer_bilans_cycle after insert or update or delete on public.bilans_cycle for each row execute function public.auditer();
create trigger auditer_syntheses_cycle after insert or update or delete on public.syntheses_cycle for each row execute function public.auditer();

alter table public.bilans_cycle enable row level security;
alter table public.syntheses_cycle enable row level security;
create policy bilans_cycle_lecture on public.bilans_cycle for select using (public.voit_bilan_eleve(eleve_id));
create policy bilans_cycle_ecriture on public.bilans_cycle for all using (public.peut_bilan(eleve_id)) with check (public.peut_bilan(eleve_id));
create policy syntheses_cycle_lecture on public.syntheses_cycle for select using (public.voit_bilan_eleve(eleve_id));
create policy syntheses_cycle_ecriture on public.syntheses_cycle for all using (public.peut_bilan(eleve_id)) with check (public.peut_bilan(eleve_id));
revoke all on public.bilans_cycle, public.syntheses_cycle from anon;
grant select, insert, update, delete on public.bilans_cycle, public.syntheses_cycle to authenticated;

-- ---------- Saisie en lot (droits et règles : ceux des tables) ----------
-- p_niveaux : [{"competence_id":"…","niveau":3}] ; niveau null = revenir au niveau proposé. p_synthese : null = inchangée, '' = effacée.
create function public.saisir_bilan_cycle(p_eleve uuid, p_niveaux jsonb, p_synthese text default null)
returns void language plpgsql set search_path = public as $$
declare x jsonb; cy smallint; n int;
begin
  for x in select * from jsonb_array_elements(coalesce(p_niveaux, '[]'::jsonb)) loop
    if x->>'niveau' is null or x->>'niveau' = 'null' then
      delete from bilans_cycle where eleve_id = p_eleve and competence_id = (x->>'competence_id')::uuid;
    else
      insert into bilans_cycle(eleve_id, competence_id, niveau) values (p_eleve, (x->>'competence_id')::uuid, (x->>'niveau')::smallint)
      on conflict (eleve_id, competence_id) do update set niveau = excluded.niveau;
    end if;
    get diagnostics n = row_count;
  end loop;
  if p_synthese is not null then
    select public.cycle_du_niveau(c.niveau) into cy from eleves e join classes c on c.id = e.classe_id where e.id = p_eleve;
    if btrim(p_synthese) = '' then delete from syntheses_cycle where eleve_id = p_eleve;
    else insert into syntheses_cycle(eleve_id, cycle, texte) values (p_eleve, cy, btrim(p_synthese))
         on conflict (eleve_id, cycle) do update set texte = excluded.texte; end if;
  end if;
end $$;

-- ---------- Données du bilan de fin de cycle d'une classe ----------
create function public.donnees_bilan_cycle(p_classe uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cl public.classes; cy smallint; afficher boolean;
begin
  if not public.voit_toute_la_classe(p_classe) then
    raise exception 'Le bilan de fin de cycle est réservé au professeur principal et à la direction.';
  end if;
  select * into cl from classes where id = p_classe;
  if cl.id is null then raise exception 'Classe introuvable'; end if;
  if cl.niveau not in ('6e', '3e') then
    raise exception 'Le bilan de fin de cycle concerne les classes de 6e (fin du cycle 3) et de 3e (fin du cycle 4).';
  end if;
  cy := public.cycle_du_niveau(cl.niveau);
  afficher := coalesce((select (valeur #>> '{}')::boolean from parametres where cle = 'bilan_cycle_afficher_points'), true);
  return jsonb_build_object(
    'etablissement', jsonb_build_object(
       'nom', coalesce((select valeur #>> '{}' from parametres where cle = 'etablissement_nom'), ''),
       'adresse', coalesce((select valeur #>> '{}' from parametres where cle = 'etablissement_adresse'), '')),
    'classe', jsonb_build_object('id', cl.id, 'nom', cl.nom, 'niveau', cl.niveau,
       'prof_principal', (select p.prenom || ' ' || p.nom from profils p where p.id = cl.prof_principal_id),
       'annee', (select libelle from annees_scolaires where id = cl.annee_id)),
    'cycle', cy, 'afficher_points', afficher,
    'points', jsonb_build_object('1', 10, '2', 25, '3', 40, '4', 50),
    'composantes', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'code', k.code, 'domaine', k.domaine, 'libelle', k.libelle) order by k.ordre)
                    from competences k where k.cycle = cy and k.actif), '[]'::jsonb),
    'eleves', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'nom', e.nom, 'prenom', e.prenom, 'date_naissance', e.date_naissance,
        'synthese', (select s.texte from syntheses_cycle s where s.eleve_id = e.id and s.cycle = cy),
        'niveaux', coalesce((select jsonb_agg(jsonb_build_object(
              'competence_id', k.id, 'nb', coalesce(b.nb, 0), 'moyenne', b.moyenne,
              'propose', b.niveau_propose, 'retenu', coalesce(bc.niveau, b.niveau_propose), 'modifie', bc.niveau is not null) order by k.ordre)
            from competences k
            left join public.bilan_competences(p_classe, null) b on b.eleve_id = e.id and b.competence_id = k.id
            left join bilans_cycle bc on bc.eleve_id = e.id and bc.competence_id = k.id
            where k.cycle = cy and k.actif), '[]'::jsonb)
      ) order by e.nom, e.prenom) from eleves e where e.classe_id = p_classe and e.deleted_at is null), '[]'::jsonb));
end $$;

revoke all on function public.bilan_cycle_regles(), public.saisir_bilan_cycle(uuid, jsonb, text), public.donnees_bilan_cycle(uuid) from public, anon, authenticated;
grant execute on function public.saisir_bilan_cycle(uuid, jsonb, text), public.donnees_bilan_cycle(uuid) to authenticated;
