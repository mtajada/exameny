import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

const root = fileURLToPath(new URL('..', import.meta.url))
const migrationDirectory = `${root}/supabase/migrations`
const migrationFiles = (await readdir(migrationDirectory))
  .filter((name) => name.endsWith('.sql'))
  .sort()
const migrations = await Promise.all(
  migrationFiles.map((name) => readFile(`${migrationDirectory}/${name}`, 'utf8')),
)
const seed = await readFile(`${root}/supabase/seed.sql`, 'utf8')

const db = await PGlite.create({ dataDir: 'memory://exameny-public-schema' })

const scalar = async (sql) => {
  const result = await db.query(sql)
  const row = result.rows[0]
  return row[Object.keys(row)[0]]
}

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth authorization postgres;
    create schema extensions authorization postgres;

    create table auth.users (
      instance_id uuid,
      id uuid primary key,
      aud text,
      role text,
      email text unique,
      encrypted_password text,
      email_confirmed_at timestamptz,
      raw_app_meta_data jsonb not null default '{}'::jsonb,
      raw_user_meta_data jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;

    create function auth.jwt()
    returns jsonb
    language sql
    stable
    as $$
      select coalesce(
        nullif(current_setting('request.jwt.claims', true), '')::jsonb,
        '{}'::jsonb
      );
    $$;

    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant execute on function auth.jwt() to anon, authenticated, service_role;
  `)

  for (const migration of migrations) await db.exec(migration)
  await db.exec(seed)
  await db.exec(seed)
  for (const migration of migrations) await db.exec(migration)

  assert.equal(
    Number(await scalar(`
      select count(*)
      from pg_tables
      where schemaname = 'public'
    `)),
    32,
    'expected the complete public table set',
  )

  assert.equal(
    Number(await scalar(`
      select count(*)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and not c.relrowsecurity
    `)),
    0,
    'every public table must have RLS',
  )
  assert.equal(
    Number(await scalar(`
      select count(*)
      from information_schema.table_privileges
      where grantee = 'anon'
        and table_schema = 'public'
    `)),
    0,
    'anonymous clients must not receive table privileges',
  )
  assert.equal(
    Number(await scalar(`
      select count(*)
      from information_schema.routine_privileges
      where grantee in ('anon', 'PUBLIC')
        and routine_schema = 'public'
    `)),
    0,
    'anonymous and PUBLIC clients must not receive function execution',
  )
  assert.equal(
    Number(await scalar(`
      select count(*)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosecdef
        and not exists (
          select 1
          from unnest(coalesce(p.proconfig, array[]::text[])) setting
          where setting like 'search_path=%'
        )
    `)),
    0,
    'every SECURITY DEFINER function must pin search_path',
  )

  assert.equal(Number(await scalar('select count(*) from public.profiles')), 3)
  assert.equal(Number(await scalar('select count(*) from auth.users')), 3)
  assert.equal(
    Number(await scalar(`select count(*) from public.profiles where email !~ '@example\\.com$'`)),
    0,
  )

  assert.equal(
    Number(await scalar(`
      select count(*)
      from pg_namespace
      where nspname in ('admin', 'audit')
    `)),
    0,
    'the clean baseline must not recreate exposed legacy internal schemas',
  )
  assert.equal(
    Number(await scalar(`select count(*) from pg_namespace where nspname = 'private'`)),
    1,
    'the clean baseline must include one non-exposed internal schema',
  )
  assert.equal(
    await scalar(`select has_schema_privilege('service_role', 'private', 'USAGE')`),
    false,
    'service clients must reach internal storage only through public RPCs',
  )
  assert.equal(
    Number(await scalar(`
      select count(*)
      from information_schema.table_privileges
      where table_schema = 'private'
        and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
    `)),
    0,
    'internal tables must have no Data API role grants',
  )
  const serviceOnlyRpcs = [
    'public.enqueue_event_outbox(text,jsonb)',
    'public.upsert_membership_alias_conflict(uuid,bigint,text,text,uuid,jsonb)',
    'public.list_open_membership_alias_conflicts(bigint[])',
    'public.migrate_membership_role(uuid,bigint,boolean,bigint,text,text,uuid)',
    'public.resolve_membership_alias(uuid,bigint,boolean,bigint,text,text,uuid)',
    'public.update_profile_membership_data(bigint,text,text,bigint,uuid)',
    'public.admin_prepare_membership_invite(bigint,text,text)',
    'public.update_membership_subscription_dates(bigint,date,date,boolean,boolean,uuid)',
    'public.admin_manage_membership(bigint,uuid,text,text,date,date,boolean,boolean,boolean,text,boolean,uuid)',
  ]
  for (const signature of serviceOnlyRpcs) {
    assert.equal(
      await scalar(`select has_function_privilege('authenticated', '${signature}', 'EXECUTE')`),
      false,
      `authenticated clients must not execute ${signature}`,
    )
    assert.equal(
      await scalar(`select has_function_privilege('service_role', '${signature}', 'EXECUTE')`),
      true,
      `service clients must be able to execute ${signature}`,
    )
  }
  const serviceOrchestrationDocs = [
    {
      signature: 'public.admin_prepare_membership_invite(bigint,text,text)',
      description: 'Service-role-only Edge orchestration RPC for preparing membership invitations.',
    },
    {
      signature: 'public.update_membership_subscription_dates(bigint,date,date,boolean,boolean,uuid)',
      description: 'Service-role-only Edge orchestration RPC for membership subscription dates.',
    },
    {
      signature: 'public.admin_manage_membership(bigint,uuid,text,text,date,date,boolean,boolean,boolean,text,boolean,uuid)',
      description: 'Service-role-only Edge orchestration RPC for privileged membership mutation.',
    },
  ]
  for (const { signature, description } of serviceOrchestrationDocs) {
    assert.equal(
      await scalar(`select obj_description('${signature}'::regprocedure, 'pg_proc')`),
      description,
      `${signature} must document its service-only contract`,
    )
    assert.match(
      await scalar(`select pg_get_functiondef('${signature}'::regprocedure)`),
      /perform private\.assert_service_role\(\)/i,
      `${signature} must enforce service_role inside the function body`,
    )
  }
  const authenticatedSecurityDefinerRpcs = (await db.query(`
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    order by 1
  `)).rows.map(({ signature }) => signature)
  assert.deepEqual(
    authenticatedSecurityDefinerRpcs,
    [
      'activate_membership(bigint,uuid)',
      'can_access_academy(bigint,uuid)',
      'can_access_exercise(bigint,uuid)',
      'can_access_membership(bigint,uuid)',
      'can_access_speaking_session(uuid,uuid)',
      'can_access_submission(uuid,uuid)',
      'can_manage_academy(bigint,uuid)',
      'create_speaking_session(bigint,bigint,boolean,text)',
      'deactivate_membership(bigint,uuid)',
      'ensure_profile_membership_alignment(uuid)',
      'finalize_invited_signup(uuid)',
      'get_my_role_from_jwt()',
      'is_platform_admin(uuid)',
      'resolve_invitation_membership(text,bigint,bigint)',
      'save_user_preferences(text,bigint,bigint,boolean,boolean,uuid)',
      'set_active_academy(bigint,uuid)',
      'setup_student_profile(bigint,bigint,text)',
      'start_ruoe_attempt(bigint,bigint)',
      'update_profile_public_fields(text,text)',
    ],
    'authenticated SECURITY DEFINER grants must stay on the reviewed self-service surface',
  )
  assert.equal(
    await scalar(`
      select has_function_privilege(
        'authenticated',
        'public.sync_user_metadata(uuid,jsonb,uuid)',
        'EXECUTE'
      )
    `),
    false,
    'metadata assembly for arbitrary users must remain server-only',
  )
  assert.equal(
    await scalar(`select to_regprocedure('public.apply_metadata_payload(uuid,jsonb)') is null`),
    true,
    'the SQL baseline must not write directly to Auth metadata',
  )
  assert.equal(
    await scalar(`
      select has_function_privilege(
        'authenticated',
        'public.process_membership_claim(bigint,uuid,boolean)',
        'EXECUTE'
      )
    `),
    false,
    'membership claims must remain server-only',
  )
  assert.equal(
    await scalar(`
      select has_function_privilege(
        'authenticated',
        'public.save_evaluation_and_update_submission(uuid,text,jsonb,text)',
        'EXECUTE'
      )
    `),
    false,
    'AI persistence must remain server-only',
  )
  assert.equal(
    await scalar(`
      select has_function_privilege(
        'authenticated',
        'public.save_speaking_transcript(uuid,jsonb)',
        'EXECUTE'
      )
    `),
    false,
    'speaking transcript persistence must remain server-only',
  )
  assert.equal(
    Number(await scalar(`
      select count(*)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'auth'
        and not t.tgisinternal
    `)),
    0,
    'the public baseline must not install Auth triggers',
  )

  await db.exec(`
    set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
    set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","email":"admin@example.com","role":"authenticated"}';
    set role authenticated;
  `)
  const authenticatedAdminRpcAttempts = [
    `select * from public.admin_prepare_membership_invite(1, 'blocked-direct@example.com', 'student')`,
    `select * from public.update_membership_subscription_dates(103, current_date, null)`,
    `select * from public.admin_manage_membership(p_membership_id => 103, p_role => 'teacher')`,
  ]
  for (const directCall of authenticatedAdminRpcAttempts) {
    await assert.rejects(
      () => db.query(directCall),
      /permission denied for function/,
      'academy admins must not bypass the Edge service-role orchestration layer',
    )
  }
  assert.equal(
    await scalar(`select role from public.academy_memberships where id = 103`),
    'student',
    'blocked direct calls must not mutate the target membership',
  )
  await db.exec('reset role;')

  await db.exec(`
    set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000003';
    set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000003","email":"student@example.com","role":"authenticated"}';
    set role authenticated;
  `)

  assert.equal(Number(await scalar('select count(*) from public.academies')), 1)
  assert.equal(Number(await scalar('select public.get_my_academy_id_from_jwt()')), 1)
  assert.equal(Number(await scalar('select count(*) from public.academy_memberships')), 1)

  const attempt = await scalar(`select to_jsonb(public.start_ruoe_attempt(2001, null))`)
  assert.equal(attempt.membership_id, 103)
  assert.equal(attempt.attempt_number, 1)

  await db.exec(`
    insert into public.ruoe_user_answers (attempt_id, question_id, user_answer)
    values (${attempt.id}, 2101, 'A'), (${attempt.id}, 2102, 'B');
  `)
  const evaluation = await scalar(`select public.evaluate_ruoe_attempt(${attempt.id})`)
  assert.equal(evaluation.correctCount, 2)
  assert.equal(Number(evaluation.scorePoints), 100)

  assert.equal(Number(await scalar('select count(*) from public.submissions')), 1)
  assert.equal(Number(await scalar('select count(*) from public.evaluations')), 1)
  const timer = await scalar(`
    select to_jsonb(timer_row)
    from public.log_submission_time_spent(
      '00000000-0000-4000-8002-000000000001',
      480,
      statement_timestamp()
    ) timer_row
  `)
  assert.equal(timer.out_time_spent_seconds, 480)

  assert.equal(Number(await scalar('select count(*) from public.speaking_sessions')), 1)
  assert.equal(Number(await scalar('select count(*) from public.speaking_transcripts')), 1)
  const learnerDirectSessionId = await scalar(`
    insert into public.speaking_sessions (
      membership_id, scenario_id, persona_id, use_profile, nuances
    ) values (
      103, 1, 1, false, 'Learner direct DML policy regression.'
    )
    returning id
  `)
  const learnerUpdate = await db.query(`
    update public.speaking_sessions
    set nuances = 'Learner update remains within the active student membership.'
    where id = '${learnerDirectSessionId}'
    returning id
  `)
  assert.equal(learnerUpdate.rows.length, 1)
  const learnerDelete = await db.query(`
    delete from public.speaking_sessions
    where id = '${learnerDirectSessionId}'
    returning id
  `)
  assert.equal(learnerDelete.rows.length, 1)

  const speakingSessionId = await scalar(`
    select public.create_speaking_session(
      1,
      1,
      true,
      'Practise clarifying responsibilities.'
    )
  `)
  assert.match(speakingSessionId, /^[0-9a-f-]{36}$/)

  const nonLearnerActors = [
    {
      userId: '00000000-0000-4000-8000-000000000002',
      email: 'teacher@example.com',
      membershipId: 102,
    },
    {
      userId: '00000000-0000-4000-8000-000000000001',
      email: 'admin@example.com',
      membershipId: 101,
    },
  ]
  for (const actor of nonLearnerActors) {
    await db.exec('reset role;')
    await db.exec(`
      set request.jwt.claim.sub = '${actor.userId}';
      set request.jwt.claims = '{"sub":"${actor.userId}","email":"${actor.email}","role":"authenticated"}';
      set role authenticated;
    `)
    await assert.rejects(
      () => db.query(`select public.create_speaking_session(1, 1, false, null)`),
      /Active student membership required/,
    )
    await assert.rejects(
      () => db.query(`
        insert into public.speaking_sessions (membership_id, scenario_id, persona_id)
        values (${actor.membershipId}, 1, 1)
      `),
      /row-level security policy/,
    )
    const blockedUpdate = await db.query(`
      update public.speaking_sessions
      set nuances = 'Non-learner mutation must not apply.'
      where id = '${speakingSessionId}'
      returning id
    `)
    assert.equal(blockedUpdate.rows.length, 0)
    const blockedDelete = await db.query(`
      delete from public.speaking_sessions
      where id = '${speakingSessionId}'
      returning id
    `)
    assert.equal(blockedDelete.rows.length, 0)
  }

  await db.exec('reset role;')
  await db.exec(`
    set request.jwt.claim.sub = '';
    set request.jwt.claims = '{}';
    set role service_role;
  `)

  const event = await scalar(`
    select to_jsonb(event_row)
    from public.enqueue_event_outbox(
      'database_smoke',
      '{"request_id":"00000000-0000-4000-8003-000000000001"}'::jsonb
    ) event_row
  `)
  assert.equal(event.event_type, 'database_smoke')
  await db.exec('reset role;')
  assert.equal(Number(await scalar(`select count(*) from private.event_outbox`)), 1)
  await db.exec(`set role service_role;`)

  await db.exec(`
    insert into public.academy_memberships (
      id, academy_id, user_id, email, role, status
    ) values (
      104, 1, null, 'legacy-alias@example.com', 'student', 'awaiting_login'
    );
  `)
  const aliasConflict = await scalar(`
    select to_jsonb(conflict_row)
    from public.upsert_membership_alias_conflict(
      null,
      104,
      'corrected-alias@example.com',
      'legacy-alias@example.com',
      '00000000-0000-4000-8003-000000000002',
      '{"source":"database-smoke"}'::jsonb
    ) conflict_row
  `)
  assert.equal(aliasConflict.membership_id, 104)
  assert.equal(aliasConflict.email_login, 'corrected-alias@example.com')

  const resolvedAlias = await scalar(`
    select to_jsonb(alias_row)
    from public.resolve_membership_alias(
      '00000000-0000-4000-8000-000000000001',
      1,
      false,
      104,
      'corrected-alias@example.com',
      'verified in local smoke test',
      '00000000-0000-4000-8003-000000000003'
    ) alias_row
  `)
  assert.equal(resolvedAlias.email_normalized, 'corrected-alias@example.com')
  const resolvedAliasRetry = await scalar(`
    select to_jsonb(alias_row)
    from public.resolve_membership_alias(
      '00000000-0000-4000-8000-000000000001',
      1,
      false,
      104,
      'corrected-alias@example.com',
      'verified in local smoke test',
      '00000000-0000-4000-8003-000000000003'
    ) alias_row
  `)
  assert.equal(resolvedAliasRetry.request_id, resolvedAlias.request_id)
  assert.equal(
    await scalar(`select email from public.academy_memberships where id = 104`),
    'corrected-alias@example.com',
  )
  assert.equal(
    Number(await scalar(`
      select count(*)
      from public.list_open_membership_alias_conflicts(array[104]::bigint[])
    `)),
    0,
  )

  await scalar(`
    select to_jsonb(conflict_row)
    from public.upsert_membership_alias_conflict(
      null,
      104,
      'corrected-alias@example.com',
      'legacy-alias@example.com',
      '00000000-0000-4000-8003-000000000002',
      '{"source":"database-smoke-retry"}'::jsonb
    ) conflict_row
  `)
  assert.equal(
    Number(await scalar(`
      select count(*)
      from public.list_open_membership_alias_conflicts(array[104]::bigint[])
    `)),
    1,
  )

  await db.query(
    `select public.save_evaluation_and_update_submission($1, $2, $3::jsonb, $4)`,
    [
      '00000000-0000-4000-8002-000000000001',
      '78',
      JSON.stringify({
        task_fulfilment: 3,
        organisation: 3,
        language_range: 3,
        language_control: 3,
      }),
      'Clear response with a practical next step.',
    ],
  )
  await db.query(
    `select public.save_speaking_transcript($1, $2::jsonb)`,
    [
      speakingSessionId,
      JSON.stringify({
        full_text: 'Student: Could you clarify the first task?',
        turns: [
          {
            speaker: 'user',
            start_ms: 0,
            end_ms: 2200,
            text: 'Could you clarify the first task?',
            filler_count: 0,
            wpm: 105,
          },
        ],
      }),
    ],
  )
  assert.equal(
    await scalar(`select status from public.speaking_sessions where id = '${speakingSessionId}'`),
    'completed',
  )
  assert.equal(
    Number(await scalar(`select count(*) from public.speaking_turns where session_id = '${speakingSessionId}'`)),
    1,
  )

  const migratedRole = await scalar(`
    select to_jsonb(role_row)
    from public.migrate_membership_role(
      '00000000-0000-4000-8000-000000000001',
      1,
      false,
      103,
      'teacher',
      'database smoke test',
      '00000000-0000-4000-8003-000000000004'
    ) role_row
  `)
  assert.equal(migratedRole.old_role, 'student')
  assert.equal(migratedRole.new_role, 'teacher')
  assert.equal(migratedRole.cleaned_records.student_profiles_archived, 1)
  assert.equal(migratedRole.cleaned_records.class_memberships_removed, 1)
  const migratedRoleRetry = await scalar(`
    select to_jsonb(role_row)
    from public.migrate_membership_role(
      '00000000-0000-4000-8000-000000000001',
      1,
      false,
      103,
      'teacher',
      'database smoke test',
      '00000000-0000-4000-8003-000000000004'
    ) role_row
  `)
  assert.deepEqual(migratedRoleRetry, migratedRole)
  await db.exec('reset role;')
  assert.equal(Number(await scalar(`select count(*) from private.membership_role_audit`)), 1)
  assert.equal(Number(await scalar(`select count(*) from public.student_profiles where membership_id = 103`)), 0)
  await db.exec(`set role service_role;`)

  await db.exec('reset role;')
  await db.exec(`
    select setval(
      pg_get_serial_sequence('public.academy_memberships', 'id'),
      (select max(id) from public.academy_memberships)
    );
  `)
  await db.exec('set role service_role;')

  const unclaimedInvite = await scalar(`
    select to_jsonb(invite_row)
    from public.admin_prepare_membership_invite(
      1,
      'unclaimed-runtime@example.com',
      'student'
    ) invite_row
  `)
  assert.equal(unclaimedInvite.user_id, null)
  assert.equal(unclaimedInvite.status, 'awaiting_login')

  const unclaimedDates = await scalar(`
    select to_jsonb(updated_row)
    from public.update_membership_subscription_dates(
      p_membership_id => ${unclaimedInvite.id},
      p_subscription_start_date => date '2026-09-01',
      p_subscription_end_date => date '2027-02-28',
      p_request_id => '00000000-0000-4000-8003-000000000007'
    ) updated_row
  `)
  assert.equal(unclaimedDates.user_id, null)
  assert.equal(unclaimedDates.metadata_payload, null)
  assert.deepEqual(unclaimedDates.metadata_targets, [])
  assert.equal(unclaimedDates.should_refresh_session, false)
  assert.equal(unclaimedDates.request_id, '00000000-0000-4000-8003-000000000007')
  assert.equal(unclaimedDates.subscription_start_date, '2026-09-01')
  assert.equal(unclaimedDates.subscription_end_date, '2027-02-28')

  const unclaimedRole = await scalar(`
    select to_jsonb(role_row)
    from public.migrate_membership_role(
      '00000000-0000-4000-8000-000000000001',
      1,
      false,
      ${unclaimedInvite.id},
      'teacher',
      'unclaimed database regression',
      '00000000-0000-4000-8003-000000000008'
    ) role_row
  `)
  assert.equal(unclaimedRole.old_role, 'student')
  assert.equal(unclaimedRole.new_role, 'teacher')
  assert.equal(unclaimedRole.metadata_payload, null)
  assert.equal(unclaimedRole.should_refresh_session, false)
  assert.equal(unclaimedRole.request_id, '00000000-0000-4000-8003-000000000008')
  const unclaimedRoleRetry = await scalar(`
    select to_jsonb(role_row)
    from public.migrate_membership_role(
      '00000000-0000-4000-8000-000000000001',
      1,
      false,
      ${unclaimedInvite.id},
      'teacher',
      'unclaimed database regression',
      '00000000-0000-4000-8003-000000000008'
    ) role_row
  `)
  assert.deepEqual(unclaimedRoleRetry, unclaimedRole)

  const profileUpdate = await scalar(`
    select to_jsonb(updated_row)
    from public.update_profile_membership_data(
      p_membership_id => 102,
      p_role => 'teacher',
      p_request_id => '00000000-0000-4000-8003-000000000006'
    ) updated_row
  `)
  assert.equal(profileUpdate.id, 102)
  assert.equal(profileUpdate.role, 'teacher')

  const resetMembership = await scalar(`
    select to_jsonb(managed_row)
    from public.admin_manage_membership(
      p_membership_id => 102,
      p_clear_user => true,
      p_allow_active_clear => true,
      p_status => 'awaiting_login',
      p_request_id => '00000000-0000-4000-8003-000000000005'
    ) managed_row
  `)
  assert.equal(resetMembership.user_id, null)
  assert.equal(resetMembership.status, 'awaiting_login')
  assert.equal(resetMembership.metadata_targets.length, 1)
  assert.equal(
    resetMembership.metadata_targets[0].user_id,
    '00000000-0000-4000-8000-000000000002',
  )
  assert.equal(
    resetMembership.metadata_targets[0].request_id,
    '00000000-0000-4000-8003-000000000005',
  )
  assert.equal(typeof resetMembership.metadata_targets[0].metadata_payload, 'object')
  await db.exec('reset role;')
  assert.equal(Number(await scalar(`select count(*) from auth.users`)), 3)
  await db.exec('set role service_role;')

  await assert.rejects(
    () => db.query(`
      select *
      from public.admin_manage_membership(
        p_membership_id => 102,
        p_delete_auth_user => true
      )
    `),
    /AUTH_USER_DELETE_UNSUPPORTED/,
  )

  await db.exec('reset role;')
  assert.ok(
    Number(await scalar(`
      select count(*)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
    `)) >= 35,
    'expected the complete RPC and helper surface',
  )
  assert.ok(
    Number(await scalar(`
      select count(*)
      from pg_policy pol
      join pg_class c on c.oid = pol.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
    `)) >= 40,
    'expected broad RLS coverage',
  )

  console.log(`Database checks passed (${migrationFiles.length} migrations x2, seed x2, RLS and RPC smoke test).`)
} finally {
  await db.close()
}
