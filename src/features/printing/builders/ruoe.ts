import { getRuoELayoutKey, type RuoELayoutKey } from '@/config/ruoeFunctionMap.ts'
import type {
  BuildRuoEDocumentParams,
  ExerciseDataShape,
  PrintableDocument,
  PrintableDocumentMetadata,
  PrintableOrientation,
  PrintableParagraph,
  PrintablePage,
  PrintablePageRole,
  PrintableQuestion,
  PrintableQuestionOption,
  PrintableQuestionSection,
  PrintableSection,
  PrintableSubText,
  PrintableTableColumn,
  PrintableTableRow,
} from '../types.ts'
import { splitTextIntoParagraphs } from '../utils/text.ts'
import { buildTransformationContext } from '@/utils/ruoe-transformation.ts'

const CROSS_TEXT_SECTION_REGEX = /Text\s+([A-Z])(?:\s*[-–:]\s*([^\n]+))?\s*(?:\n+)([\s\S]*?)(?=\nText\s+[A-Z]\b|$)/gi

interface RuoEVariantBuilderContext {
  metadata: PrintableDocumentMetadata
  summary: BuildRuoEDocumentParams['summary']
  exerciseData: ExerciseDataShape
  makePageId: () => string
}

interface RuoEVariantBuilderResult {
  studentPages: PrintablePage[]
  answerKeyPages: PrintablePage[]
  includeAnswerKeyByDefault?: boolean
}

type RuoEClozeLayoutKey = Extract<
  RuoELayoutKey,
  'ruoe-mc-cloze' | 'ruoe-open-cloze' | 'ruoe-word-formation' | 'ruoe-keyword-transformation'
>

const MULTIPLE_MATCHING_REUSE: Record<string, boolean> = {
  B1_READ_MULTIPLE_MATCHING: true,
  B2_READ_MULTIPLE_MATCHING: true,
  C1_READ_MULTIPLE_MATCHING: true,
  C2_READ_MULTIPLE_MATCHING: true,
}

const createIdFactory = (prefix: string) => {
  let counter = 0
  return () => {
    counter += 1
    return `${prefix}-${counter}`
  }
}

const formatGapLabel = (index: number) => `Gap ${index}`

const formatQuestionLabel = (index: number) => `Question ${index}`

const getDisplayOrder = (exerciseData: ExerciseDataShape, questionId: number) =>
  exerciseData.displayOrderByQuestionId[questionId] ?? 0

const groupOptionsByQuestionId = (exerciseData: ExerciseDataShape) => {
  const map = new Map<number, PrintableQuestionOption[]>()
  exerciseData.options.forEach((option) => {
    if (!map.has(option.question_id)) {
      map.set(option.question_id, [])
    }
    const entry = map.get(option.question_id)!
    entry.push({ label: option.option_letter, text: option.option_text })
  })
  return map
}

const formatAnswerValue = (answers: string[]): string => {
  const unique = Array.from(new Set(answers.map((answer) => answer.trim()))).filter(Boolean)
  return unique.join(' / ')
}

const createTableRow = (values: Array<string>): PrintableTableRow => ({
  cells: values.map((value) => ({ value })),
})

const sanitizeContentText = (content: string | null | undefined): string => content?.trim() ?? ''

const replaceGapPlaceholders = (text: string, replacements: Record<string, string>): string =>
  text.replace(/{{(GAP_\d+)}}/g, (match, group) => replacements[group] ?? match)

const QUESTION_PAGE_LIMIT: Record<'single-column' | 'two-column', number> = {
  'single-column': 9,
  'two-column': 17,
}

const paginateQuestionSection = (section: PrintableQuestionSection): PrintableSection[] => {
  const layout = section.layout ?? 'single-column'
  const limit = QUESTION_PAGE_LIMIT[layout]
  if (section.questions.length <= limit) {
    return [section]
  }

  const result: PrintableSection[] = []
  const baseHeading = section.heading ?? null

  for (let index = 0; index < section.questions.length; index += limit) {
    const chunk = section.questions.slice(index, index + limit)
    if (index > 0) {
      result.push({ type: 'page-break' })
    }

    result.push({
      ...section,
      heading: index > 0 && baseHeading ? `${baseHeading} (continued)` : section.heading,
      questions: chunk,
    })
  }

  return result
}

