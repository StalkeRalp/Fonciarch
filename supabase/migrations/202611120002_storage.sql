-- Exécuter après 202611120001_fonciarch.sql. Aucun fichier n’est rendu public.
begin;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values
 ('fonciarch-imports','fonciarch-imports',false,10485760,array['text/csv','text/plain','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
 ('fonciarch-documents','fonciarch-documents',false,20971520,array['application/pdf','image/jpeg','image/png']),
 ('fonciarch-exports','fonciarch-exports',false,20971520,array['text/csv','application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

do $$ begin
 if not (select relrowsecurity from pg_class where oid='storage.objects'::regclass) then raise exception 'Storage doit avoir RLS activé avant l’installation des permissions.'; end if;
end $$;
-- Les éventuelles autres politiques permissives ne doivent pas exposer ces buckets.
drop policy if exists fonciarch_private_objects on storage.objects;
create policy fonciarch_private_objects on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id not in ('fonciarch-imports','fonciarch-documents','fonciarch-exports'))
 with check(bucket_id not in ('fonciarch-imports','fonciarch-documents','fonciarch-exports'));

create table if not exists public.fonciarch_files (
 id uuid primary key,
 kind text not null check(kind in ('import','document','export')),
 bucket text not null,
 object_path text not null,
 original_name text not null check(length(original_name) between 1 and 255),
 mime_type text not null,
 size_bytes bigint not null check(size_bytes>0 and size_bytes<=20971520),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 title_id uuid references public.fonciarch_titles(id) on delete restrict,
 import_operation_id uuid,
 created_at timestamptz not null default clock_timestamp(),
 unique(bucket,object_path),
 check((kind='import' and bucket='fonciarch-imports' and size_bytes<=10485760) or (kind='document' and bucket='fonciarch-documents') or (kind='export' and bucket='fonciarch-exports'))
);
create index if not exists fonciarch_files_date_idx on public.fonciarch_files(created_at desc,id desc);
create index if not exists fonciarch_files_title_idx on public.fonciarch_files(title_id);
create index if not exists fonciarch_files_import_idx on public.fonciarch_files(import_operation_id);
alter table public.fonciarch_files enable row level security;
revoke all on public.fonciarch_files from anon,authenticated;
grant select,insert on public.fonciarch_files to service_role;
grant usage on schema storage to service_role;
grant select on storage.objects to service_role;

create or replace function public.fonciarch_register_file(p_file jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare prior public.fonciarch_files; saved public.fonciarch_files; file_id uuid;
begin
 file_id:=(p_file->>'id')::uuid;
 if file_id is null then raise exception 'INVALID: Identifiant du fichier obligatoire.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('file:'||file_id::text,0));
 select * into prior from public.fonciarch_files where id=file_id;
 if found then
  if prior.sha256 is distinct from p_file->>'sha256' or prior.bucket is distinct from p_file->>'bucket' or prior.kind is distinct from p_file->>'kind' or prior.original_name is distinct from p_file->>'original_name' or prior.size_bytes is distinct from (p_file->>'size_bytes')::bigint or prior.title_id is distinct from (p_file->>'title_id')::uuid or prior.import_operation_id is distinct from (p_file->>'import_operation_id')::uuid then raise exception 'CONFLICT: Ce fichier existe avec un autre contenu.'; end if;
  return to_jsonb(prior);
 end if;
 if (p_file->>'object_path') !~ ('^'||file_id::text||'/file\.(csv|xls|xlsx|pdf|jpg|jpeg|png)$') then raise exception 'INVALID: Emplacement du fichier invalide.'; end if;
 if not exists(select 1 from storage.objects where bucket_id=p_file->>'bucket' and name=p_file->>'object_path') then raise exception 'INVALID: Le transfert vers Storage doit être terminé avant son enregistrement.'; end if;
 insert into public.fonciarch_files(id,kind,bucket,object_path,original_name,mime_type,size_bytes,sha256,title_id,import_operation_id)
 values(file_id,p_file->>'kind',p_file->>'bucket',p_file->>'object_path',p_file->>'original_name',p_file->>'mime_type',(p_file->>'size_bytes')::bigint,p_file->>'sha256',(p_file->>'title_id')::uuid,(p_file->>'import_operation_id')::uuid)
 returning * into saved;
 insert into public.fonciarch_activities(actor,actor_id,action,item,before_value,after_value)
 values('Accès sans authentification','direct-access','Ajout d’un fichier',saved.original_name,null,to_jsonb(saved));
 return to_jsonb(saved);
end;
$$;
revoke execute on function public.fonciarch_register_file(jsonb) from public,anon,authenticated;
grant execute on function public.fonciarch_register_file(jsonb) to service_role;
-- La clé serveur utilise service_role. Aucune clé secrète ne doit être envoyée au navigateur.
notify pgrst,'reload schema';
commit;
