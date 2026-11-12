-- FONCIARCH : première installation, un service et un cadastre.
-- Exécuter dans le SQL Editor Supabase. Aucun titre ou compte fictif n’est créé.
begin;
create table if not exists public.fonciarch_identity (
 singleton boolean primary key default true check(singleton), id uuid not null default gen_random_uuid()
);
insert into public.fonciarch_identity(singleton) values(true) on conflict do nothing;
create table if not exists public.fonciarch_settings (
 singleton boolean primary key default true check(singleton), name text not null, cadastre text not null, location text not null
);
create table if not exists public.fonciarch_boxes (
 id uuid primary key default gen_random_uuid(), number text unique not null check(number ~ '^[0-9]+$' and number !~ '^0+$'), created_at timestamptz not null default clock_timestamp()
);
create table if not exists public.fonciarch_titles (
 id uuid primary key default gen_random_uuid(), number text not null check(number ~ '^[0-9]+$' and length(number)<=50),
 category text not null check(category in ('A','B','C')), box text not null references public.fonciarch_boxes(number) on delete restrict,
 status text not null default 'Disponible' check(status in ('Disponible','Sorti','Introuvable','Archivé')),
 notes text not null default '' check(length(notes)<=10000), created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 created_by text not null default 'Accès sans authentification', unique(number, category)
);
create index if not exists fonciarch_title_number_idx on public.fonciarch_titles(number text_pattern_ops);
create index if not exists fonciarch_title_box_idx on public.fonciarch_titles(box);
create index if not exists fonciarch_title_date_idx on public.fonciarch_titles(created_at desc);
create table if not exists public.fonciarch_activities (
 id uuid primary key default gen_random_uuid(), occurred_at timestamptz not null default clock_timestamp(), actor text not null, actor_id text not null,
 action text not null, item text not null, before_value jsonb, after_value jsonb
);
create table if not exists public.fonciarch_operations (
 id uuid primary key, fingerprint text not null, result jsonb, processed_at timestamptz not null default clock_timestamp()
);

create or replace function public.fonciarch_title_json(t public.fonciarch_titles) returns jsonb language sql stable set search_path = '' as $$
 select jsonb_build_object('id',t.id,'number',t.number,'category',t.category,'box',t.box,'status',t.status,'notes',t.notes,'date',t.created_at,'updatedAt',t.updated_at,'createdBy',t.created_by);
$$;
create or replace function public.fonciarch_workspace() returns jsonb language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object(
  'backendId',(select id from public.fonciarch_identity where singleton), 'user',null,'users','[]'::jsonb,'directAccess',true,
  'settings',coalesce((select jsonb_build_object('name',name,'cadastre',cadastre,'location',location) from public.fonciarch_settings where singleton),'{"name":"","cadastre":"","location":""}'::jsonb),
  'titles',coalesce((select jsonb_agg(public.fonciarch_title_json(t) order by t.created_at desc) from public.fonciarch_titles t),'[]'::jsonb),
  'boxes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'number',number,'createdAt',created_at) order by length(number),number) from public.fonciarch_boxes),'[]'::jsonb),
  'activities',coalesce((select jsonb_agg(jsonb_build_object('id',id,'date',occurred_at,'actor',actor,'actorId',actor_id,'action',action,'item',item,'before',before_value,'after',after_value) order by occurred_at desc) from public.fonciarch_activities),'[]'::jsonb)
 );