const splitSectionsByPageBreak = (sections: PrintableSection[]): PrintableSection[][] => {
  const groups: PrintableSection[][] = []
  let currentGroup: PrintableSection[] = []

  sections.forEach((section) => {
    if (section.type === 'page-break') {
      if (currentGroup.length > 0) {
        groups.push(currentGroup)
        currentGroup = []
      }
      return
    }

    currentGroup.push(section)
  })

  if (currentGroup.length > 0) {
    groups.push(currentGroup)
  }

  return groups
}

const parseCrossTextContent = (content: string | null | undefined): PrintableSubText[] => {
  if (!content) return []

  const normalized = content.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const matches = Array.from(normalized.matchAll(CROSS_TEXT_SECTION_REGEX))
  if (matches.length === 0) {
    return []
  }

  return matches.map((match) => {
    const letter = match[1]?.trim().toUpperCase() ?? ''
    const rawTitle = match[2]?.trim() ?? null
    const body = match[3]?.trim() ?? ''

    return {
      label: letter,
      title: rawTitle || undefined,
      paragraphs: splitTextIntoParagraphs(body),
    }
  })
}

const createPrintablePagesFromSections = ({
  sections,
  role,
  orientation = 'portrait',
  makePageId,
}: {
  sections: PrintableSection[]
  role: PrintablePageRole
  orientation?: PrintableOrientation
  makePageId: () => string
}): PrintablePage[] => {
  if (sections.length === 0) {
    return []
  }

  return splitSectionsByPageBreak(sections).map((group) => ({
    id: makePageId(),
    role,
    orientation,
    sections: group,
  }))
}

const buildClozePages = (ctx: RuoEVariantBuilderContext, layout: RuoEClozeLayoutKey): RuoEVariantBuilderResult => {
  if (layout === 'ruoe-keyword-transformation') {
    return buildKeywordTransformationPages(ctx)
  }

  if (layout === 'ruoe-mc-cloze') {
    return buildMultipleChoiceClozePages(ctx)
  }

  const { metadata, exerciseData, makePageId } = ctx

  const passage = sanitizeContentText(exerciseData.exercise.content_text)
  const optionsByQuestionId = groupOptionsByQuestionId(exerciseData)

  const questions = exerciseData.questions
    .slice()
    .sort((a, b) => getDisplayOrder(exerciseData, a.id) - getDisplayOrder(exerciseData, b.id))
    .map((question, index) => ({
      number: index + 1,
      rootWord: question.question_text ?? '',
      options: (optionsByQuestionId.get(question.id) ?? [])
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label)),
      answer: formatAnswerValue(question.correct_answers),
    }))

  const replacements: Record<string, string> = {}
  questions.forEach((question) => {
    replacements[`GAP_${question.number}`] = `[${question.number}]`
  })

  const studentSections: PrintableSection[] = []

  if (passage) {
    studentSections.push({
      type: 'passage',
      heading: exerciseData.exercise.title ?? undefined,
      highlightGaps: true,
      paragraphs: splitTextIntoParagraphs(replaceGapPlaceholders(passage, replacements)),
    })
  }

  let responseColumns: PrintableTableColumn[]
  let responseRows: PrintableTableRow[]

  switch (layout) {
    case 'ruoe-word-formation':
      responseColumns = [
        { id: 'question', label: 'Question', align: 'center' },
        { id: 'root', label: 'Root Word', align: 'left' },
        { id: 'answer', label: 'Your Answer', align: 'left' },
      ]
      responseRows = questions.map((question) => createTableRow([String(question.number), question.rootWord, '']))
      break
    default:
      responseColumns = [
        { id: 'question', label: 'Question', align: 'center' },
        { id: 'answer', label: 'Your Answer', align: 'left' },
      ]
      responseRows = questions.map((question) => createTableRow([String(question.number), '\u00a0']))
      break
  }

  studentSections.push({
    type: 'table',
    heading: 'Response Sheet',
    columns: responseColumns,
    rows: responseRows,
    variant: 'response',
  })

  let answerColumns: PrintableTableColumn[]
  let answerRows: PrintableTableRow[]

  if (layout === 'ruoe-word-formation') {
    answerColumns = [
      { id: 'question', label: 'Question', align: 'center' },
      { id: 'root', label: 'Root Word', align: 'left' },
      { id: 'answer', label: 'Answer', align: 'left' },
    ]
    answerRows = questions.map((question) => createTableRow([String(question.number), question.rootWord, question.answer]))
  } else {
    answerColumns = [
      { id: 'question', label: 'Question', align: 'center' },
      { id: 'answer', label: 'Answer', align: 'left' },
    ]
    answerRows = questions.map((question) => createTableRow([String(question.number), question.answer]))
  }

  const studentPages: PrintablePage[] = [
    {
      id: makePageId(),
      role: 'student',
      orientation: 'portrait',
      sections: studentSections,
    },
  ]

  const answerKeyPages: PrintablePage[] = [
    {
      id: makePageId(),
      role: 'answer-key',
      orientation: 'portrait',
      sections: [
        {
          type: 'table',
          heading: 'Answer Key',
          columns: answerColumns,
          rows: answerRows,
          variant: 'answer-key',
        },
      ],
    },
  ]

  return { studentPages, answerKeyPages }
}

