begin;

insert into auth.users (
  id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'admin@example.com', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Alex Admin"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'teacher@example.com', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Taylor Teacher"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'student@example.com', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Sam Student"}'::jsonb, now(), now()
  )
on conflict (id) do update set
  email = excluded.email,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = excluded.updated_at;

insert into public.academies (id, name)
values (1, 'Open Learning Lab')
on conflict (id) do update set name = excluded.name;

insert into public.levels (id, code, name) values
  (1, 'B1', 'Intermediate'),
  (2, 'B2', 'Upper intermediate'),
  (3, 'C1', 'Advanced'),
  (4, 'C2', 'Proficient')
on conflict (id) do update set code = excluded.code, name = excluded.name;

insert into public.exam_types (id, code, name, description, max_score)
values (
  1,
  'GENERAL_ENGLISH',
  'General English practice',
  'Independent practice mapped to broad language competencies.',
  100
)
on conflict (id) do update set
  code = excluded.code,
  name = excluded.name,
  description = excluded.description,
  max_score = excluded.max_score;

insert into public.evaluation_criteria (id, criterion_code, name, description) values
  (1, 'TASK_FULFILMENT', 'Task fulfilment', 'How fully the response addresses its purpose and audience.'),
  (2, 'ORGANISATION', 'Organisation', 'How clearly ideas are sequenced and connected.'),
  (3, 'LANGUAGE_RANGE', 'Language range', 'Breadth and suitability of vocabulary and structures.'),
  (4, 'LANGUAGE_CONTROL', 'Language control', 'Accuracy and clarity across the response.')
on conflict (id) do update set
  criterion_code = excluded.criterion_code,
  name = excluded.name,
  description = excluded.description;

insert into public.exam_task_types (
  id, exam_type_id, level_id, task_code, name, description, default_time_minutes
) values
  (
    1001, 1, 2, 'GENERAL_WRITING_PROPOSAL', 'Community proposal',
    'Write a practical proposal for a local audience.', 40
  ),
  (
    1002, 1, 2, 'GENERAL_READING_GAPPED_TEXT', 'Gapped text',
    'Restore missing sentences using cohesion and meaning.', 20
  )
on conflict (id) do update set
  exam_type_id = excluded.exam_type_id,
  level_id = excluded.level_id,
  task_code = excluded.task_code,
  name = excluded.name,
  description = excluded.description,
  default_time_minutes = excluded.default_time_minutes;

insert into public.task_criteria_link (id, task_type_id, criterion_id) values
  (1, 1001, 1), (2, 1001, 2), (3, 1001, 3), (4, 1001, 4)
on conflict (id) do update set
  task_type_id = excluded.task_type_id,
  criterion_id = excluded.criterion_id;

insert into public.band_descriptors (
  id, criterion_id, exam_type_id, level_id, score, descriptor_text
) values
  (1, 1, 1, 2, 3, 'Addresses the main purpose and gives relevant support.'),
  (2, 2, 1, 2, 3, 'Uses clear paragraphs and mostly logical connections.'),
  (3, 3, 1, 2, 3, 'Uses enough varied language for the topic and audience.'),
  (4, 4, 1, 2, 3, 'Maintains clarity despite occasional language errors.')
on conflict (id) do update set descriptor_text = excluded.descriptor_text;

insert into public.profiles (id, email, full_name) values
  ('00000000-0000-4000-8000-000000000001', 'admin@example.com', 'Alex Admin'),
  ('00000000-0000-4000-8000-000000000002', 'teacher@example.com', 'Taylor Teacher'),
  ('00000000-0000-4000-8000-000000000003', 'student@example.com', 'Sam Student')
on conflict (id) do update set
  email = excluded.email,
  full_name = excluded.full_name;

