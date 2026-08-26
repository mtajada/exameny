import type { MistakeAnchorResolution, MistakeItemPreview, MistakesAnalysisState } from '@/hooks/mistakes/types.ts'

const submissionText = `Although the research was thorough, there were several mistakes in the final report. Firstly, the introduction contain serious grammatical errors and switches tenses within the same sentence. Secondly, some lexical choices sounded unnatural, like using "bigly" to describe the impact and calling the committee "supposably expert". Moreover, mechanical mistakes such as missing commas, misused apostrophes, and inconsistent capitalization distracted readers. Regarding discourse, the ideas jumped abruptly without clear transitions, and the conclusion repeated earlier paragraphs almost word for word. Additionally, the tone drifts from formal analysis to casual commentary with phrases like "you guys know" and "I guess" when presenting findings. Finally, the response failed to fully address the task by skipping the analysis of counterarguments and leaving the recommendation section blank.`

const createAnchoredResolution = (start: number, end: number): MistakeAnchorResolution => ({
  status: 'anchored',
  start,
  end,
  confidence: 1,
})

type DebugPreviewItem = Omit<MistakeItemPreview, 'anchorPatch' | 'anchorAdjustment'> & {
  anchorResolution: MistakeAnchorResolution
}

const createPreviewItem = (item: DebugPreviewItem): MistakeItemPreview => ({
  ...item,
  anchorPatch: null,
  anchorAdjustment: null,
})

function createBaseState(): Pick<
  MistakesAnalysisState,
  'submissionText' | 'loading' | 'error' | 'refetch' | 'status' | 'warnings' | 'lastErrorMessage'
> {
  return {
    submissionText,
    loading: false,
    error: null,
    refetch: null,
    status: 'completed',
    warnings: { unhighlightableItems: 0, discardedItems: 0, unparsedItems: 0 },
    lastErrorMessage: null,
  }
}

