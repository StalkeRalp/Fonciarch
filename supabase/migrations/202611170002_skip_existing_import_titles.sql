-- Pendant un import, ignorer les numéros déjà enregistrés et les répétitions
-- du même fichier, puis continuer avec les nouveaux titres.
begin;

create or replace function public.fonciarch_apply_operation(
  p_operation_id uuid,
  p_action text,
  p_input jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  previous public.fonciarch_operations;
  fingerprint text;
  result jsonb;
  import_rows jsonb;
  row_value jsonb;
  normalized_number text;
  seen_numbers text[] := array[]::text[];
begin
  if p_operation_id is null then
    raise exception 'INVALID: Identifiant d’opération obligatoire.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  fingerprint := encode(
    sha256(convert_to(jsonb_build_object('action', p_action, 'input', p_input)::text, 'UTF8')),
    'hex'
  );

  select * into previous
  from public.fonciarch_operations
  where id = p_operation_id;

  if found then
    if previous.fingerprint <> fingerprint then
      raise exception 'CONFLICT: Identifiant déjà utilisé pour une autre opération.';
    end if;
    return jsonb_build_object('id', p_operation_id, 'result', previous.result);
  end if;

  if p_action = 'import' then
    if jsonb_typeof(p_input->'rows') is distinct from 'array' then
      raise exception 'INVALID: Lignes d’import invalides.';
    end if;
    if jsonb_array_length(p_input->'rows') not between 1 and 5000 then
      raise exception 'INVALID: Import limité à 5000 lignes.';
    end if;

    import_rows := '[]'::jsonb;
    for row_value in select value from jsonb_array_elements(p_input->'rows') loop
      normalized_number := regexp_replace(trim(coalesce(row_value->>'number', '')), '[[:space:]-]', '', 'g');
      if normalized_number ~ '^[0-9]+$' then
        if exists (
          select 1 from public.fonciarch_titles
          where number = normalized_number
        ) then
          continue;
        end if;
        if normalized_number = any(seen_numbers) then
          continue;
        end if;
        seen_numbers := array_append(seen_numbers, normalized_number);
      end if;
      import_rows := import_rows || jsonb_build_array(row_value);
    end loop;

    if jsonb_array_length(import_rows) = 0 then
      result := '[]'::jsonb;
    else
      result := public.fonciarch_mutate(
        p_action,
        p_input || jsonb_build_object('rows', import_rows)
      );
    end if;
  else
    result := public.fonciarch_mutate(p_action, p_input);
  end if;

  insert into public.fonciarch_operations(id, fingerprint, result)
  values (p_operation_id, fingerprint, result);
  return jsonb_build_object('id', p_operation_id, 'result', result);
end;
$function$;

notify pgrst, 'reload schema';
commit;