const buildMultipleChoiceClozePages = ({
  metadata,
  exerciseData,
  makePageId,
}: RuoEVariantBuilderContext): RuoEVariantBuilderResult => {
  const passage = sanitizeContentText(exerciseData.exercise.content_text)
  const optionsByQuestionId = groupOptionsByQuestionId(exerciseData)

  const baseQuestions = exerciseData.questions
    .slice()
    .sort((a, b) => getDisplayOrder(exerciseData, a.id) - getDisplayOrder(exerciseData, b.id))
    .map((question, index) => {
      const normalizedAnswers = new Set(
        (question.correct_answers ?? []).map((answer) => answer.trim().toUpperCase()),
      )

      const options = (optionsByQuestionId.get(question.id) ?? [])
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((option) => {
          const normalizedLabel = option.label.trim().toUpperCase()
          const normalizedText = option.text.trim().toUpperCase()
          const isCorrect =
            normalizedAnswers.has(normalizedLabel) || normalizedAnswers.has(normalizedText)
          return {
            label: option.label,
            text: option.text,
            isCorrect,
          }
        })

      const correctOption = options.find((option) => option.isCorrect)
      const answerLabel = correctOption?.label ?? null
      const answerValue =
        correctOption?.text ??
        (question.correct_answers && question.correct_answers.length > 0
          ? question.correct_answers[0]
          : null)

      return {
        number: index + 1,
        prompt: formatGapLabel(index + 1),
        options,
        answerLabel,
        answerValue,
      }
    })

  const replacements: Record<string, string> = {}
  baseQuestions.forEach((question) => {
    replacements[`GAP_${question.number}`] = `[${question.number}]`
  })

  const studentQuestions = baseQuestions.map((question) => ({
    number: question.number,
    prompt: question.prompt,
    options: question.options.map((option) => ({
      label: option.label,
      text: option.text,
    })),
  }))

  const solutionQuestions = baseQuestions.map((question) => ({
    number: question.number,
    prompt: question.prompt,
    options: question.options,
    answer: question.answerValue ?? undefined,
    answerLabel: question.answerLabel,
  }))

  const studentSections: PrintableSection[] = []

  if (passage) {
    studentSections.push({
      type: 'passage',
      heading: exerciseData.exercise.title ?? undefined,
      highlightGaps: true,
      paragraphs: splitTextIntoParagraphs(replaceGapPlaceholders(passage, replacements)),
    })
  }

  studentSections.push(
    ...paginateQuestionSection({
      type: 'questions',
      heading: 'Multiple-choice options',
      instructions: 'For each gap, choose the correct answer A, B, C or D.',
      layout: 'two-column',
      questions: studentQuestions,
    }),
  )

  const studentPages = createPrintablePagesFromSections({
    sections: studentSections,
    role: 'student',
    orientation: 'portrait',
    makePageId,
  })

  const answerKeySections = paginateQuestionSection({
    type: 'questions',
    heading: 'Answer Key',
    instructions: 'Correct answers are highlighted below.',
    layout: 'two-column',
    variant: 'solution',
    questions: solutionQuestions,
  })

  const answerKeyPages = createPrintablePagesFromSections({
    sections: answerKeySections,
    role: 'answer-key',
    orientation: 'portrait',
    makePageId,
  })

  return { studentPages, answerKeyPages }
}

