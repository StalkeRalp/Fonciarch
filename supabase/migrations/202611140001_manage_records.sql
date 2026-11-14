-- Edition et suppression des titres et boxes (appliquer après 202611120004_import_auto_boxes.sql).
begin;
-- Import atomique : crée automatiquement les boxes manquants du fichier.
-- Aucun box déjà présent ni titre existant n’est modifié.
begin;
create or replace function public.fonciarch_mutate(p_action text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 old_title public.fonciarch_titles; next_title public.fonciarch_titles; old_json jsonb; result jsonb; row_value jsonb; row_result jsonb;
 n text; c text; b text; s text; cad text; action_label text; item_label text; new_id uuid; created_boxes integer := 0; box_rows integer := 0;
begin
 if p_action='title' then
  n:=regexp_replace(trim(coalesce(p_input->>'number','')),'[[:space:]-]','','g'); c:=upper(coalesce(p_input->>'category','')); b:=p_input->>'box';
  if n !~ '^[0-9]+$' or length(n)>50 or c not in ('A','B','C') then raise exception 'INVALID: Numéro ou catégorie invalide.'; end if;
  if not exists(select 1 from public.fonciarch_boxes where number=b) then raise exception 'INVALID: Le box de rangement n’existe pas.'; end if;
  if p_input ? 'id' then
   select * into old_title from public.fonciarch_titles where id=(p_input->>'id')::uuid for update;
   if not found then raise exception 'CONFLICT: Titre introuvable sur le serveur.'; end if;
   if old_title.updated_at is distinct from (p_input->>'updatedAt')::timestamptz then raise exception 'CONFLICT: Ce titre a été modifié sur un autre appareil.'; end if;
   
   old_json:=public.fonciarch_title_json(old_title);
  end if;
  cad:=coalesce(nullif(trim(p_input->>'cadastre'),''),old_title.cadastre,(select nullif(cadastre,'') from public.fonciarch_settings where singleton),'Mfoundi A');
  if length(cad)>200 then raise exception 'INVALID: Cadastre invalide.'; end if;
  s:=coalesce(nullif(p_input->>'status',''),old_title.status,'Disponible'); new_id:=coalesce(old_title.id,(p_input->>'clientId')::uuid,gen_random_uuid());
  if exists(select 1 from public.fonciarch_titles where number=n and category=c and cadastre=cad and id<>new_id) then raise exception 'CONFLICT: Ce numéro et cette catégorie existent déjà dans ce cadastre.'; end if;
  if old_title.id is null then
   insert into public.fonciarch_titles(id,number,category,cadastre,box,status,notes) values(new_id,n,c,cad,b,s,coalesce(p_input->>'notes','')) returning * into next_title;
   action_label:='Ajout du titre';
  else
   update public.fonciarch_titles set number=n,category=c,cadastre=cad,box=b,status=s,notes=coalesce(p_input->>'notes',''),updated_at=greatest(clock_timestamp(),old_title.updated_at+interval '1 microsecond') where id=new_id returning * into next_title;
   action_label:='Modification du titre';
  end if;
  result:=public.fonciarch_title_json(next_title); item_label:=n||' '||c;
 elsif p_action='box' then
  n:=regexp_replace(trim(coalesce(p_input->>'number','')),'^0+(?=[0-9])','');
  if n !~ '^[0-9]+$' or n ~ '^0+$' or length(n)>30 then raise exception 'INVALID: Numéro du box invalide.'; end if;
  if exists(select 1 from public.fonciarch_boxes where number=n) then
   if p_input->>'reuseExisting'='true' then select jsonb_build_object('id',id,'number',number,'createdAt',created_at) into result from public.fonciarch_boxes where number=n; return result; end if;
   raise exception 'CONFLICT: Ce box existe déjà.';
  end if;
  insert into public.fonciarch_boxes(id,number) values(coalesce((p_input->>'clientId')::uuid,gen_random_uuid()),n) returning jsonb_build_object('id',id,'number',number,'createdAt',created_at) into result;
  action_label:='Création du box'; item_label:='Box '||n;
 elsif p_action='title-delete' then
  select * into old_title from public.fonciarch_titles where id=(p_input->>'id')::uuid for update;
  if not found then raise exception 'CONFLICT: Titre introuvable.'; end if;
  if old_title.updated_at is distinct from (p_input->>'updatedAt')::timestamptz then raise exception 'CONFLICT: Ce titre a été modifié sur un autre appareil.'; end if;
  old_json:=public.fonciarch_title_json(old_title); delete from public.fonciarch_titles where id=old_title.id;
  result:=jsonb_build_object('id',old_title.id); action_label:='Suppression du titre'; item_label:=old_title.number||' '||old_title.category;
 elsif p_action='box-edit' then
  n:=regexp_replace(trim(coalesce(p_input->>'number','')),'^0+(?=[0-9])','');
  if n !~ '^[0-9]+$' or n ~ '^0+$' or length(n)>30 then raise exception 'INVALID: Numéro du box invalide.'; end if;
  b:=p_input->>'oldNumber'; select jsonb_build_object('id',id,'number',number,'createdAt',created_at) into old_json from public.fonciarch_boxes where number=b for update;
  if old_json is null then raise exception 'CONFLICT: Box introuvable.'; end if;
  update public.fonciarch_boxes set number=n where number=b;
  update public.fonciarch_titles set box=n,updated_at=clock_timestamp() where box=b;
  result:=jsonb_build_object('id',old_json->>'id','number',n,'createdAt',old_json->>'createdAt'); action_label:='Modification du box'; item_label:='Box '||b||' → Box '||n;
 elsif p_action='box-delete' then
  b:=p_input->>'number';
  if exists(select 1 from public.fonciarch_titles where box=b) then raise exception 'INVALID: Ce box contient des titres. Déplacez-les avant de le supprimer.'; end if;
  delete from public.fonciarch_boxes where number=b returning jsonb_build_object('id',id,'number',number,'createdAt',created_at) into old_json;
  if old_json is null then raise exception 'CONFLICT: Box introuvable.'; end if;
  result:=jsonb_build_object('id',old_json->>'id'); action_label:='Suppression du box'; item_label:='Box '||b;
 elsif p_action='move' then
  select * into old_title from public.fonciarch_titles where id=(p_input->>'id')::uuid for update;
  if not found then raise exception 'CONFLICT: Titre introuvable sur le serveur.'; end if;
  if old_title.updated_at is distinct from (p_input->>'updatedAt')::timestamptz then raise exception 'CONFLICT: Ce titre a été modifié sur un autre appareil.'; end if;
  b:=p_input->>'box';
  if b=old_title.box or not exists(select 1 from public.fonciarch_boxes where number=b) then raise exception 'INVALID: Choisissez un autre box existant.'; end if;
  if length(trim(coalesce(p_input->>'reason','')))=0 or length(p_input->>'reason')>2000 then raise exception 'INVALID: Le motif du déplacement est obligatoire et limité à 2000 caractères.'; end if;
  old_json:=public.fonciarch_title_json(old_title);
  update public.fonciarch_titles set box=b,updated_at=greatest(clock_timestamp(),old_title.updated_at+interval '1 microsecond') where id=old_title.id returning * into next_title;
  result:=public.fonciarch_title_json(next_title); action_label:='Déplacement du titre'; item_label:=old_title.number||' '||old_title.category||' · '||(p_input->>'reason');
 elsif p_action='settings' then
  if length(trim(coalesce(p_input->>'name','')))=0 or length(trim(coalesce(p_input->>'cadastre','')))=0 or length(trim(coalesce(p_input->>'location','')))=0 or greatest(length(p_input->>'name'),length(p_input->>'cadastre'),length(p_input->>'location'))>200 then raise exception 'INVALID: Les informations du service sont obligatoires et limitées à 200 caractères.'; end if;
  select jsonb_build_object('name',name,'cadastre',cadastre,'location',location) into old_json from public.fonciarch_settings where singleton;
  insert into public.fonciarch_settings(singleton,name,cadastre,location) values(true,trim(p_input->>'name'),trim(p_input->>'cadastre'),trim(p_input->>'location')) on conflict(singleton) do update set name=excluded.name,cadastre=excluded.cadastre,location=excluded.location;
  result:=p_input; action_label:='Modification du service'; item_label:=p_input->>'name';
 elsif p_action='import' then
  if jsonb_typeof(p_input->'rows') is distinct from 'array' then raise exception 'INVALID: Lignes d’import invalides.'; end if;
  if jsonb_array_length(p_input->'rows') not between 1 and 5000 then raise exception 'INVALID: Import limité à 5000 lignes.'; end if;
  -- Crée en une seule transaction tous les emplacements utilisés dans l'import.
  for b in
   select distinct regexp_replace(trim(coalesce(value->>'box','')),'^0+(?=[0-9])','')
   from jsonb_array_elements(p_input->'rows') as imported(value)
  loop
   if b !~ '^[0-9]+$' or b ~ '^0+$' or length(b)>30 then raise exception 'INVALID: Un numéro de box dans le fichier est invalide.'; end if;
   insert into public.fonciarch_boxes(number) values(b) on conflict(number) do nothing;
   get diagnostics box_rows = row_count;
   created_boxes := created_boxes + box_rows;
  end loop;
  perform set_config('fonciarch.batch_import','true',true);
  result:='[]'::jsonb;
  for row_value in select value from jsonb_array_elements(p_input->'rows') loop
   b:=regexp_replace(trim(coalesce(row_value->>'box','')),'^0+(?=[0-9])','');
   row_result:=public.fonciarch_mutate('title',(row_value-'id')||jsonb_build_object('box',b));
   result:=result||jsonb_build_array(jsonb_build_object('id',row_result->>'id','updatedAt',row_result->>'updatedAt')); 
  end loop;
  perform set_config('fonciarch.batch_import','false',true);
  old_json:=jsonb_build_object('boxesCreated',created_boxes);
  action_label:='Importation des titres'; item_label:=jsonb_array_length(p_input->'rows')::text||' titres · '||created_boxes::text||' nouveaux boxes';
 else raise exception 'INVALID: Opération inconnue.';
 end if;
 if current_setting('fonciarch.batch_import',true)='true' then return result; end if;
 insert into public.fonciarch_activities(actor,actor_id,action,item,before_value,after_value) values('Accès sans authentification','direct-access',action_label,item_label,old_json,result);
 return result;
end;
$$;
notify pgrst,'reload schema';
commit;
commit;
