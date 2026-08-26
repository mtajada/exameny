export interface TaskInstructions {
  title: string;
  description: string;
  timeLimit: string;
  questions: string;
  steps: string[];
  tips: string[];
}

const sharedSteps = [
  'Read the complete text before choosing an answer.',
  'Use grammar, meaning, and links between sentences as evidence.',
  'Review every answer in its full sentence before submitting.',
];

const instructions: Record<string, TaskInstructions> = {
  'mc-cloze': {
    title: 'Multiple-choice language task',
    description: 'Choose the option that best completes each gap in meaning and form.',
    timeLimit: '10-15 minutes',
    questions: 'All displayed gaps',
    steps: sharedSteps,
    tips: ['Check collocations as well as grammar.', 'Reject options that fit locally but break the wider meaning.'],
  },
  'open-cloze': {
    title: 'Open language task',
    description: 'Supply one word that makes each sentence complete and coherent.',
    timeLimit: '10-15 minutes',
    questions: 'All displayed gaps',
    steps: sharedSteps,
    tips: ['Look for function words and fixed phrases.', 'Use only the number of words requested.'],
  },
  'word-formation': {
    title: 'Word formation',
    description: 'Transform the supplied root so it fits the sentence precisely.',
    timeLimit: '10-15 minutes',
    questions: 'All displayed gaps',
    steps: sharedSteps,
    tips: ['Identify the required part of speech.', 'Check whether the meaning needs a negative form.'],
  },
  transformation: {
    title: 'Sentence transformation',
    description: 'Rewrite the sentence with the supplied word while preserving its meaning.',
    timeLimit: '15-20 minutes',
    questions: 'All displayed items',
    steps: sharedSteps,
    tips: ['Do not change the supplied word.', 'Check meaning, grammar, and the stated word limit.'],
  },
  reading: {
    title: 'Reading comprehension',
    description: 'Use evidence from the text to answer each question.',
    timeLimit: '20-30 minutes',
    questions: 'All displayed questions',
    steps: sharedSteps,
    tips: ['Distinguish what the text states from what merely sounds plausible.', 'Re-read the relevant passage before deciding.'],
  },
};

const fallback: TaskInstructions = {
  title: 'English practice',
  description: 'Complete the task using evidence from the instructions and text.',
  timeLimit: 'Work at a steady pace',
  questions: 'Complete every item',
  steps: sharedSteps,
  tips: ['Use the surrounding context.', 'Leave time to review your answers.'],
};

export function getTaskInstructions(taskCode: string): TaskInstructions {
  const code = taskCode.toUpperCase();
  if (code.includes('MC_CLOZE')) return instructions['mc-cloze'];
  if (code.includes('OPEN_CLOZE')) return instructions['open-cloze'];
  if (code.includes('WORD_FORMATION')) return instructions['word-formation'];
  if (code.includes('TRANSFORMATION')) return instructions.transformation;
  if (code.includes('READ')) return instructions.reading;
  return fallback;
}