const buildKeywordTransformationPages = ({ metadata, exerciseData, makePageId }: RuoEVariantBuilderContext): RuoEVariantBuilderResult => {
  const questionLookup = exerciseData.questions
    .slice()
    .sort((a, b) => getDisplayOrder(exerciseData, a.id) - getDisplayOrder(exerciseData, b.id))

  const instructionParagraphs = splitTextIntoParagraphs(sanitizeContentText(exerciseData.exercise.content_text)).filter(
    (paragraph) => !/\bthe gaps are referenced as \{\{GAP_\d+\}\} to \{\{GAP_\d+\}\}\.?/i.test(paragraph.text),
  )

  const studentSections: PrintableSection[] = []

  if (instructionParagraphs.length > 0) {
    studentSections.push({
      type: 'text',
      style: 'instructions',
      paragraphs: instructionParagraphs,
    })
  }

  const transformationQuestions = questionLookup.map((question, index) => {
    const context = buildTransformationContext(question)
    return {
      number: index + 1,
      prompt: context.originalSentence,
      keyWord: context.keyWord,
      originalSentence: context.originalSentence,
      transformationSentence: context.transformationSentence,
      responseLabel: 'Answer:',
      responseVariant: 'single-line' as const,
      answer: formatAnswerValue(question.correct_answers),
    }
  })

  studentSections.push(
    ...paginateQuestionSection({
      type: 'questions',
      questions: transformationQuestions,
    }),
  )

  const answerRows = transformationQuestions.map((question) =>
    createTableRow([String(question.number), question.keyWord, question.answer]),
  )

  const answerColumns: PrintableTableColumn[] = [
    { id: 'question', label: 'Question', align: 'center' },
    { id: 'keyWord', label: 'Key Word', align: 'left' },
    { id: 'answer', label: 'Answer', align: 'left' },
  ]

  const studentPages = createPrintablePagesFromSections({
    sections: studentSections,
    role: 'student',
    orientation: 'portrait',
    makePageId,
  })

  const answerKeySections: PrintableSection[] = [
    {
      type: 'table',
      heading: 'Answer Key',
      columns: answerColumns,
      rows: answerRows,
      variant: 'answer-key',
    },
  ]

  const answerKeyPages = createPrintablePagesFromSections({
    sections: answerKeySections,
    role: 'answer-key',
    orientation: 'portrait',
    makePageId,
  })

  return { studentPages, answerKeyPages }
}

const buildReadingMcqPages = ({ exerciseData, makePageId }: RuoEVariantBuilderContext): RuoEVariantBuilderResult => {
  const passage = sanitizeContentText(exerciseData.exercise.content_text)
  const optionsByQuestionId = groupOptionsByQuestionId(exerciseData)

  const questions: PrintableQuestion[] = exerciseData.questions
    .slice()
    .sort((a, b) => getDisplayOrder(exerciseData, a.id) - getDisplayOrder(exerciseData, b.id))
    .map((question, index) => ({
      number: index + 1,
      prompt: question.question_text ?? '',
      options: (optionsByQuestionId.get(question.id) ?? []).sort((a, b) => a.label.localeCompare(b.label)),
      answer: formatAnswerValue(question.correct_answers),
    }))

  const readingQuestionSections = paginateQuestionSection({
    type: 'questions',
    heading: 'Questions',
    instructions: 'For each question, choose the correct answer A, B, C or D.',
    questions,
  })

  const passageSection: PrintableSection | null = passage
    ? {
        type: 'passage',
        heading: exerciseData.exercise.title ?? undefined,
        paragraphs: splitTextIntoParagraphs(passage),
      }
    : null

  const questionPages = createPrintablePagesFromSections({
    sections: readingQuestionSections,
    role: 'student',
    orientation: 'portrait',
    makePageId,
  })

  const studentPages: PrintablePage[] = []

  if (passageSection) {
    studentPages.push({
      id: makePageId(),
      role: 'student',
      orientation: 'portrait',
      sections: [passageSection],
    })
  }

  studentPages.push(...questionPages)

  const answerKeyRows = questions.map((question) => createTableRow([String(question.number), question.answer as string]))

  const answerKeyPages: PrintablePage[] = [
    {
      id: makePageId(),
      role: 'answer-key',
      orientation: 'portrait',
      sections: [
        {
          type: 'table',
          heading: 'Answer Key',
          columns: [
            { id: 'question', label: 'Question', align: 'center' },
            { id: 'answer', label: 'Answer', align: 'center' },
          ],
          rows: answerKeyRows,
          variant: 'answer-key',
        },
      ],
    },
  ]

  return { studentPages, answerKeyPages }
}

