begin;

-- The function exposes user_id as an OUT parameter. In PL/pgSQL that makes
-- ON CONFLICT (user_id) ambiguous at runtime, even though the function can be
-- created successfully. Target the named primary-key constraint instead.
create or replace function public.save_user_preferences(
  p_full_name text default null,
  p_target_exam_id bigint default null,
  p_target_level_id bigint default null,
  p_clear_target_goal boolean default false,
  p_full_name_provided boolean default false,
  p_request_id uuid default gen_random_uuid()
)
returns table (
  active_academy_id bigint,
  duration_ms bigint,
  full_name text,
  is_initial_setup_completed boolean,
  metadata_payload jsonb,
  request_id uuid,
  should_refresh_session boolean,
  source text,
  target_exam_id bigint,
  target_level_id bigint,
  user_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_started timestamptz := clock_timestamp();
  v_preferences public.user_preferences%rowtype;
  v_metadata record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_full_name_provided and (p_full_name is null or btrim(p_full_name) = '') then
    raise exception 'Full name cannot be blank';
  end if;

  insert into public.user_preferences (
    user_id, full_name, target_exam_id, target_level_id, is_initial_setup_completed
  ) values (
    auth.uid(),
    case when p_full_name_provided then btrim(p_full_name) else null end,
    case when p_clear_target_goal then null else p_target_exam_id end,
    case when p_clear_target_goal then null else p_target_level_id end,
    p_full_name_provided
  )
  on conflict on constraint user_preferences_pkey do update set
    full_name = case
      when p_full_name_provided then excluded.full_name
      else public.user_preferences.full_name
    end,
    target_exam_id = case
      when p_clear_target_goal then null
      when p_target_exam_id is not null then p_target_exam_id
      else public.user_preferences.target_exam_id
    end,
    target_level_id = case
      when p_clear_target_goal then null
      when p_target_level_id is not null then p_target_level_id
      else public.user_preferences.target_level_id
    end,
    is_initial_setup_completed = public.user_preferences.is_initial_setup_completed
      or p_full_name_provided
  returning * into v_preferences;

  if p_full_name_provided then
    update public.profiles set full_name = v_preferences.full_name where id = auth.uid();
  end if;

  select * into v_metadata
  from public.sync_user_metadata(auth.uid(), '[]'::jsonb, p_request_id);

  active_academy_id := v_preferences.active_academy_id;
  duration_ms := greatest(
    0,
    floor(extract(epoch from clock_timestamp() - v_started) * 1000)::bigint
  );
  full_name := v_preferences.full_name;
  is_initial_setup_completed := v_preferences.is_initial_setup_completed;
  metadata_payload := v_metadata.metadata_payload;
  request_id := v_metadata.request_id;
  should_refresh_session := v_metadata.should_refresh_session;
  source := 'database';
  target_exam_id := v_preferences.target_exam_id;
  target_level_id := v_preferences.target_level_id;
  user_id := v_preferences.user_id;
  return next;
end;
$$;

commit;
