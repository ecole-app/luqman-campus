-- Luqmân Campus — étape 3 : l'appli demande au serveur « qui peut quoi » pour n'afficher que les boutons utiles.
-- Information d'affichage seulement : les vrais droits restent appliqués par la base (RLS et règles).
create function public.mes_droits_notes() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare adm boolean := public.est_admin();
begin
  return jsonb_build_object(
    'admin', adm,
    'classes_pp', coalesce((select jsonb_agg(c.id) from public.classes c where c.prof_principal_id = auth.uid()), '[]'::jsonb),
    'enseignements', coalesce((select jsonb_agg(e.id) from public.enseignements e where e.professeur_id = auth.uid()), '[]'::jsonb));
end $$;
revoke all on function public.mes_droits_notes() from public, anon;
grant execute on function public.mes_droits_notes() to authenticated;
