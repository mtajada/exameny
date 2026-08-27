begin;

insert into public.error_categories (id, code, name, description) values
  (1, 'GR', 'Grammar', 'Form and structure choices that affect grammatical accuracy.'),
  (2, 'LX', 'Lexis', 'Word choice and phrase combinations that affect meaning.'),
  (3, 'DC', 'Discourse and cohesion', 'Connections and progression across sentences and paragraphs.'),
  (4, 'TA', 'Task achievement', 'Coverage, format, genre and audience requirements.'),
  (5, 'ME', 'Mechanics', 'Spelling and punctuation conventions that affect readability.'),
  (6, 'RS', 'Register and style', 'Tone, concision and formality choices for the intended reader.')
on conflict (id) do update set
  code = excluded.code,
  name = excluded.name,
  description = excluded.description;

with canonical_tags (id, category_code, code) as (
  values
    (1, 'GR', 'VERB_FORM'),
    (2, 'LX', 'WORD_CHOICE'),
    (3, 'DC', 'COHESIVE_DEVICE'),
    (4, 'TA', 'TASK_COVERAGE'),
    (5, 'GR', 'TENSE_ASPECT'),
    (6, 'GR', 'GERUND_INFINITIVE'),
    (7, 'GR', 'SVA'),
    (8, 'GR', 'ARTICLE'),
    (9, 'GR', 'DETERMINER'),
    (10, 'GR', 'PREPOSITION'),
    (11, 'GR', 'PRONOUN'),
    (12, 'GR', 'WORD_ORDER'),
    (13, 'GR', 'COMPARATIVE'),
    (14, 'GR', 'CONDITIONAL'),
    (15, 'GR', 'PASSIVE'),
    (16, 'GR', 'REPORTED_SPEECH'),
    (17, 'GR', 'TENSE_SEQUENCE'),
    (18, 'GR', 'RELATIVE_CLAUSE'),
    (19, 'GR', 'NEGATION'),
    (20, 'GR', 'QUANTIFIER'),
    (21, 'GR', 'MODAL'),
    (22, 'GR', 'QUESTION_FORM'),
    (23, 'GR', 'PARTICIPLE_CLAUSE'),
    (24, 'GR', 'INVERSION'),
    (25, 'GR', 'CLAUSE_SUBORDINATION'),
    (26, 'GR', 'SUBJUNCTIVE'),
    (27, 'LX', 'COLLOCATION'),
    (28, 'LX', 'PHRASAL_VERB'),
    (29, 'LX', 'WORD_FORMATION'),
    (30, 'LX', 'DEPENDENT_PREPOSITION'),
    (31, 'LX', 'COUNTABILITY'),
    (32, 'LX', 'FALSE_FRIEND'),
    (33, 'LX', 'HOMOPHONE_CHOICE'),
    (34, 'LX', 'IDIOM'),
    (35, 'ME', 'SPELLING'),
    (36, 'ME', 'PUNCTUATION'),
    (37, 'ME', 'CAPITALIZATION'),
    (38, 'ME', 'HYPHENATION'),
    (39, 'ME', 'APOSTROPHE'),
    (40, 'ME', 'COMMA_RULE'),
    (41, 'ME', 'QUOTATION_MARKS'),
    (42, 'DC', 'REFERENCE'),
    (43, 'DC', 'SENTENCE_BOUNDARY'),
    (44, 'DC', 'PARAGRAPHING'),
    (45, 'DC', 'LOGICAL_COHERENCE'),
    (46, 'DC', 'MISUSED_CONNECTOR'),
    (47, 'DC', 'TOPIC_SENTENCE_MISSING'),
    (48, 'DC', 'COHERENCE_JUMP'),
    (49, 'RS', 'REGISTER'),
    (50, 'RS', 'CONCISION'),
    (51, 'RS', 'TONE_POLITENESS'),
    (52, 'RS', 'HEDGING'),
    (53, 'TA', 'WORD_COUNT'),
    (54, 'TA', 'UNDERLENGTH'),
    (55, 'TA', 'OVERLENGTH'),
    (56, 'TA', 'MISSING_BULLET'),
    (57, 'TA', 'OFF_TOPIC'),
    (58, 'TA', 'IMBALANCED_COVERAGE'),
    (59, 'TA', 'FORMAT'),
    (60, 'TA', 'GENRE_CONVENTIONS_ISSUE')
)
insert into public.error_tags (
  id,
  category_id,
  code,
  name,
  description,
  skills
)
select
  canonical_tags.id,
  category.id,
  canonical_tags.code,
  initcap(replace(canonical_tags.code, '_', ' ')),
  'Review the use of ' || lower(replace(canonical_tags.code, '_', ' ')) || ' in context.',
  '{}'::text[]