const buildGappedTextPages = ({ exerciseData, makePageId }: RuoEVariantBuilderContext): RuoEVariantBuilderResult => {
  const passage = sanitizeContentText(exerciseData.exercise.content_text)
  const questions = exerciseData.questions
    .slice()
    .sort((a, b) => getDisplayOrder(exerciseData, a.id) - getDisplayOrder(exerciseData, b.id))
    .map((question, index) => ({
      number: index + 1,
      placeholder: question.question_text ?? '',
      answer: formatAnswerValue(question.correct_answers),
    }))

  const replacements: Record<string, string> = {}
  questions.forEach((question) => {
    replacements[`GAP_${question.number}`] = `[${question.number}]`
  })

  const optionByLetter = new Map<string, { label: string; text: string; isDistractor: boolean }>()
  exerciseData.options.forEach((option) => {
    const normalizedLabel = option.option_letter?.trim().toUpperCase()
    if (!normalizedLabel || optionByLetter.has(normalizedLabel)) {
      return
    }

    optionByLetter.set(normalizedLabel, {
      label: normalizedLabel,
      text: option.option_text?.trim() ?? '',
      isDistractor: option.is_correct === false,
    })
  })

  const dedupedOptions = Array.from(optionByLetter.values()).sort((a, b) => a.label.localeCompare(b.label))

  const passageSection: PrintableSection | null = passage
    ? {
        type: 'passage',
        heading: exerciseData.exercise.title ?? undefined,
        paragraphs: splitTextIntoParagraphs(replaceGapPlaceholders(passage, replacements)),
        highlightGaps: true,
      }
    : null

  const responseRows = questions.map((question) => createTableRow([String(question.number), '\u00a0']))

  const optionsSection: PrintableSection = {
    type: 'options',
    heading: 'Options',
    items: dedupedOptions,
    columns: 2,
  }

  const responseSection: PrintableSection = {
    type: 'table',
    heading: 'Response Sheet',
    columns: [
      { id: 'question', label: 'Questions', align: 'center' },
      { id: 'answer', label: 'Answers', align: 'center' },
    ],
    rows: responseRows,
    variant: 'response',
  }

  const studentPages: PrintablePage[] = []

  if (passageSection) {
    studentPages.push({
      id: makePageId(),
      role: 'student',
      orientation: 'portrait',
      sections: [passageSection],
    })
  }

  studentPages.push(
    {
      id: makePageId(),
      role: 'student',
      orientation: 'portrait',
      sections: [optionsSection],
    },
    {
      id: makePageId(),
      role: 'student',
      orientation: 'portrait',
      sections: [responseSection],
    },
  )

  const answerKeyRows = questions.map((question) => createTableRow([String(question.number), question.answer]))

  const answerKeyPages: PrintablePage[] = [
    {
      id: makePageId(),
      role: 'answer-key',
      orientation: 'portrait',
      sections: [
        {
          type: 'table',
          heading: 'Answer Key',
          columns: [
            { id: 'gap', label: 'Gap', align: 'center' },
            { id: 'answer', label: 'Answer', align: 'center' },
          ],
          rows: answerKeyRows,
          variant: 'answer-key',
        },
      ],
    },
  ]

  return { studentPages, answerKeyPages }
}