$$;
create or replace function public.fonciarch_mutate(p_action text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 old_title public.fonciarch_titles; next_title public.fonciarch_titles; old_json jsonb; result jsonb; row_value jsonb;
 n text; c text; b text; s text; action_label text; item_label text; new_id uuid;
begin
 if p_action='title' then
  n:=regexp_replace(trim(coalesce(p_input->>'number','')),'[[:space:]-]','','g'); c:=upper(coalesce(p_input->>'category','')); b:=p_input->>'box';
  if n !~ '^[0-9]+$' or length(n)>50 or c not in ('A','B','C') then raise exception 'INVALID: Numéro ou catégorie invalide.'; end if;
  if not exists(select 1 from public.fonciarch_boxes where number=b) then raise exception 'INVALID: Le box de rangement n’existe pas.'; end if;
  if p_input ? 'id' then
   select * into old_title from public.fonciarch_titles where id=(p_input->>'id')::uuid for update;
   if not found then raise exception 'CONFLICT: Titre introuvable sur le serveur.'; end if;
   if old_title.updated_at is distinct from (p_input->>'updatedAt')::timestamptz then raise exception 'CONFLICT: Ce titre a été modifié sur un autre appareil.'; end if;
   if old_title.box<>b then raise exception 'INVALID: Utilisez Déplacer pour changer le box avec un motif.'; end if;
   old_json:=public.fonciarch_title_json(old_title);
  end if;
  s:=coalesce(nullif(p_input->>'status',''),old_title.status,'Disponible'); new_id:=coalesce(old_title.id,(p_input->>'clientId')::uuid,gen_random_uuid());
  if exists(select 1 from public.fonciarch_titles where number=n and category=c and id<>new_id) then raise exception 'CONFLICT: Ce numéro et cette catégorie existent déjà.'; end if;
  if old_title.id is null then
   insert into public.fonciarch_titles(id,number,category,box,status,notes) values(new_id,n,c,b,s,coalesce(p_input->>'notes','')) returning * into next_title;
   action_label:='Ajout du titre';
  else
   update public.fonciarch_titles set number=n,category=c,status=s,notes=coalesce(p_input->>'notes',''),updated_at=greatest(clock_timestamp(),old_title.updated_at+interval '1 microsecond') where id=new_id returning * into next_title;
   action_label:='Modification du titre';
  end if;
  result:=public.fonciarch_title_json(next_title); item_label:=n||' '||c;
 elsif p_action='box' then
  n:=regexp_replace(trim(coalesce(p_input->>'number','')),'^0+(?=[0-9])','');
  if n !~ '^[0-9]+$' or n ~ '^0+$' or length(n)>30 then raise exception 'INVALID: Numéro du box invalide.'; end if;
  if exists(select 1 from public.fonciarch_boxes where number=n) then raise exception 'CONFLICT: Ce box existe déjà.'; end if;
  insert into public.fonciarch_boxes(id,number) values(coalesce((p_input->>'clientId')::uuid,gen_random_uuid()),n) returning jsonb_build_object('id',id,'number',number,'createdAt',created_at) into result;
  action_label:='Création du box'; item_label:='Box '||n;
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
  result:='[]'::jsonb;
  for row_value in select value from jsonb_array_elements(p_input->'rows') loop
   result:=result||jsonb_build_array(public.fonciarch_mutate('title',row_value-'id'));
  end loop;
  action_label:='Import CSV'; item_label:=jsonb_array_length(p_input->'rows')::text||' titres';
 else raise exception 'INVALID: Opération inconnue.';
 end if;
 insert into public.fonciarch_activities(actor,actor_id,action,item,before_value,after_value) values('Accès sans authentification','direct-access',action_label,item_label,old_json,result);
 return result;
end;
$$;
create or replace function public.fonciarch_apply_operation(p_operation_id uuid,p_action text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare previous public.fonciarch_operations; fingerprint text; result jsonb;
begin
 if p_operation_id is null then raise exception 'INVALID: Identifiant d’opération obligatoire.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('action',p_action,'input',p_input)::text,'UTF8')),'hex');
 select * into previous from public.fonciarch_operations where id=p_operation_id;
 if found then
  if previous.fingerprint<>fingerprint then raise exception 'CONFLICT: Identifiant déjà utilisé pour une autre opération.'; end if;
  return jsonb_build_object('id',p_operation_id,'result',previous.result);
 end if;
 result:=public.fonciarch_mutate(p_action,p_input);
 insert into public.fonciarch_operations(id,fingerprint,result) values(p_operation_id,fingerprint,result);
 return jsonb_build_object('id',p_operation_id,'result',result);
end;
$$;

-- Aucune table n’est accessible par les clés publiques. Le serveur Next.js est l’unique point d’accès.
alter table public.fonciarch_identity enable row level security;
alter table public.fonciarch_settings enable row level security;
alter table public.fonciarch_boxes enable row level security;
alter table public.fonciarch_titles enable row level security;
alter table public.fonciarch_activities enable row level security;
alter table public.fonciarch_operations enable row level security;
revoke all on public.fonciarch_identity,public.fonciarch_settings,public.fonciarch_boxes,public.fonciarch_titles,public.fonciarch_activities,public.fonciarch_operations from anon,authenticated;
grant all on public.fonciarch_identity,public.fonciarch_settings,public.fonciarch_boxes,public.fonciarch_titles,public.fonciarch_activities,public.fonciarch_operations to service_role;
revoke execute on function public.fonciarch_title_json(public.fonciarch_titles),public.fonciarch_workspace(),public.fonciarch_mutate(text,jsonb),public.fonciarch_apply_operation(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.fonciarch_title_json(public.fonciarch_titles),public.fonciarch_workspace(),public.fonciarch_mutate(text,jsonb),public.fonciarch_apply_operation(uuid,text,jsonb) to service_role;

-- Restauration contrôlée, uniquement dans un registre cloud vide.
create or replace function public.fonciarch_restore(p_snapshot jsonb) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare row_value jsonb;
begin
 lock table public.fonciarch_titles,public.fonciarch_boxes,public.fonciarch_activities,public.fonciarch_operations,public.fonciarch_settings in exclusive mode;
 if exists(select 1 from public.fonciarch_titles) or exists(select 1 from public.fonciarch_boxes) or exists(select 1 from public.fonciarch_operations) or exists(select 1 from public.fonciarch_activities) or exists(select 1 from public.fonciarch_settings) then raise exception 'INVALID: La restauration exige un registre cloud vide.'; end if;
 if jsonb_typeof(p_snapshot->'titles') is distinct from 'array' or jsonb_typeof(p_snapshot->'boxes') is distinct from 'array' then raise exception 'INVALID: Copie du registre invalide.'; end if;
 for row_value in select value from jsonb_array_elements(p_snapshot->'boxes') loop
  insert into public.fonciarch_boxes(id,number,created_at) values((row_value->>'id')::uuid,row_value->>'number',(row_value->>'createdAt')::timestamptz);
 end loop;
 for row_value in select value from jsonb_array_elements(p_snapshot->'titles') loop
  insert into public.fonciarch_titles(id,number,category,box,status,notes,created_at,updated_at,created_by) values((row_value->>'id')::uuid,row_value->>'number',row_value->>'category',row_value->>'box',row_value->>'status',coalesce(row_value->>'notes',''),(row_value->>'date')::timestamptz,(row_value->>'updatedAt')::timestamptz,row_value->>'createdBy');
 end loop;
 for row_value in select value from jsonb_array_elements(coalesce(p_snapshot->'activities','[]'::jsonb)) loop
  insert into public.fonciarch_activities(id,occurred_at,actor,actor_id,action,item,before_value,after_value) values((row_value->>'id')::uuid,(row_value->>'date')::timestamptz,row_value->>'actor',row_value->>'actorId',row_value->>'action',row_value->>'item',row_value->'before',row_value->'after');
 end loop;
 if length(p_snapshot->'settings'->>'name')>0 then
  insert into public.fonciarch_settings(singleton,name,cadastre,location) values(true,p_snapshot->'settings'->>'name',p_snapshot->'settings'->>'cadastre',p_snapshot->'settings'->>'location');
 end if;
 return jsonb_build_object('titles',jsonb_array_length(p_snapshot->'titles'),'boxes',jsonb_array_length(p_snapshot->'boxes'));
end;
$$;
revoke execute on function public.fonciarch_restore(jsonb) from public,anon,authenticated;
grant execute on function public.fonciarch_restore(jsonb) to service_role;

commit;
