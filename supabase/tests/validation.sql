-- Uniquement sur une base de test vide après la migration. Aucun test en production.
begin;
DO $test$
declare result jsonb; first jsonb; version text; failed boolean:=false;
begin
 if jsonb_array_length(public.fonciarch_workspace()->'titles')<>0 then raise exception 'registre non vide'; end if;
 perform public.fonciarch_apply_operation('10000000-0000-4000-8000-000000000001','box','{"number":"01"}');
 perform public.fonciarch_apply_operation('10000000-0000-4000-8000-000000000002','box','{"number":"2"}');
 first:=public.fonciarch_apply_operation('10000000-0000-4000-8000-000000000003','title','{"number":"00123","category":"A","box":"1","clientId":"20000000-0000-4000-8000-000000000001"}');
 result:=public.fonciarch_apply_operation('10000000-0000-4000-8000-000000000003','title','{"number":"00123","category":"A","box":"1","clientId":"20000000-0000-4000-8000-000000000001"}');
 if first<>result then raise exception 'rejeu non idempotent'; end if;
 version:=first->'result'->>'updatedAt';
 perform public.fonciarch_apply_operation('10000000-0000-4000-8000-000000000004','move',jsonb_build_object('id','20000000-0000-4000-8000-000000000001','updatedAt',version,'box','2','reason','Réorganisation'));
 begin
  perform public.fonciarch_apply_operation('10000000-0000-4000-8000-000000000005','title',jsonb_build_object('id','20000000-0000-4000-8000-000000000001','number','00123','category','A','box','2','updatedAt',version));
 exception when others then if sqlerrm not like 'CONFLICT:%' then raise; end if; failed:=true;
 end;
 if not failed then raise exception 'conflit non détecté'; end if;
 if (select count(*) from public.fonciarch_titles)<>1 then raise exception 'doublon'; end if;
 if has_table_privilege('anon','public.fonciarch_titles','SELECT') then raise exception 'lecture anon autorisée'; end if;
 if has_function_privilege('anon','public.fonciarch_apply_operation(uuid,text,jsonb)','EXECUTE') then raise exception 'rpc anon autorisée'; end if;
 raise notice 'FONCIARCH SQL OK : création, rejeu, déplacement, conflit et droits';
end;
$test$;

rollback;
