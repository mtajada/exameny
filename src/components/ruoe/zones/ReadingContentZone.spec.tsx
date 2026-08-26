import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReadingContentZone } from './ReadingContentZone';
import { ExerciseData } from '@/types/ruoe';

describe('ReadingContentZone', () => {
  const buildExerciseData = (options: Array<Partial<ExerciseData['options'][number]>>): ExerciseData => ({
    exercise: {
      id: 1,
      academy_id: 1,
      author_id: null,
      content_text: '',
      created_at: new Date().toISOString(),
      is_public: false,
      task_type_id: 1,
      title: 'Sample',
      updated_at: new Date().toISOString(),
      teacher_theme: null,
      teacher_skill_focus: null,
    },
    questions: [],
    options: options.map((option, index) => ({
      id: index + 1,
      feedback: null,
      is_correct: false,
      option_letter: 'A',
      option_text: '',
      question_id: index + 1,
      ...option,
    })) as ExerciseData['options'],
    taskType: {
      id: 1,
      name: 'B2 Reading Part 7',
      description: null,
      exam_type_id: 1,
      level_id: 1,
      task_code: 'B2_READ_MULTIPLE_MATCHING',
      created_at: new Date().toISOString(),
      default_time_minutes: null,
    },
    displayOrderByQuestionId: {},
  });

  const buildGappedExerciseData = (): ExerciseData => ({
    exercise: {
      id: 2,
      academy_id: 1,
      author_id: null,
      content_text: '',
      created_at: new Date().toISOString(),
      is_public: false,
      task_type_id: 2,
      title: 'Sample',
      updated_at: new Date().toISOString(),
      teacher_theme: null,
      teacher_skill_focus: null,
    },
    questions: [
      {
        id: 101,
        exercise_id: 2,
        order: 1,
        displayOrder: 1,
        question_text: null,
        correct_answers: [],
        explanation: null,
        original_sentence: null,
        transformation_sentence: null,
      },
    ],
    options: [
      {
        id: 201,
        feedback: null,
        is_correct: false,
        option_letter: 'A',
        option_text: '<img src=x onerror="alert(1)">',
        question_id: 101,
      },
    ],
    taskType: {
      id: 2,
      name: 'B2 Reading Part 6',
      description: null,
      exam_type_id: 1,
      level_id: 1,
      task_code: 'B2_READ_GAPPED_TEXT',
      created_at: new Date().toISOString(),
      default_time_minutes: null,
    },
    displayOrderByQuestionId: {
      101: 1,
    },
  });

  it('escapes synthesized multiple matching sections before rendering', () => {
    const exerciseData = buildExerciseData([
      {
        option_letter: 'A',
        option_text: '<img src=x onerror="alert(1)">',
      },
    ]);

    const markup = renderToStaticMarkup(
      <ReadingContentZone
        title="Sample"
        content=""
        taskType="B2_READ_MULTIPLE_MATCHING"
        isEvaluated={false}
        exerciseData={exerciseData}
      />,
    );

    expect(markup).toContain('Section A');
    expect(markup).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(markup).not.toContain('<img src=x onerror="alert(1)">');
  });

  it('renders gapped text replacements with escaped option text', () => {
    const exerciseData = buildGappedExerciseData();

    const markup = renderToStaticMarkup(
      <ReadingContentZone
        title="Sample"
        content="This is {{GAP_1}}."
        taskType="B2_READ_GAPPED_TEXT"
        isEvaluated={false}
        exerciseData={exerciseData}
        userAnswers={{ 101: 'A' }}
      />,
    );

    expect(markup).toContain('gap-inserted');
    expect(markup).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(markup).not.toContain('<img src=x onerror="alert(1)">');
  });
});
