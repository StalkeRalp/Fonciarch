-- Un numéro de titre ne peut apparaître qu'une seule fois dans le registre,
-- quelle que soit sa conservation, son cadastre ou son box.
begin;

do $migration$
declare duplicate_list text;
begin
  select string_agg(format('%s (%s lignes)', number, occurrences), ', ' order by number)
    into duplicate_list
  from (
    select number, count(*) as occurrences
    from public.fonciarch_titles
    group by number
    having count(*) > 1
    order by number
    limit 20
  ) as duplicates;

  if duplicate_list is not null then
    raise exception 'Migration annulée : des numéros de titre existent déjà en doublon. Corrigez ces lignes puis relancez la migration. Exemples : %', duplicate_list;
  end if;
end;
$migration$;

create unique index if not exists fonciarch_titles_number_unique_idx
  on public.fonciarch_titles (number);

create or replace function public.fonciarch_reject_duplicate_title_number()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if exists (
    select 1
    from public.fonciarch_titles as existing
    where existing.number = new.number
      and existing.id is distinct from new.id
  ) then
    raise exception using
      errcode = 'P0001',
      message = format('CONFLICT: Le numéro %s existe déjà dans le registre.', new.number);
  end if;
  return new;
end;
$function$;

drop trigger if exists fonciarch_titles_reject_duplicate_number
  on public.fonciarch_titles;
create trigger fonciarch_titles_reject_duplicate_number
  before insert or update of number on public.fonciarch_titles
  for each row execute function public.fonciarch_reject_duplicate_title_number();

notify pgrst, 'reload schema';
commit;