insert into public.academy_memberships (
  id, academy_id, user_id, email, role, status,
  subscription_start_date, subscription_end_date
) values
  (
    101, 1, '00000000-0000-4000-8000-000000000001',
    'admin@example.com', 'academy_admin', 'active', current_date, current_date + 365
  ),
  (
    102, 1, '00000000-0000-4000-8000-000000000002',
    'teacher@example.com', 'teacher', 'active', current_date, current_date + 365
  ),
  (
    103, 1, '00000000-0000-4000-8000-000000000003',
    'student@example.com', 'student', 'active', current_date, current_date + 365
  )
on conflict (id) do update set
  academy_id = excluded.academy_id,
  user_id = excluded.user_id,
  email = excluded.email,
  role = excluded.role,
  status = excluded.status,
  subscription_start_date = excluded.subscription_start_date,
  subscription_end_date = excluded.subscription_end_date;

insert into public.user_preferences (
  user_id, full_name, target_exam_id, target_level_id,
  active_academy_id, is_initial_setup_completed
) values
  ('00000000-0000-4000-8000-000000000001', 'Alex Admin', null, null, 1, true),
  ('00000000-0000-4000-8000-000000000002', 'Taylor Teacher', null, null, 1, true),
  ('00000000-0000-4000-8000-000000000003', 'Sam Student', 1, 2, 1, true)
on conflict (user_id) do update set
  full_name = excluded.full_name,
  target_exam_id = excluded.target_exam_id,
  target_level_id = excluded.target_level_id,
  active_academy_id = excluded.active_academy_id,
  is_initial_setup_completed = excluded.is_initial_setup_completed;

insert into public.student_profiles (
  membership_id, user_id, target_exam_id, target_level_id, assigned_teacher_id
) values (
  103,
  '00000000-0000-4000-8000-000000000003',
  1,
  2,
  '00000000-0000-4000-8000-000000000002'
)
on conflict (membership_id) do update set
  target_exam_id = excluded.target_exam_id,
  target_level_id = excluded.target_level_id,
  assigned_teacher_id = excluded.assigned_teacher_id;

insert into public.classes (id, academy_id, name, description)
values (1, 1, 'Demo Class', 'Synthetic class for local development.')
on conflict (id) do update set name = excluded.name, description = excluded.description;

insert into public.class_members (class_id, membership_id) values
  (1, 102),
  (1, 103)
on conflict (class_id, membership_id) do nothing;

insert into public.error_categories (id, code, name, description) values
  (1, 'GRAMMAR', 'Grammar', 'Form and structure issues that affect clarity.'),
  (2, 'LEXIS', 'Lexis', 'Word choice and phrase combination issues.'),
  (3, 'COHESION', 'Cohesion', 'Connections and progression between ideas.'),
  (4, 'TASK', 'Task', 'Coverage, genre and audience requirements.')
on conflict (id) do update set
  code = excluded.code,
  name = excluded.name,
  description = excluded.description;

insert into public.error_tags (id, category_id, code, name, description, skills) values
  (1, 1, 'VERB_FORM', 'Verb form', 'A verb form does not fit the sentence.', array['B1', 'B2', 'C1']),
  (2, 2, 'WORD_CHOICE', 'Word choice', 'A word does not express the intended meaning.', array['B1', 'B2', 'C1']),
  (3, 3, 'LINKING', 'Linking', 'The connection between ideas is unclear.', array['B1', 'B2', 'C1']),
  (4, 4, 'COVERAGE', 'Coverage', 'An important part of the task is missing.', array['B1', 'B2', 'C1'])
on conflict (id) do update set
  category_id = excluded.category_id,
  code = excluded.code,
  name = excluded.name,
  description = excluded.description,
  skills = excluded.skills;

insert into public.ruoe_exercises (
  id, task_type_id, academy_id, author_id, title, content_text,
  teacher_theme, teacher_skill_focus, is_public
) values (
  2001,
  1002,
  1,
  '00000000-0000-4000-8000-000000000002',
  'The shared garden',
  'A neighbourhood group turned an unused courtyard into a shared garden. (1)_____ The volunteers now meet every Saturday to care for the plants and plan small workshops. (2)_____',
  'Community projects',
  'Cohesion and reference',
  false
)
on conflict (id) do update set
  title = excluded.title,
  content_text = excluded.content_text,
  teacher_theme = excluded.teacher_theme,
  teacher_skill_focus = excluded.teacher_skill_focus;