const buildMultipleMatchingPages = ({ metadata, exerciseData, makePageId }: RuoEVariantBuilderContext): RuoEVariantBuilderResult => {
  const texts = exerciseData.options
    .slice()
    .sort((a, b) => a.option_letter.localeCompare(b.option_letter))
    .map((option) => ({
      label: option.option_letter,
      paragraphs: splitTextIntoParagraphs(option.option_text),
    }))

  const questions = exerciseData.questions
    .slice()
    .sort((a, b) => getDisplayOrder(exerciseData, a.id) - getDisplayOrder(exerciseData, b.id))
    .map((question, index) => ({
      number: index + 1,
      prompt: question.question_text ?? '',
      answer: formatAnswerValue(question.correct_answers),
      explanation: (question.explanation ?? '').trim(),
    }))

  const reuseAllowed = metadata.taskCode ? MULTIPLE_MATCHING_REUSE[metadata.taskCode.toUpperCase()] ?? false : false
  const instructions = reuseAllowed ? 'You may use each letter more than once.' : undefined

  const matchingQuestionSections = paginateQuestionSection({
    type: 'questions',
    heading: 'Statements',
    instructions,
    questions,
  })

  const studentSections: PrintableSection[] = [
    {
      type: 'multi-text',
      heading: exerciseData.exercise.title ?? undefined,
      texts,
    },
    ...matchingQuestionSections,
  ]

  const studentPages = createPrintablePagesFromSections({
    sections: studentSections,
    role: 'student',
    orientation: 'portrait',
    makePageId,
  })

  const answerKeyPages: PrintablePage[] = [
    {
      id: makePageId(),
      role: 'answer-key',
      orientation: 'portrait',
      sections: [
        {
          type: 'table',
          heading: 'Answer Key',
          columns: [
            { id: 'question', label: 'Question', align: 'center' },
            { id: 'answer', label: 'Answer', align: 'center' },
            { id: 'explanation', label: 'Explanation', align: 'left' },
          ],
          rows: questions.map((question) =>
            createTableRow([
              String(question.number),
              question.answer,
              question.explanation || '\u2014',
            ])
          ),
          variant: 'answer-key',
        },
      ],
    },
  ]

  return { studentPages, answerKeyPages }
}

const buildCrossTextPages = ({ exerciseData, makePageId }: RuoEVariantBuilderContext): RuoEVariantBuilderResult => {
  const parsedTexts = parseCrossTextContent(exerciseData.exercise.content_text)

  const fallbackTexts = exerciseData.options
    .slice()
    .sort((a, b) => a.option_letter.localeCompare(b.option_letter))
    .map((option) => ({
      label: option.option_letter,
      paragraphs: splitTextIntoParagraphs(option.option_text),
    }))

  const texts = parsedTexts.length > 0 ? parsedTexts : fallbackTexts

  const questions = exerciseData.questions
    .slice()
    .sort((a, b) => getDisplayOrder(exerciseData, a.id) - getDisplayOrder(exerciseData, b.id))
    .map((question, index) => ({
      number: index + 1,
      prompt: question.question_text ?? '',
      answer: formatAnswerValue(question.correct_answers),
    }))

  const crossTextQuestionSections = paginateQuestionSection({
    type: 'questions',
    heading: 'Statements',
    instructions: 'Match each statement with the correct text A–D. Write your answers in the table below.',
    questions,
  })

  const responseRows = questions.map((question) => createTableRow([String(question.number), '\u00a0']))

  const studentSections: PrintableSection[] = []
  const firstPageTexts = texts.slice(0, 3)
  const remainingTexts = texts.slice(3)
  const exerciseTitle = exerciseData.exercise.title ?? undefined

  if (firstPageTexts.length > 0) {
    studentSections.push({
      type: 'multi-text',
      heading: exerciseTitle,
      texts: firstPageTexts,
    })
  }

  let hasInsertedPageBreak = false

  if (remainingTexts.length > 0) {
    if (studentSections.length > 0) {
      studentSections.push({ type: 'page-break' })
      hasInsertedPageBreak = true
    }

    studentSections.push({
      type: 'multi-text',
      texts: remainingTexts,
    })
  }

  if (crossTextQuestionSections.length > 0) {
    if (!hasInsertedPageBreak && studentSections.length > 0) {
      studentSections.push({ type: 'page-break' })
      hasInsertedPageBreak = true
    }

    studentSections.push(...crossTextQuestionSections)
    studentSections.push({
      type: 'table',
      heading: 'Response Sheet',
      columns: [
        { id: 'question', label: 'Question', align: 'center' },
        { id: 'answer', label: 'Answer', align: 'center' },
      ],
      rows: responseRows,
      variant: 'response',
    })
  }

  const studentPages = createPrintablePagesFromSections({
    sections: studentSections,
    role: 'student',
    orientation: 'portrait',
    makePageId,
  })

  const answerKeyPages: PrintablePage[] = [
    {
      id: makePageId(),
      role: 'answer-key',
      orientation: 'portrait',
      sections: [
        {
          type: 'table',
          heading: 'Answer Key',
          columns: [
            { id: 'question', label: 'Question', align: 'center' },
            { id: 'answer', label: 'Answer', align: 'center' },
          ],
          rows: questions.map((question) => createTableRow([String(question.number), question.answer])),
          variant: 'answer-key',
        },
      ],
    },
  ]

  return { studentPages, answerKeyPages }
}

