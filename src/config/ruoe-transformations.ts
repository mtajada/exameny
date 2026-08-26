export interface TransformationTemplate {
  original: string;
  transformation: string;
  hints?: string[];
  level?: 'B2' | 'C1';
}

// Copied exactly from ContentZone.tsx buildTransformationPair templates
export const TRANSFORMATION_TEMPLATES: Record<string, TransformationTemplate> = {
  // Passive/Active voice
  CALLED: {
    original: 'They called the wedding off.',
    transformation: 'The wedding _______ by them.',
    hints: ['passive voice', 'phrasal verb'],
    level: 'B2',
  },
  MADE: {
    original: 'The rain made us cancel the picnic.',
    transformation: 'We _______ cancel the picnic by the rain.',
    hints: ['causative', 'passive'],
    level: 'B2',
  },
  SEEN: {
    original: 'People have seen him in the area recently.',
    transformation: 'He _______ in the area recently.',
    level: 'B2',
  },

  // Conditionals
  UNLESS: {
    original: "You won't pass if you don't study harder.",
    transformation: "You won't pass _______ study harder.",
    level: 'B2',
  },
  PROVIDED: {
    original: 'You can borrow my car if you drive carefully.',
    transformation: 'You can borrow my car _______ carefully.',
    level: 'B2',
  },
  SUPPOSING: {
    original: 'What would happen if we left early?',
    transformation: '_______ we left early?',
    level: 'B2',
  },

  // Wishes and regrets
  WISH: {
    original: 'I regret not studying harder for the exam.',
    transformation: 'I _______ harder for the exam.',
    level: 'B2',
  },
  RATHER: {
    original: 'I would prefer to stay home tonight.',
    transformation: 'I _______ home tonight.',
    level: 'B2',
  },

  // Reporting
  TOLD: {
    original: "She said to me, 'Don't be late tomorrow.'",
    transformation: 'She _______ late the next day.',
    level: 'B2',
  },
  ASKED: {
    original: "He said to her, 'Could you help me?'",
    transformation: 'He _______ help him.',
    level: 'B2',
  },

  // Modal equivalents
  ABLE: {
    original: "She can't swim very well.",
    transformation: 'She _______ swim very well.',
    level: 'B2',
  },
  MANAGE: {
    original: 'I succeeded in finishing the project on time.',
    transformation: 'I _______ the project on time.',
    level: 'B2',
  },
  NECESSARY: {
    original: 'You must wear a helmet when cycling.',
    transformation: 'It _______ a helmet when cycling.',
    level: 'B2',
  },

  // Time expressions
  SINCE: {
    original: "It's three years ago that I last saw him.",
    transformation: 'I _______ three years.',
    level: 'B2',
  },
  UNTIL: {
    original: "Don't start the meeting before I arrive.",
    transformation: 'Wait _______ start the meeting.',
    level: 'B2',
  },

  // Comparisons
  PREFER: {
    original: 'I like tea more than coffee.',
    transformation: 'I _______ coffee.',
    level: 'B2',
  },
  INSTEAD: {
    original: 'Rather than driving, we took the train.',
    transformation: 'We took the train _______ driving.',
    level: 'B2',
  },

  // Default fallback
  DEFAULT: {
    original: 'Complete this sentence using the given word.',
    transformation: 'This sentence _______ with the key word.',
    level: 'B2',
  },
};

export const getTransformationTemplate = (keyWord: string): TransformationTemplate => {
  const key = keyWord.toUpperCase();
  return TRANSFORMATION_TEMPLATES[key] || TRANSFORMATION_TEMPLATES.DEFAULT;
};