insert into public.ruoe_questions (
  id, exercise_id, "order", question_text, correct_answers, explanation
) values
  (
    2101, 2001, 1, 'Choose the sentence that introduces the first result.',
    array['A'], 'The option links the initial action with its immediate result.'
  ),
  (
    2102, 2001, 2, 'Choose the sentence that closes the report.',
    array['B'], 'The option summarises the wider benefit of the project.'
  )
on conflict (id) do update set
  question_text = excluded.question_text,
  correct_answers = excluded.correct_answers,
  explanation = excluded.explanation;

insert into public.ruoe_options (
  id, question_id, option_letter, option_text, is_correct, feedback
) values
  (2201, 2101, 'A', 'Within a month, residents had built raised beds and collected donated tools.', true, 'This follows the timeline and introduces a concrete result.'),
  (2202, 2101, 'B', 'The final workshop will take place next winter.', false, 'This jumps ahead and does not introduce the project.'),
  (2203, 2102, 'A', 'One volunteer prefers tomatoes to herbs.', false, 'This detail is too narrow for the conclusion.'),
  (2204, 2102, 'B', 'The space has become both a garden and a place for neighbours to learn together.', true, 'This summarises the broader outcome.')
on conflict (id) do update set
  option_text = excluded.option_text,
  is_correct = excluded.is_correct,
  feedback = excluded.feedback;

insert into public.assigned_prompts (
  id, teacher_id, student_membership_id, student_id, task_type_id,
  prompt_text, status
) values (
  '00000000-0000-4000-8001-000000000001',
  '00000000-0000-4000-8000-000000000002',
  103,
  '00000000-0000-4000-8000-000000000003',
  1001,
  'Write a proposal for a quiet study area in a community centre. Explain the need, suggest two practical features and describe how volunteers could help.',
  'submitted'
)
on conflict (id) do update set
  prompt_text = excluded.prompt_text,
  status = excluded.status;

insert into public.submissions (
  id, student_membership_id, student_id, task_type_id, assigned_prompt_id,
  submission_text, word_count, time_spent_seconds, status, writing_mode, submitted_at
) values (
  '00000000-0000-4000-8002-000000000001',
  103,
  '00000000-0000-4000-8000-000000000003',
  1001,
  '00000000-0000-4000-8001-000000000001',
  'The centre could reserve one bright room for quiet study. Long tables and adjustable lamps would make the space useful for different learners. Volunteers could organise a weekly timetable and keep a small shelf of donated reference books.',
  39,
  420,
  'evaluated',
  'practice',
  now()
)
on conflict (id) do update set
  submission_text = excluded.submission_text,
  word_count = excluded.word_count,
  time_spent_seconds = excluded.time_spent_seconds,
  status = excluded.status;

insert into public.evaluations (
  id, submission_id, status, ai_overall_score, ai_criteria_evaluation,
  ai_overall_commentary, ai_mistakes_status, evaluation_completed_at
) values (
  '00000000-0000-4000-8003-000000000001',
  '00000000-0000-4000-8002-000000000001',
  'ai_evaluated',
  '76',
  '{"task_fulfilment":3,"organisation":3,"language_range":3,"language_control":3}'::jsonb,
  'The proposal is clear and practical. A stronger closing sentence would make the recommendation more persuasive.',
  'completed',
  now()
)
on conflict (id) do update set
  ai_overall_score = excluded.ai_overall_score,
  ai_criteria_evaluation = excluded.ai_criteria_evaluation,
  ai_overall_commentary = excluded.ai_overall_commentary,
  ai_mistakes_status = excluded.ai_mistakes_status;