from canonical_tags
join public.error_categories category on category.code = canonical_tags.category_code
on conflict (id) do update set
  category_id = excluded.category_id,
  code = excluded.code,
  name = excluded.name,
  description = excluded.description,
  skills = excluded.skills;

create or replace function public.list_user_academies()
returns table (active_academies jsonb, inactive_academies jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'membership_id', am.id,
          'academy_id', am.academy_id,
          'academy_name', a.name,
          'role', am.role,
          'status', am.status
        ) order by a.name
      ) filter (where am.status = 'active'),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'membership_id', am.id,
          'academy_id', am.academy_id,
          'academy_name', a.name,
          'role', am.role,
          'status', am.status
        ) order by a.name
      ) filter (where am.status = 'inactive'),
      '[]'::jsonb
    )
  from public.academy_memberships am
  join public.academies a on a.id = am.academy_id
  where am.user_id = auth.uid();
$$;

comment on function public.list_user_academies() is
  'Returns only the authenticated user memberships, including academy names for inactive access states.';

revoke all on function public.list_user_academies() from public, anon;
grant execute on function public.list_user_academies() to authenticated;

create or replace function public.resolve_current_membership(p_user_id uuid)
returns public.academy_memberships
language sql
stable
security definer
set search_path = ''
as $$
  select am
  from public.academy_memberships am
  where am.user_id = p_user_id
    and am.status = 'active'
    and (
      am.academy_id = (
        select up.active_academy_id
        from public.user_preferences up
        where up.user_id = p_user_id
      )
      or 1 = (
        select count(*)
        from public.academy_memberships active_membership
        where active_membership.user_id = p_user_id
          and active_membership.status = 'active'
      )
    )
  order by am.id
  limit 1;
$$;

comment on function public.resolve_current_membership(uuid) is
  'Returns a valid preferred membership or the sole active membership; ambiguous multi-academy users must choose.';

create or replace function public.get_my_academy_id_from_jwt()
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select am.academy_id
  from public.academy_memberships am
  where am.user_id = auth.uid()
    and am.status = 'active'
    and (
      am.academy_id = (
        select up.active_academy_id
        from public.user_preferences up
        where up.user_id = auth.uid()
      )
      or 1 = (
        select count(*)
        from public.academy_memberships active_membership
        where active_membership.user_id = auth.uid()
          and active_membership.status = 'active'
      )
    )
  order by am.id
  limit 1;
$$;

comment on function public.get_my_academy_id_from_jwt() is
  'Returns the authenticated user selected academy, or the sole active academy when selection is unambiguous.';

