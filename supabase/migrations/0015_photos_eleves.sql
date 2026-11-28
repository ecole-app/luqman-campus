-- Luqmân Campus — étape 5 (complément) : photo de l'élève (conseil de classe, plus tard fiche élève).
-- Petite image compressée dans l'appli (environ 300 × 375 px, JPEG) stockée en texte (data URL) :
-- pas de stockage de fichiers à régler, lecture par le personnel, gestion par la direction.
-- Pas d'écriture dans le journal d'audit (il copierait l'image entière) : seule la date de mise à jour est gardée.
-- Données fictives uniquement tant que l'étape 0b n'est pas faite (aucune vraie photo d'élève).

create table public.photos_eleves (
  eleve_id uuid primary key references public.eleves(id) on delete cascade,
  image text not null check (image ~ '^data:image/(jpeg|png|webp);base64,' and length(image) <= 200000),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger horodater_photos_eleves before insert or update on public.photos_eleves for each row execute function public.horodater();

alter table public.photos_eleves enable row level security;
create policy photos_lecture on public.photos_eleves for select using (public.est_personnel());
create policy photos_ajout on public.photos_eleves for insert with check (public.est_admin());
create policy photos_modif on public.photos_eleves for update using (public.est_admin()) with check (public.est_admin());
create policy photos_retrait on public.photos_eleves for delete using (public.est_admin());
revoke all on public.photos_eleves from anon;
grant select, insert, update, delete on public.photos_eleves to authenticated;
