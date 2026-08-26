import { supabase } from '@/integrations/supabase/client'
import { ExerciseData } from '@/types/ruoe'
import { buildDisplayOrder } from '@/utils/ruoe-question-order'

export async function fetchExercisePreview(exerciseId: number): Promise<ExerciseData> {
  const { data, error } = await supabase
    .from('ruoe_exercises')
    .select(`
      *,
      ruoe_questions (*, ruoe_options (*)),
      exam_task_types (*)
    `)
    .eq('id', exerciseId)
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to load exercise preview.')
  }

  const questions = (data.ruoe_questions ?? []) as Array<{
    id: number
    exercise_id: number
    order: number
    question_text: string
    correct_answers: string[]
    explanation: string | null
    original_sentence?: string | null
    transformation_sentence?: string | null
    ruoe_options?: Array<{
      id: number
      question_id: number
      option_letter: string
      option_text: string
      is_correct: boolean
      feedback: string | null
    }>
  }>

  const options: ExerciseData['options'] = []
  questions.forEach((question) => {
    question.ruoe_options?.forEach((option) => {
      options.push({
        id: option.id,
        question_id: option.question_id,
        option_letter: option.option_letter,
        option_text: option.option_text,
        is_correct: option.is_correct,
        feedback: option.feedback,
      })
    })
  })

  options.sort((a, b) => {
    if (a.question_id !== b.question_id) return a.question_id - b.question_id
    return a.option_letter.localeCompare(b.option_letter)
  })

  const baseQuestions = questions.map((question) => ({
    id: question.id,
    exercise_id: question.exercise_id,
    order: question.order,
    question_text: question.question_text,
    correct_answers: question.correct_answers,
    explanation: question.explanation ?? '',
    original_sentence: question.original_sentence ?? null,
    transformation_sentence: question.transformation_sentence ?? null,
  }))

  const { ordered: orderedQuestions, lookup: displayOrderByQuestionId } = buildDisplayOrder(baseQuestions)

  return {
    exercise: {
      id: data.id,
      task_type_id: data.task_type_id,
      academy_id: data.academy_id,
      author_id: data.author_id,
      title: data.title,
      content_text: data.content_text,
      is_public: data.is_public,
      created_at: data.created_at,
      updated_at: data.updated_at,
      teacher_theme: data.teacher_theme ?? null,
      teacher_skill_focus: data.teacher_skill_focus ?? null,
    },
    questions: orderedQuestions,
    options,
    taskType: data.exam_task_types,
    displayOrderByQuestionId,
  }
}
