-- Banque de phrases : chaque professeur peut corriger ses phrases ET les phrases de départ
-- (celles sans auteur), pas seulement la direction. Retirer : ses propres phrases (la direction : toutes).
drop policy if exists banque_phrases_ecriture on public.banque_phrases;
create policy banque_phrases_ajout on public.banque_phrases for insert
  with check (public.est_personnel() and (created_by = auth.uid() or public.est_admin()));
create policy banque_phrases_correction on public.banque_phrases for update
  using (public.est_personnel() and (created_by = auth.uid() or created_by is null or public.est_admin()))
  with check (public.est_personnel() and (created_by = auth.uid() or created_by is null or public.est_admin()));
create policy banque_phrases_retrait on public.banque_phrases for delete
  using (created_by = auth.uid() or public.est_admin());