const VARIANT_BUILDERS: Record<RuoELayoutKey, (ctx: RuoEVariantBuilderContext) => RuoEVariantBuilderResult> = {
  'ruoe-mc-cloze': (ctx) => buildClozePages(ctx, 'ruoe-mc-cloze'),
  'ruoe-open-cloze': (ctx) => buildClozePages(ctx, 'ruoe-open-cloze'),
  'ruoe-word-formation': (ctx) => buildClozePages(ctx, 'ruoe-word-formation'),
  'ruoe-keyword-transformation': (ctx) => buildClozePages(ctx, 'ruoe-keyword-transformation'),
  'ruoe-reading-mcq': (ctx) => buildReadingMcqPages(ctx),
  'ruoe-gapped-text': (ctx) => buildGappedTextPages(ctx),
  'ruoe-multiple-matching': (ctx) => buildMultipleMatchingPages(ctx),
  'ruoe-cross-text': (ctx) => buildCrossTextPages(ctx),
}

export const buildRuoEDocument = ({ metadata, summary, exerciseData }: BuildRuoEDocumentParams): PrintableDocument => {
  const makePageId = createIdFactory('ruoe-print')
  const taskCodeCandidate = metadata.taskCode ?? summary.taskCode ?? exerciseData.taskType.task_code ?? ''
  const taskCode = taskCodeCandidate.toUpperCase()
  const layout = getRuoELayoutKey(taskCode)

  const resolvedTaskName = metadata.taskName ?? exerciseData.taskType.name ?? summary.title ?? null
  const resolvedGeneratedAt = metadata.generatedAt ?? exerciseData.exercise.created_at ?? new Date().toISOString()

  const resolvedMetadata: PrintableDocumentMetadata = {
    ...metadata,
    taskCode,
    taskName: resolvedTaskName,
    generatedAt: resolvedGeneratedAt,
  }

  const builder = VARIANT_BUILDERS[layout]
  if (!builder) {
    throw new Error(`Unsupported RUoE layout for printing: ${layout}`)
  }

  const { studentPages, answerKeyPages, includeAnswerKeyByDefault } = builder({
    metadata: resolvedMetadata,
    summary,
    exerciseData,
    makePageId,
  })

  const trimmedTheme = summary.teacherTheme?.trim() ?? ''
  const trimmedSkillFocus = summary.teacherSkillFocus?.trim() ?? ''

  if (trimmedTheme.length > 0 || trimmedSkillFocus.length > 0) {
    const guidanceParagraphs = [
      ...(trimmedTheme.length > 0
        ? [{
            text: `Theme: ${trimmedTheme}`,
            emphasis: false,
            format: 'plain',
          } satisfies PrintableParagraph]
        : []),
      ...(trimmedSkillFocus.length > 0
        ? [{
            text: `Skill focus: ${trimmedSkillFocus} (keep implicit in student-facing materials)`,
            emphasis: false,
            format: 'plain',
          } satisfies PrintableParagraph]
        : []),
    ]

    const guidanceSection: PrintableSection = {
      type: 'text',
      heading: 'Teacher Guidance',
      style: 'instructions',
      paragraphs: guidanceParagraphs,
    }

    if (answerKeyPages.length > 0) {
      answerKeyPages[0] = {
        ...answerKeyPages[0],
        sections: [guidanceSection, ...answerKeyPages[0].sections],
      }
    } else {
      answerKeyPages.push({
        id: makePageId(),
        role: 'answer-key',
        orientation: 'portrait',
        sections: [guidanceSection],
      })
    }
  }

  return {
    metadata: resolvedMetadata,
    settings: {
      includeAnswerKeyByDefault: includeAnswerKeyByDefault ?? true,
    },
    pages: [...studentPages, ...answerKeyPages],
  }
}