export const DEBUG_MISTAKES_PRESETS: Record<string, MistakesAnalysisState> = {
  dense: {
    ...createBaseState(),
    summaryCounts: {
      total: 13,
      byCategory: {
        Grammar: 2,
        Lexis: 2,
        Mechanics: 3,
        Discourse: 2,
        'Register & Style': 2,
        'Task Achievement': 2,
      },
    },
    groups: [
      {
        categoryCode: 'GR',
        categoryName: 'Grammar',
        count: 2,
        tags: [
          { tagCode: 'VERB_FORM', count: 1 },
          { tagCode: 'TENSE_SHIFT', count: 1 },
        ],
        items: [
          createPreviewItem({
            id: 'gr-1',
            anchorText: 'introduction contain serious',
            explanation: 'Use the past tense "contained" to agree with the time reference.',
            categoryCode: 'GR',
            featureTags: ['VERB_FORM'],
            suggestedCorrection: 'introduction contained serious',
            anchorStart: 98,
            anchorEnd: 126,
            anchorResolution: createAnchoredResolution(98, 126),
          }),
          createPreviewItem({
            id: 'gr-2',
            anchorText: 'switches tenses within the same sentence',
            explanation: 'Keep the sentence in a single tense to avoid confusion.',
            categoryCode: 'GR',
            featureTags: ['TENSE_SHIFT'],
            suggestedCorrection: 'keeps the tense consistent within the same sentence',
            anchorStart: 150,
            anchorEnd: 190,
            anchorResolution: createAnchoredResolution(150, 190),
          }),
        ],
      },
      {
        categoryCode: 'LX',
        categoryName: 'Lexis',
        count: 2,
        tags: [
          { tagCode: 'WORD_CHOICE', count: 1 },
          { tagCode: 'COLLOCATION', count: 1 },
        ],
        items: [
          createPreviewItem({
            id: 'lx-1',
            anchorText: '"bigly" to describe the impact',
            explanation: 'Use an appropriate adverb such as "significantly".',
            categoryCode: 'LX',
            featureTags: ['WORD_CHOICE'],
            suggestedCorrection: '"significantly" to describe the impact',
            anchorStart: 253,
            anchorEnd: 283,
            anchorResolution: createAnchoredResolution(253, 283),
          }),
          createPreviewItem({
            id: 'lx-2',
            anchorText: '"supposably expert"',
            explanation: 'Choose a correct collocation like "supposed experts".',
            categoryCode: 'LX',
            featureTags: ['COLLOCATION'],
            suggestedCorrection: '"supposed experts"',
            anchorStart: 310,
            anchorEnd: 329,
            anchorResolution: createAnchoredResolution(310, 329),
          }),
        ],
      },
      {
        categoryCode: 'ME',
        categoryName: 'Mechanics',
        count: 3,
        tags: [
          { tagCode: 'PUNCTUATION', count: 1 },
          { tagCode: 'APOSTROPHE', count: 1 },
          { tagCode: 'CAPITALIZATION', count: 1 },
        ],
        items: [
          createPreviewItem({
            id: 'me-1',
            anchorText: 'missing commas',
            explanation: 'Insert commas to separate items in the list.',
            categoryCode: 'ME',
            featureTags: ['PUNCTUATION'],
            suggestedCorrection: null,
            anchorStart: 369,
            anchorEnd: 383,
            anchorResolution: createAnchoredResolution(369, 383),
          }),
          createPreviewItem({
            id: 'me-2',
            anchorText: 'misused apostrophes',
            explanation: 'Check possessive forms and remove unnecessary apostrophes.',
            categoryCode: 'ME',
            featureTags: ['APOSTROPHE'],
            suggestedCorrection: null,
            anchorStart: 385,
            anchorEnd: 404,
            anchorResolution: createAnchoredResolution(385, 404),
          }),
          createPreviewItem({
            id: 'me-3',
            anchorText: 'inconsistent capitalization',
            explanation: 'Follow a single capitalization style for headings and acronyms.',
            categoryCode: 'ME',
            featureTags: ['CAPITALIZATION'],
            suggestedCorrection: null,
            anchorStart: 410,
            anchorEnd: 437,
            anchorResolution: createAnchoredResolution(410, 437),
          }),
        ],
      },
      {
        categoryCode: 'DC',
        categoryName: 'Discourse',
        count: 2,
        tags: [
          { tagCode: 'COHESION', count: 1 },
          { tagCode: 'REPETITION', count: 1 },
        ],
        items: [
          createPreviewItem({
            id: 'dc-1',
            anchorText: 'ideas jumped abruptly without clear transitions',
            explanation: 'Add transition phrases to guide the reader between ideas.',
            categoryCode: 'DC',
            featureTags: ['COHESION'],
            suggestedCorrection: 'ideas flowed logically with clear transitions',
            anchorStart: 483,
            anchorEnd: 530,
            anchorResolution: createAnchoredResolution(483, 530),
          }),
          createPreviewItem({
            id: 'dc-2',
            anchorText: 'conclusion repeated earlier paragraphs almost word for word',
            explanation: 'Paraphrase the conclusion instead of repeating previous sentences.',
            categoryCode: 'DC',
            featureTags: ['REPETITION'],
            suggestedCorrection: 'conclusion synthesized earlier points without repetition',
            anchorStart: 540,
            anchorEnd: 599,
            anchorResolution: createAnchoredResolution(540, 599),
          }),
        ],
      },
      {
        categoryCode: 'RS',
        categoryName: 'Register & Style',
        count: 2,
        tags: [
          { tagCode: 'REGISTER', count: 1 },
          { tagCode: 'TONE', count: 1 },
        ],
        items: [
          createPreviewItem({
            id: 'rs-1',
            anchorText: '"you guys know"',
            explanation: 'Replace casual expressions with formal alternatives.',
            categoryCode: 'RS',
            featureTags: ['REGISTER'],
            suggestedCorrection: '"as readers may know"',
            anchorStart: 691,
            anchorEnd: 706,
            anchorResolution: createAnchoredResolution(691, 706),
          }),
          createPreviewItem({
            id: 'rs-2',
            anchorText: '"I guess"',
            explanation: 'Avoid hedging phrases and state findings confidently.',
            categoryCode: 'RS',
            featureTags: ['TONE'],
            suggestedCorrection: '"the evidence indicates"',
            anchorStart: 711,
            anchorEnd: 720,
            anchorResolution: createAnchoredResolution(711, 720),
          }),
        ],
      },
      {
        categoryCode: 'TA',
        categoryName: 'Task Achievement',
        count: 2,
        tags: [
          { tagCode: 'REQUIREMENT', count: 1 },
          { tagCode: 'COMPLETENESS', count: 1 },
        ],
        items: [
          createPreviewItem({
            id: 'ta-1',
            anchorText: 'skipping the analysis of counterarguments',
            explanation: 'Address the opposing arguments outlined in the brief.',
            categoryCode: 'TA',
            featureTags: ['REQUIREMENT'],
            suggestedCorrection: 'including the analysis of counterarguments',
            anchorStart: 805,
            anchorEnd: 846,
            anchorResolution: createAnchoredResolution(805, 846),
          }),
          createPreviewItem({
            id: 'ta-2',
            anchorText: 'leaving the recommendation section blank',
            explanation: 'Provide a final recommendation as requested in the task.',
            categoryCode: 'TA',
            featureTags: ['COMPLETENESS'],
            suggestedCorrection: 'completing the recommendation section with clear guidance',
            anchorStart: 851,
            anchorEnd: 891,
            anchorResolution: createAnchoredResolution(851, 891),
          }),
        ],
      },
    ],
  },
}

export type MistakesAnalysisDebugPreset = keyof typeof DEBUG_MISTAKES_PRESETS

export function getDebugMistakesAnalysis(preset: MistakesAnalysisDebugPreset): MistakesAnalysisState {
  const target = DEBUG_MISTAKES_PRESETS[preset]
  if (!target) {
    throw new Error(`Unknown mistakes analysis debug preset: ${preset}`)
  }
  return {
    ...target,
    groups: target.groups.map((group) => ({
      ...group,
      tags: group.tags.map((tag) => ({ ...tag })),
      items: group.items.map((item) => ({ ...item })),
    })),
    summaryCounts: {
      total: target.summaryCounts.total,
      byCategory: { ...target.summaryCounts.byCategory },
    },
  }
}