create or replace function public.reconcile_active_academy_preference(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active_count bigint;
  v_only_academy_id bigint;
begin
  select count(*), min(am.academy_id)
  into v_active_count, v_only_academy_id
  from public.academy_memberships am
  where am.user_id = p_user_id
    and am.status = 'active';

  insert into public.user_preferences (user_id, active_academy_id)
  values (
    p_user_id,
    case when v_active_count = 1 then v_only_academy_id else null end
  )
  on conflict on constraint user_preferences_pkey do update
    set active_academy_id = case
      when exists (
        select 1
        from public.academy_memberships am
        where am.user_id = p_user_id
          and am.academy_id = public.user_preferences.active_academy_id
          and am.status = 'active'
      ) then public.user_preferences.active_academy_id
      when v_active_count = 1 then v_only_academy_id
      else null
    end;
end;
$$;

comment on function public.reconcile_active_academy_preference(uuid) is
  'Preserves a valid academy choice, selects the sole active academy, and requires an explicit choice when several remain.';

create or replace function public.finalize_invited_signup(
  p_request_id uuid default gen_random_uuid()
)
returns table (
  auto_selected_academy_id bigint,
  is_platform_admin boolean,
  memberships jsonb,
  memberships_claimed jsonb,
  memberships_inactive jsonb,
  metadata_payload jsonb,
  request_id uuid,
  should_refresh_session boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := public.get_my_email_from_jwt();
  v_claimed jsonb := '[]'::jsonb;
  v_metadata record;
begin
  if v_user_id is null or v_email = '' then
    raise exception 'Authenticated user and email are required';
  end if;

  insert into public.profiles (id, email)
  values (v_user_id, v_email)
  on conflict (id) do update set email = excluded.email;

  with claimed as (
    update public.academy_memberships am
    set user_id = v_user_id, status = 'active'
    where am.email = v_email
      and am.status = 'awaiting_login'
      and am.user_id is null
    returning am.id, am.academy_id, am.role, am.status
  )
  select coalesce(jsonb_agg(to_jsonb(claimed)), '[]'::jsonb)
  into v_claimed
  from claimed;

  perform public.reconcile_active_academy_preference(v_user_id);

  select * into v_metadata
  from public.sync_user_metadata(v_user_id, v_claimed, p_request_id);

  auto_selected_academy_id := (
    select up.active_academy_id
    from public.user_preferences up
    where up.user_id = v_user_id
  );
  is_platform_admin := public.is_platform_admin(v_user_id);
  select coalesce(jsonb_agg(to_jsonb(am) order by am.academy_id), '[]'::jsonb)
    into memberships
  from public.academy_memberships am
  where am.user_id = v_user_id and am.status = 'active';
  memberships_claimed := v_claimed;
  select coalesce(jsonb_agg(to_jsonb(am) order by am.academy_id), '[]'::jsonb)
    into memberships_inactive
  from public.academy_memberships am
  where am.user_id = v_user_id and am.status = 'inactive';
  metadata_payload := v_metadata.metadata_payload;
  request_id := v_metadata.request_id;
  should_refresh_session := v_metadata.should_refresh_session;
  return next;
end;
$$;

comment on function public.finalize_invited_signup(uuid) is
  'Claims invitations and returns a safe onboarding snapshot, including the valid no-membership waiting state.';

create or replace function private.utf16_offset_to_character_index(
  p_value text,
  p_offset integer
)
returns integer
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  v_character text;
  v_utf16_offset integer := 0;
begin
  if p_offset < 0 then
    raise exception using message = 'INVALID_UTF16_OFFSET', errcode = '22023';
  end if;

  if p_offset = 0 then
    return 0;
  end if;

  for v_character_index in 1..char_length(p_value)
  loop
    v_character := substring(p_value from v_character_index for 1);
    v_utf16_offset := v_utf16_offset + case
      when ascii(v_character) > 65535 then 2
      else 1
    end;

    if v_utf16_offset = p_offset then
      return v_character_index;
    end if;

    if v_utf16_offset > p_offset then
      raise exception using message = 'INVALID_UTF16_OFFSET', errcode = '22023';
    end if;
  end loop;

  raise exception using message = 'INVALID_UTF16_OFFSET', errcode = '22023';
end;
$$;

comment on function private.utf16_offset_to_character_index(text, integer) is
  'Maps a JavaScript UTF-16 boundary to a PostgreSQL character boundary and rejects split surrogate pairs.';

revoke all on function private.utf16_offset_to_character_index(text, integer)
  from public, anon, authenticated, service_role;

create or replace function public.save_eval_and_mistakes(
  p_submission_id uuid,
  p_eval jsonb,
  p_mistakes jsonb,
  p_actor_user_id uuid,
  p_actor_academy_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_submission public.submissions%rowtype;
  v_student_membership public.academy_memberships%rowtype;
  v_is_platform_admin boolean;
  v_mistakes_status text;
  v_mistakes_error text;
  v_items jsonb;
  v_items_v2 jsonb;
  v_metrics_v2 jsonb;
  v_summary jsonb;
  v_default_summary jsonb := jsonb_build_object(
    'total', 0,
    'byCategory', '{}'::jsonb,
    'byTag', '{}'::jsonb
  );
  v_item jsonb;
  v_item_v2 jsonb;
  v_legacy_item jsonb;
  v_feature_tag jsonb;
  v_category_id bigint;
  v_category_code text;
  v_v2_category_id bigint;
  v_tag_id bigint;
  v_tag_code text;
  v_v2_tag_id bigint;
  v_v2_tag_code text;
  v_resolution_status text;
  v_anchored_count integer := 0;
  v_ambiguous_count integer := 0;
  v_not_found_count integer := 0;
  v_invalid_count integer := 0;
  v_summary_by_category jsonb := '{}'::jsonb;
  v_summary_by_tag jsonb := '{}'::jsonb;
  v_anchor_start integer;
  v_anchor_end integer;
  v_anchor_start_character integer;
  v_anchor_end_character integer;
  v_anchor_text text;
begin
  perform private.assert_service_role();

  if p_actor_user_id is null then
    raise exception using message = 'ACTOR_CONTEXT_REQUIRED';
  end if;

  select s.*
  into v_submission
  from public.submissions s
  where s.id = p_submission_id
  for update;

  if v_submission.id is null then
    raise exception 'Submission % not found', p_submission_id using errcode = 'P0002';
  end if;

  select am.*
  into v_student_membership
  from public.academy_memberships am
  where am.id = v_submission.student_membership_id;

  if v_student_membership.id is null or v_student_membership.user_id is null then
    raise exception using message = 'SUBMISSION_MEMBERSHIP_UNCLAIMED';
  end if;

  v_is_platform_admin := public.is_platform_admin(p_actor_user_id);

  if not v_is_platform_admin then
    if v_student_membership.status <> 'active' then
      raise exception using message = 'SUBMISSION_MEMBERSHIP_INACTIVE';
    end if;

    if p_actor_academy_id is distinct from v_student_membership.academy_id then
      raise exception using message = 'ACTOR_ACADEMY_MISMATCH';
    end if;

    if p_actor_user_id <> v_student_membership.user_id
       and not exists (
         select 1
         from public.academy_memberships actor_membership
         where actor_membership.user_id = p_actor_user_id
           and actor_membership.academy_id = v_student_membership.academy_id
           and actor_membership.status = 'active'
           and actor_membership.role in ('teacher', 'academy_admin')
       ) then
      raise exception using message = 'ACTOR_NOT_AUTHORIZED';
    end if;
  end if;

  if jsonb_typeof(p_eval) is distinct from 'object'
     or jsonb_typeof(p_eval -> 'criteriaEvaluation') is distinct from 'array'
     or nullif(btrim(p_eval ->> 'overallScore'), '') is null
     or nullif(btrim(p_eval ->> 'overallCommentary'), '') is null then
    raise exception using message = 'INVALID_EVALUATION_PAYLOAD', errcode = '22023';
  end if;

  if jsonb_typeof(p_mistakes) is distinct from 'object' then
    raise exception using message = 'INVALID_MISTAKES_PAYLOAD', errcode = '22023';
  end if;

  v_mistakes_status := coalesce(p_mistakes ->> 'status', 'failed');
  if v_mistakes_status not in ('completed', 'failed') then
    raise exception 'Invalid mistakes status %', v_mistakes_status using errcode = '22023';
  end if;

  v_items := coalesce(p_mistakes -> 'items', '[]'::jsonb);
  v_items_v2 := p_mistakes -> 'items_v2';
  v_metrics_v2 := p_mistakes -> 'metrics_v2';
  v_summary := coalesce(p_mistakes -> 'summary', v_default_summary);
  v_mistakes_error := nullif(btrim(p_mistakes ->> 'error'), '');

  if v_mistakes_status = 'completed' then
    if jsonb_typeof(v_items) is distinct from 'array'
       or jsonb_typeof(v_items_v2) is distinct from 'array'
       or jsonb_typeof(v_metrics_v2) is distinct from 'object'
       or jsonb_typeof(v_summary) is distinct from 'object'
       or jsonb_typeof(v_summary -> 'byCategory') is distinct from 'object'
       or jsonb_typeof(v_summary -> 'byTag') is distinct from 'object' then
      raise exception using message = 'INVALID_COMPLETED_MISTAKES_PAYLOAD', errcode = '22023';
    end if;

    if coalesce(v_metrics_v2 ->> 'total', '') !~ '^[0-9]+$'
       or coalesce(v_metrics_v2 ->> 'anchored', '') !~ '^[0-9]+$'
       or coalesce(v_metrics_v2 ->> 'ambiguous', '') !~ '^[0-9]+$'
       or coalesce(v_metrics_v2 ->> 'not_found', '') !~ '^[0-9]+$'
       or coalesce(v_metrics_v2 ->> 'invalid', '') !~ '^[0-9]+$'
       or coalesce(v_metrics_v2 ->> 'resolverVersion', '') <> '2'
       or (v_metrics_v2 ->> 'total')::integer <>
          (v_metrics_v2 ->> 'anchored')::integer +
          (v_metrics_v2 ->> 'ambiguous')::integer +
          (v_metrics_v2 ->> 'not_found')::integer +
          (v_metrics_v2 ->> 'invalid')::integer
       or jsonb_array_length(v_items) <> (v_metrics_v2 ->> 'anchored')::integer
       or jsonb_array_length(v_items_v2) > (v_metrics_v2 ->> 'total')::integer then
      raise exception using message = 'INCONSISTENT_MISTAKES_METRICS', errcode = '22023';
    end if;

    for v_item_v2 in select value from jsonb_array_elements(v_items_v2)
    loop
      v_category_code := nullif(btrim(v_item_v2 ->> 'category'), '');
      select category.id, category.code
      into v_v2_category_id, v_category_code
      from public.error_categories category
      where category.code = v_category_code;

      if v_category_code is null
         or coalesce(v_item_v2 ->> 'categoryId', '') !~ '^[0-9]+$'
         or (v_item_v2 ->> 'categoryId')::bigint <> v_v2_category_id
         or jsonb_typeof(v_item_v2 -> 'featureTags') is distinct from 'array'
         or jsonb_typeof(v_item_v2 -> 'anchorResolution') is distinct from 'object'
         or coalesce(v_item_v2 #>> '{anchorResolution,status}', '') not in (
           'anchored', 'ambiguous', 'not_found', 'invalid'
         )
         or nullif(btrim(v_item_v2 ->> 'explanation'), '') is null then
        raise exception using message = 'INVALID_MISTAKES_V2_ITEM', errcode = '22023';
      end if;

      v_summary_by_category := jsonb_set(
        v_summary_by_category,
        array[v_category_code],
        to_jsonb(coalesce((v_summary_by_category ->> v_category_code)::integer, 0) + 1),
        true
      );

      for v_feature_tag in select value from jsonb_array_elements(v_item_v2 -> 'featureTags')
      loop
        v_v2_tag_code := trim(both '"' from v_feature_tag::text);
        if jsonb_typeof(v_feature_tag) is distinct from 'string'
           or not exists (
             select 1
             from public.error_tags tag
             join public.error_categories category on category.id = tag.category_id
             where tag.code = v_v2_tag_code
               and category.code = v_category_code
           ) then
          raise exception using message = 'MISTAKES_V2_TAG_CATEGORY_MISMATCH', errcode = '23514';
        end if;

        v_summary_by_tag := jsonb_set(
          v_summary_by_tag,
          array[v_v2_tag_code],
          to_jsonb(coalesce((v_summary_by_tag ->> v_v2_tag_code)::integer, 0) + 1),
          true
        );
      end loop;

      v_v2_tag_code := nullif(btrim(v_item_v2 ->> 'primaryTag'), '');
      v_v2_tag_id := nullif(v_item_v2 ->> 'primaryTagId', '')::bigint;

      if jsonb_array_length(v_item_v2 -> 'featureTags') = 0 then
        if v_v2_tag_code is not null or v_v2_tag_id is not null then
          raise exception using message = 'MISTAKES_V2_PRIMARY_TAG_MISMATCH', errcode = '23514';
        end if;
      else
        if v_v2_tag_code is distinct from (v_item_v2 -> 'featureTags' ->> 0)
           or v_v2_tag_id is null
           or not exists (
             select 1
             from public.error_tags tag
             where tag.id = v_v2_tag_id
               and tag.code = v_v2_tag_code
               and tag.category_id = v_v2_category_id
           ) then
          raise exception using message = 'MISTAKES_V2_PRIMARY_TAG_MISMATCH', errcode = '23514';
        end if;
      end if;

      v_resolution_status := v_item_v2 #>> '{anchorResolution,status}';
      case v_resolution_status
        when 'anchored' then
          v_anchored_count := v_anchored_count + 1;
          v_legacy_item := v_items -> (v_anchored_count - 1);

          if v_legacy_item is null
             or coalesce(v_item_v2 #>> '{anchorResolution,start}', '') !~ '^[0-9]+$'
             or coalesce(v_item_v2 #>> '{anchorResolution,end}', '') !~ '^[0-9]+$'
             or nullif(v_legacy_item ->> 'category_id', '')::bigint is distinct from v_v2_category_id
             or nullif(btrim(v_legacy_item ->> 'category_code'), '') is distinct from v_category_code
             or nullif(v_legacy_item ->> 'tag_id', '')::bigint is distinct from v_v2_tag_id
             or nullif(btrim(v_legacy_item ->> 'tag_code'), '') is distinct from v_v2_tag_code
             or nullif(v_legacy_item ->> 'anchor_start', '')::integer is distinct from
                (v_item_v2 #>> '{anchorResolution,start}')::integer
             or nullif(v_legacy_item ->> 'anchor_end', '')::integer is distinct from
                (v_item_v2 #>> '{anchorResolution,end}')::integer
             or v_legacy_item ->> 'explanation' is distinct from v_item_v2 ->> 'explanation' then
            raise exception using message = 'MISTAKES_V2_LEGACY_ITEM_MISMATCH', errcode = '23514';
          end if;
        when 'ambiguous' then
          v_ambiguous_count := v_ambiguous_count + 1;
        when 'not_found' then
          v_not_found_count := v_not_found_count + 1;
        when 'invalid' then
          v_invalid_count := v_invalid_count + 1;
      end case;
    end loop;

    if v_anchored_count <> (v_metrics_v2 ->> 'anchored')::integer
       or v_ambiguous_count <> (v_metrics_v2 ->> 'ambiguous')::integer
       or v_not_found_count <> (v_metrics_v2 ->> 'not_found')::integer
       or v_invalid_count > (v_metrics_v2 ->> 'invalid')::integer then
      raise exception using message = 'INCONSISTENT_MISTAKES_METRICS', errcode = '22023';
    end if;

    if v_summary -> 'byCategory' is distinct from v_summary_by_category
       or v_summary -> 'byTag' is distinct from v_summary_by_tag
       or (
         v_summary ? 'total'
         and (
           coalesce(v_summary ->> 'total', '') !~ '^[0-9]+$'
           or (v_summary ->> 'total')::integer <> (v_metrics_v2 ->> 'total')::integer
         )
       ) then
      raise exception using message = 'INCONSISTENT_MISTAKES_SUMMARY', errcode = '22023';
    end if;

    v_summary := jsonb_build_object(
      'total', (v_metrics_v2 ->> 'total')::integer,
      'byCategory', v_summary_by_category,
      'byTag', v_summary_by_tag
    );
    v_mistakes_error := null;
  else
    v_items := '[]'::jsonb;
    v_mistakes_error := coalesce(v_mistakes_error, 'normalization_failed');
  end if;

  insert into public.evaluations (
    submission_id,
    status,
    ai_overall_score,
    ai_criteria_evaluation,
    ai_overall_commentary,
    ai_mistakes_summary,
    ai_mistakes_status,
    ai_mistakes_error,
    ai_mistakes_items_v2,
    ai_mistakes_metrics_v2,
    evaluation_completed_at,
    updated_at
  ) values (
    p_submission_id,
    'ai_evaluated',
    p_eval ->> 'overallScore',
    p_eval -> 'criteriaEvaluation',
    p_eval ->> 'overallCommentary',
    case when v_mistakes_status = 'completed' then v_summary else v_default_summary end,
    v_mistakes_status,
    v_mistakes_error,
    case when v_mistakes_status = 'completed' then v_items_v2 else null end,
    case when v_mistakes_status = 'completed' then v_metrics_v2 else null end,
    statement_timestamp(),
    statement_timestamp()
  )
  on conflict (submission_id) do update set
    status = excluded.status,
    ai_overall_score = excluded.ai_overall_score,
    ai_criteria_evaluation = excluded.ai_criteria_evaluation,
    ai_overall_commentary = excluded.ai_overall_commentary,
    ai_mistakes_summary = case
      when v_mistakes_status = 'completed' then excluded.ai_mistakes_summary
      else coalesce(public.evaluations.ai_mistakes_summary, v_default_summary)
    end,
    ai_mistakes_status = excluded.ai_mistakes_status,
    ai_mistakes_error = excluded.ai_mistakes_error,
    ai_mistakes_items_v2 = case
      when v_mistakes_status = 'completed' then excluded.ai_mistakes_items_v2
      else public.evaluations.ai_mistakes_items_v2
    end,
    ai_mistakes_metrics_v2 = case
      when v_mistakes_status = 'completed' then excluded.ai_mistakes_metrics_v2
      else public.evaluations.ai_mistakes_metrics_v2
    end,
    evaluation_completed_at = excluded.evaluation_completed_at,
    updated_at = statement_timestamp();

  if v_mistakes_status = 'completed' then
    delete from public.mistakes
    where writing_submission_id = p_submission_id;

    for v_item in select value from jsonb_array_elements(v_items)
    loop
      v_category_id := nullif(v_item ->> 'category_id', '')::bigint;
      v_tag_id := nullif(v_item ->> 'tag_id', '')::bigint;
      v_anchor_start := nullif(v_item ->> 'anchor_start', '')::integer;
      v_anchor_end := nullif(v_item ->> 'anchor_end', '')::integer;

      select category.code
      into v_category_code
      from public.error_categories category
      where category.id = v_category_id;

      if v_category_id is null
         or v_category_code is null then
        raise exception using message = 'MISTAKE_CATEGORY_REQUIRED', errcode = '23502';
      end if;

      if nullif(btrim(v_item ->> 'category_code'), '') is distinct from v_category_code then
        raise exception using message = 'MISTAKE_CATEGORY_CODE_MISMATCH', errcode = '23514';
      end if;

      v_tag_code := null;
      if v_tag_id is not null then
        select tag.code
        into v_tag_code
        from public.error_tags tag
        where tag.id = v_tag_id
          and tag.category_id = v_category_id;

        if v_tag_code is null then
          raise exception using message = 'MISTAKE_TAG_CATEGORY_MISMATCH', errcode = '23514';
        end if;

        if nullif(btrim(v_item ->> 'tag_code'), '') is distinct from v_tag_code then
          raise exception using message = 'MISTAKE_TAG_CODE_MISMATCH', errcode = '23514';
        end if;
      elsif nullif(btrim(v_item ->> 'tag_code'), '') is not null then
        raise exception using message = 'MISTAKE_TAG_CODE_MISMATCH', errcode = '23514';
      end if;

      if v_anchor_start is null
         or v_anchor_end is null
         or v_anchor_start < 0
         or v_anchor_end <= v_anchor_start then
        raise exception using message = 'INVALID_MISTAKE_ANCHOR', errcode = '22023';
      end if;

      begin
        v_anchor_start_character := private.utf16_offset_to_character_index(
          coalesce(v_submission.submission_text, ''),
          v_anchor_start
        );
        v_anchor_end_character := private.utf16_offset_to_character_index(
          coalesce(v_submission.submission_text, ''),
          v_anchor_end
        );
      exception
        when sqlstate '22023' then
          raise exception using message = 'INVALID_MISTAKE_ANCHOR', errcode = '22023';
      end;

      if nullif(btrim(v_item ->> 'explanation'), '') is null then
        raise exception using message = 'MISTAKE_EXPLANATION_REQUIRED', errcode = '22023';
      end if;

      v_anchor_text := substring(
        coalesce(v_submission.submission_text, '')
        from v_anchor_start_character + 1
        for v_anchor_end_character - v_anchor_start_character
      );

      if nullif(v_item ->> 'anchor_text', '') is null
         or v_anchor_text is distinct from v_item ->> 'anchor_text' then
        raise exception using message = 'MISTAKE_ANCHOR_TEXT_MISMATCH', errcode = '22023';
      end if;

      insert into public.mistakes (
        student_id,
        task_type_id,
        writing_submission_id,
        anchor_text,
        anchor_start,
        anchor_end,
        suggested_correction,
        explanation,
        category_id,
        tag_id,
        meta
      ) values (
        v_submission.student_id,
        v_submission.task_type_id,
        p_submission_id,
        v_anchor_text,
        v_anchor_start,
        v_anchor_end,
        nullif(v_item ->> 'suggested_correction', ''),
        v_item ->> 'explanation',
        v_category_id,
        v_tag_id,
        case
          when jsonb_typeof(v_item -> 'meta') = 'object' then v_item -> 'meta'
          else '{}'::jsonb
        end
      );
    end loop;
  end if;

  update public.submissions
  set status = 'evaluated',
      updated_at = statement_timestamp()
  where id = p_submission_id;
end;
$$;

comment on function public.save_eval_and_mistakes(uuid, jsonb, jsonb, uuid, bigint) is
  'Service-role-only transaction for authorized evaluation results and complete Mistakes v2 payloads.';

revoke all on function public.save_eval_and_mistakes(uuid, jsonb, jsonb, uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.save_eval_and_mistakes(uuid, jsonb, jsonb, uuid, bigint)
  to service_role;

commit;
