-- Base de test uniquement après les trois migrations ; objets Storage simulés pour la recette SQL.

begin;
DO $checks$
declare first_title jsonb; second_title jsonb; first_file jsonb; again_file jsonb; file_id uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); failure boolean:=false;
begin
 if not exists(select 1 from public.fonciarch_boxes where number='15') then perform public.fonciarch_apply_operation(gen_random_uuid(),'box','{"number":"15"}'); end if;
 first_title:=public.fonciarch_apply_operation(gen_random_uuid(),'title',jsonb_build_object('clientId',a,'number','1500','category','A','box','15','cadastre','Mfoundi B'));
 second_title:=public.fonciarch_apply_operation(gen_random_uuid(),'title',jsonb_build_object('clientId',b,'number','1500','category','A','box','15','cadastre','Mfoundi C'));
 if first_title->'result'->>'cadastre'<>'Mfoundi B' or second_title->'result'->>'cadastre'<>'Mfoundi C' then raise exception 'cadastre non conservé'; end if;
 if public.fonciarch_workspace()->'capabilities'->>'titleCadastre'<>'true' then raise exception 'capacités absentes'; end if;
 if exists(select 1 from storage.buckets where id like 'fonciarch-%' and public) then raise exception 'bucket public'; end if;
 insert into storage.objects(bucket_id,name) values('fonciarch-documents',file_id::text||'/file.pdf');
 first_file:=public.fonciarch_register_file(jsonb_build_object('id',file_id,'kind','document','bucket','fonciarch-documents','object_path',file_id::text||'/file.pdf','original_name','titre1500.pdf','mime_type','application/pdf','size_bytes',20,'sha256',repeat('a',64),'title_id',a));
 again_file:=public.fonciarch_register_file(first_file);
 if first_file<>again_file then raise exception 'rejeu fichier non idempotent'; end if;
 if (select count(*) from public.fonciarch_activities where after_value->>'id'=file_id::text)<>1 then raise exception 'journal dupliqué'; end if;
 begin perform public.fonciarch_register_file(first_file||jsonb_build_object('sha256',repeat('b',64)));exception when others then if sqlerrm not like 'CONFLICT:%' then raise; end if; failure:=true;end;
 if not failure then raise exception 'fichier remplacé'; end if;
 if has_table_privilege('anon','public.fonciarch_files','SELECT') then raise exception 'fichiers accessibles par anon'; end if;
 if has_function_privilege('anon','public.fonciarch_register_file(jsonb)','EXECUTE') then raise exception 'enregistrement public'; end if;
end;
$checks$;
DO $policy$
begin
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='fonciarch_private_objects' and permissive='RESTRICTIVE') then raise exception 'politique restrictive absente'; end if;
 if not (select relrowsecurity from pg_class where oid='storage.objects'::regclass) then raise exception 'RLS Storage inactif'; end if;
end;
$policy$;
-- Le filtrage effectif anon/authenticated doit aussi être testé sur le projet Supabase réel.
select 'STORAGE_ET_CADASTRES_OK' as resultat;
rollback;