insert into public.professional_profiles (
  user_id, industry, role_title, responsibilities, main_goal
) values (
  '00000000-0000-4000-8000-000000000003',
  'Community services',
  'Project assistant',
  array['Prepare updates', 'Coordinate volunteers'],
  'Speak more confidently in planning meetings.'
)
on conflict (user_id) do update set
  industry = excluded.industry,
  role_title = excluded.role_title,
  responsibilities = excluded.responsibilities,
  main_goal = excluded.main_goal;

insert into public.speaking_personas (
  id, name, accent, gender, voice_id, default_prompt, is_active
) values (
  1,
  'Morgan',
  'neutral',
  'nonbinary',
  'local-demo-voice',
  'Act as a supportive conversation partner. Ask one clear question at a time and give concise feedback.',
  true
)
on conflict (id) do update set
  name = excluded.name,
  accent = excluded.accent,
  gender = excluded.gender,
  voice_id = excluded.voice_id,
  default_prompt = excluded.default_prompt,
  is_active = excluded.is_active;

insert into public.speaking_scenarios (
  id, category, title, description_md, default_persona_id, created_by_membership_id
) values (
  1,
  'Collaboration',
  'Plan a community event',
  'Agree on a goal, divide three tasks and decide how to invite local participants.',
  1,
  null
)
on conflict (id) do update set
  category = excluded.category,
  title = excluded.title,
  description_md = excluded.description_md,
  default_persona_id = excluded.default_persona_id;

insert into public.speaking_sessions (
  id, membership_id, scenario_id, persona_id, use_profile, nuances, status
) values (
  '00000000-0000-4000-8004-000000000001',
  103,
  1,
  1,
  true,
  'Practise suggesting alternatives politely.',
  'completed'
)
on conflict (id) do update set
  membership_id = excluded.membership_id,
  scenario_id = excluded.scenario_id,
  persona_id = excluded.persona_id,
  use_profile = excluded.use_profile,
  nuances = excluded.nuances,
  status = excluded.status;

insert into public.speaking_transcripts (session_id, full_text, raw_json)
values (
  '00000000-0000-4000-8004-000000000001',
  'Student: We could hold the event on Saturday. Agent: That sounds practical. What would be the first task?',
  '{"source":"synthetic","turn_count":2}'::jsonb
)
on conflict (session_id) do update set
  full_text = excluded.full_text,
  raw_json = excluded.raw_json;

insert into public.speaking_turns (
  id, session_id, speaker, start_ms, end_ms, text, filler_count, wpm, raw_json
) values
  (
    1, '00000000-0000-4000-8004-000000000001', 'user',
    0, 3200, 'We could hold the event on Saturday.', 0, 112, '{"source":"synthetic"}'::jsonb
  ),
  (
    2, '00000000-0000-4000-8004-000000000001', 'agent',
    3400, 6900, 'That sounds practical. What would be the first task?', 0, 118, '{"source":"synthetic"}'::jsonb
  )
on conflict (id) do update set
  text = excluded.text,
  start_ms = excluded.start_ms,
  end_ms = excluded.end_ms,
  filler_count = excluded.filler_count,
  wpm = excluded.wpm,
  raw_json = excluded.raw_json;

do $$
declare
  v_table text;
  v_sequence text;
  v_max bigint;
begin
  foreach v_table in array array[
    'academies', 'levels', 'exam_types', 'evaluation_criteria',
    'academy_memberships', 'classes', 'exam_task_types', 'task_criteria_link',
    'band_descriptors', 'error_categories', 'error_tags', 'ruoe_exercises',
    'ruoe_questions', 'ruoe_options', 'speaking_personas', 'speaking_scenarios',
    'speaking_turns'
  ]
  loop
    v_sequence := pg_get_serial_sequence('public.' || v_table, 'id');
    if v_sequence is not null then
      execute format('select coalesce(max(id), 1) from public.%I', v_table) into v_max;
      perform setval(v_sequence, greatest(v_max, 1), true);
    end if;
  end loop;
end;
$$;

commit;
