import { MULTIPLE_MATCHING_COUNTS } from "./ruoe-layout-config.ts";

// =============================================================================
// TYPESCRIPT INTERFACES & VALIDATION FOR R&UoE EXERCISE GENERATION
// =============================================================================

/**
 * Base interfaces for R&UoE exercise structure
 */
export interface Option {
  letter: "A" | "B" | "C" | "D";
  text: string;
  isCorrect: boolean;
  feedback: string;
}

export interface Question {
  questionNumber: number;
  placeholder: string;
  questionText?: string;
  explanation?: string;
  originalSentence?: string;
  transformationSentence?: string;
  options?: Option[]; // For multiple choice questions
  correctAnswers?: string[]; // For open-ended questions
}

export interface BaseExercise {
  title: string;
  mainTextWithPlaceholders: string;
  questions: Question[];
}

/**
 * Specific exercise type interfaces
 */
export interface MCQClozeExercise extends BaseExercise {
  questions: Array<
    Question & {
      options: Option[];
      correctAnswers?: never;
    }
  >;
}

export interface OpenClozeExercise extends BaseExercise {
  questions: Array<
    Question & {
      correctAnswers: string[];
      options?: never;
    }
  >;
}

export interface WordFormationExercise extends BaseExercise {
  questions: Array<
    Question & {
      correctAnswers: string[];
      options?: never;
      questionText: string; // Word formation always has a root word
    }
  >;
}

export interface KeyWordTransformationExercise extends BaseExercise {
  questions: Array<
    Question & {
      correctAnswers: string[];
      options?: never;
      questionText: string; // Key word supplied to candidates (uppercase)
      originalSentence: string;
      transformationSentence: string;
      explanation: string;
    }
  >;
}

/**
 * Reading Part 5 - Multiple Choice Questions (existing)
 */
export interface ReadingMultipleChoiceExercise extends BaseExercise {
  questions: Array<
    Question & {
      options: Option[];
      correctAnswers?: never;
      questionText: string; // The actual question text
    }
  >;
}

/**
 * Reading Part 6 (B2) / Part 7 (C1) - Gapped Text
 */
export interface GappedTextExercise extends BaseExercise {
  questions: Array<
    Question & {
      correctAnswers: string[]; // Array of correct option letters (e.g., ["A"])
      options?: never;
      questionText?: never; // No question text for gapped text
    }
  >;
  options: Array<{ // Missing sentences/paragraphs
    letter: string;
    text: string;
    isDistractor?: boolean; // Some options are distractors
  }>;
}

/**
 * Reading Part 7 (B2) / Part 8 (C1) - Multiple Matching
 */
export interface MultipleMatchingExercise extends BaseExercise {
  questions: Array<
    Question & {
      correctAnswers: string[]; // Array of correct section letters (e.g., ["A"])
      options?: never;
      questionText: string; // The statement to match
      explanation: string;
    }
  >;
  options: Array<{
    letter: string;
    text: string;
  }>;
}

/**
 * Reading Part 6 (C1) - Cross-Text Multiple Matching
 */
export interface CrossTextMatchingExercise extends BaseExercise {
  questions: Array<
    Question & {
      correctAnswers: string[]; // Array of correct text letters (e.g., ["A"])
      options?: never;
      questionText: string; // The question about the texts
    }
  >;
  texts: Array<{ // The four short texts
    letter: string;
    title: string;
    content: string;
  }>;
}

/**
 * Union type for all exercise types
 */
export type RUoEExercise =
  | MCQClozeExercise
  | OpenClozeExercise
  | WordFormationExercise
  | KeyWordTransformationExercise
  | ReadingMultipleChoiceExercise
  | GappedTextExercise
  | MultipleMatchingExercise
  | CrossTextMatchingExercise;

/**
 * Task context interface for prompt building
 */
export interface TaskContext {
  taskTypeId: number;
  taskCode: string;
  taskName: string;
  levelName: string;
  levelCode: string;
  examName: string;
  examTypeId: number;
  levelId: number;
  teacherTheme?: string | null;
  teacherSkillFocus?: string | null;
}

/**
 * Validation error interface
 */
export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

/**
 * Validation result interface
 */
export interface ValidationResult<T = unknown> {
  isValid: boolean;
  errors: ValidationError[];
  data?: T;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// =============================================================================
// VALIDATION CONFIGURATION HELPERS
// =============================================================================

const DEFAULT_OPTION_LETTERS = ["A", "B", "C", "D"];

interface QuestionOptionValidationConfig {
  expectedOptionCount?: number;
  allowedOptionLetters?: string[];
}

interface MultipleChoiceValidationConfig
  extends QuestionOptionValidationConfig {
  expectedQuestionCount?: number;
  enforceNoticeHeadings?: boolean;
}

interface OpenClozeValidationConfig {
  expectedQuestionCount?: number;
}

interface GappedTextConfig {
  allowedLetters: string[];
  expectedOptions: number;
  expectedQuestions: number;
}

interface MultipleMatchingConfig {
  allowedLetters: string[];
  expectedOptions?: number;
  minOptions?: number;
  maxOptions?: number;
  expectedQuestions: number;
  enforceContiguity: boolean;
}

const OPEN_CLOZE_EXPECTED_QUESTIONS: Record<string, number> = {
  B2_LANG_OPEN_CLOZE: 8,
  C1_LANG_OPEN_CLOZE: 8,
  C2_LANG_OPEN_CLOZE: 8,
  B1_LANG_OPEN_CLOZE: 6,
};

const GAPPED_TEXT_CONFIG: Record<string, GappedTextConfig> = {
  B2_READ_GAPPED_TEXT: {
    allowedLetters: ["A", "B", "C", "D", "E", "F", "G"],
    expectedOptions: 7,
    expectedQuestions: 6,
  },
  C1_READ_GAPPED_TEXT: {
    allowedLetters: ["A", "B", "C", "D", "E", "F", "G"],
    expectedOptions: 7,
    expectedQuestions: 6,
  },
  B1_READ_GAPPED_TEXT: {
    allowedLetters: ["A", "B", "C", "D", "E", "F"],
    expectedOptions: 6,
    expectedQuestions: 5,
  },
  C2_READ_GAPPED_TEXT: {
    allowedLetters: ["A", "B", "C", "D", "E", "F", "G", "H"],
    expectedOptions: 8,
    expectedQuestions: 7,
  },
};

const MULTIPLE_MATCHING_CONFIG: Record<string, MultipleMatchingConfig> = {
  B2_READ_MULTIPLE_MATCHING: {
    allowedLetters: ["A", "B", "C", "D"],
    expectedOptions: 4,
    expectedQuestions: 10,
    enforceContiguity: true,
  },
  C1_READ_MULTIPLE_MATCHING: {
    allowedLetters: ["A", "B", "C", "D", "E"],
    minOptions: 4,
    maxOptions: 5,
    expectedQuestions: 10,
    enforceContiguity: true,
  },
  B1_READ_MULTIPLE_MATCHING: {
    allowedLetters: ["A", "B", "C", "D", "E", "F", "G", "H"],
    expectedOptions: 8,
    expectedQuestions: 5,
    enforceContiguity: true,
  },
  C2_READ_MULTIPLE_MATCHING: {
    allowedLetters: Array.from(
      { length: 26 },
      (_, index) => String.fromCharCode(65 + index),
    ),
    minOptions: 4,
    expectedQuestions: 10,
    enforceContiguity: true,
  },
};

type BaseExerciseCandidate = UnknownRecord & {
  title: string;
  mainTextWithPlaceholders: string;
  questions: UnknownRecord[];
};

/**
 * Validates basic exercise structure
 */
export function validateBaseExercise(
  data: unknown,
): ValidationResult<BaseExerciseCandidate> {
  const errors: ValidationError[] = [];

  if (!isRecord(data)) {
    return {
      isValid: false,
      errors: [{
        field: "root",
        message: "Exercise payload must be an object",
        value: data,
      }],
    };
  }

  if (typeof data.title !== "string") {
    errors.push({
      field: "title",
      message: "Title is required and must be a string",
      value: data.title,
    });
  }

  if (typeof data.mainTextWithPlaceholders !== "string") {
    errors.push({
      field: "mainTextWithPlaceholders",
      message: "Main text with placeholders is required and must be a string",
      value: data.mainTextWithPlaceholders,
    });
  }

  if (!Array.isArray(data.questions)) {
    errors.push({
      field: "questions",
      message: "Questions must be an array",
      value: data.questions,
    });
  } else if (data.questions.length === 0) {
    errors.push({
      field: "questions",
      message: "At least one question is required",
      value: data.questions,
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    data: errors.length === 0 ? (data as BaseExerciseCandidate) : undefined,
  };
}

/**
 * Validates option structure for multiple choice questions
 */
export function validateOption(
  option: unknown,
  questionNumber: number,
  allowedLetters: string[] = DEFAULT_OPTION_LETTERS,
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!isRecord(option)) {
    errors.push({
      field: `questions[${questionNumber}].options`,
      message: "Option must be an object",
      value: option,
    });
    return errors;
  }

  const { letter, text, isCorrect, feedback } = option;

  if (typeof letter !== "string" || letter.trim().length === 0) {
    errors.push({
      field: `questions[${questionNumber}].options.letter`,
      message: "Option letter is required and must be a string",
      value: letter,
    });
  } else {
    const normalizedLetter = letter.trim().toUpperCase();
    if (!allowedLetters.includes(normalizedLetter)) {
      errors.push({
        field: `questions[${questionNumber}].options.letter`,
        message: `Option letter must be one of ${allowedLetters.join(", ")}`,
        value: letter,
      });
    }
  }

  if (typeof text !== "string" || text.trim().length === 0) {
    errors.push({
      field: `questions[${questionNumber}].options.text`,
      message: "Option text is required and must be a string",
      value: text,
    });
  }

  if (typeof isCorrect !== "boolean") {
    errors.push({
      field: `questions[${questionNumber}].options.isCorrect`,
      message: "Option isCorrect must be a boolean",
      value: isCorrect,
    });
  }

  if (typeof feedback !== "string" || feedback.trim().length === 0) {
    errors.push({
      field: `questions[${questionNumber}].options.feedback`,
      message: "Option feedback is required and must be a string",
      value: feedback,
    });
  }

  return errors;
}

/**
 * Validates question structure
 */
export function validateQuestion(
  question: UnknownRecord,
  index: number,
  config: QuestionOptionValidationConfig = {},
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof question.questionNumber !== "number") {
    errors.push({
      field: `questions[${index}].questionNumber`,
      message: "Question number must be a number",
      value: question.questionNumber,
    });
  }

  if (
    typeof question.placeholder !== "string" ||
    question.placeholder.trim().length === 0
  ) {
    errors.push({
      field: `questions[${index}].placeholder`,
      message: "Question placeholder is required and must be a string",
      value: question.placeholder,
    });
  }

  const rawOptions = question.options;
  const optionsArray = Array.isArray(rawOptions) ? rawOptions : null;

  if (rawOptions !== undefined && !Array.isArray(rawOptions)) {
    errors.push({
      field: `questions[${index}].options`,
      message: "Options must be an array",
      value: rawOptions,
    });
  } else if (optionsArray !== null) {
    const expectedOptionCount = config.expectedOptionCount ??
      DEFAULT_OPTION_LETTERS.length;
    if (optionsArray.length !== expectedOptionCount) {
      errors.push({
        field: `questions[${index}].options`,
        message:
          `Multiple choice questions must have exactly ${expectedOptionCount} options`,
        value: optionsArray.length,
      });
    }

    // Validate each option
    const allowedLetters = config.allowedOptionLetters ??
      DEFAULT_OPTION_LETTERS;
    optionsArray.forEach((option) => {
      errors.push(...validateOption(option, index, allowedLetters));
    });

    // Check that exactly one option is correct
    const correctOptions = optionsArray.filter((opt) =>
      isRecord(opt) && opt.isCorrect === true
    );
    if (correctOptions.length !== 1) {
      errors.push({
        field: `questions[${index}].options`,
        message: "Exactly one option must be marked as correct",
        value: correctOptions.length,
      });
    }

    // Check that all letters are unique
    const letters = optionsArray.map((opt) =>
      isRecord(opt) && typeof opt.letter === "string"
        ? opt.letter.trim().toUpperCase()
        : opt.letter
    );
    const uniqueLetters = [...new Set(letters)];
    if (letters.length !== uniqueLetters.length) {
      errors.push({
        field: `questions[${index}].options`,
        message: "All option letters must be unique",
        value: letters,
      });
    }
  }

  // Validate correctAnswers for open-ended questions
  const correctAnswers = question.correctAnswers;
  if (correctAnswers !== undefined) {
    if (!Array.isArray(correctAnswers)) {
      errors.push({
        field: `questions[${index}].correctAnswers`,
        message: "Correct answers must be an array",
        value: correctAnswers,
      });
    } else if (correctAnswers.length === 0) {
      errors.push({
        field: `questions[${index}].correctAnswers`,
        message: "At least one correct answer is required",
        value: correctAnswers,
      });
    } else {
      // Check that all answers are strings
      correctAnswers.forEach((answer, answerIndex: number) => {
        if (typeof answer !== "string") {
          errors.push({
            field: `questions[${index}].correctAnswers[${answerIndex}]`,
            message: "Correct answers must be strings",
            value: answer,
          });
        }
      });
    }
  }

  // Ensure question has either options OR correctAnswers, not both
  const hasOptions = optionsArray !== null && optionsArray.length > 0;
  const hasCorrectAnswers = Array.isArray(correctAnswers) &&
    correctAnswers.length > 0;
  if (hasOptions && hasCorrectAnswers) {
    errors.push({
      field: `questions[${index}]`,
      message: "Question cannot have both options and correctAnswers",
      value: { hasOptions: true, hasCorrectAnswers: true },
    });
  }

  if (!hasOptions && !hasCorrectAnswers) {
    errors.push({
      field: `questions[${index}]`,
      message: "Question must have either options or correctAnswers",
      value: { hasOptions, hasCorrectAnswers },
    });
  }

  return errors;
}

/**
 * Validates MCQ Cloze exercise structure
 */
export function validateMCQClozeResponse(
  data: unknown,
  config: MultipleChoiceValidationConfig = {},
): ValidationResult<MCQClozeExercise> {
  const baseValidation = validateBaseExercise(data);
  if (!baseValidation.isValid || !baseValidation.data) {
    return {
      isValid: false,
      errors: baseValidation.errors,
    };
  }

  const baseData = baseValidation.data;
  const errors: ValidationError[] = [];
  const expectedOptionCount = config.expectedOptionCount ??
    DEFAULT_OPTION_LETTERS.length;
  const allowedOptionLetters = config.allowedOptionLetters ??
    DEFAULT_OPTION_LETTERS;
  const expectedQuestionCount = config.expectedQuestionCount;

  // Validate each question
  baseData.questions.forEach((question, index: number) => {
    const questionErrors = validateQuestion(question, index, {
      expectedOptionCount,
      allowedOptionLetters,
    });
    errors.push(...questionErrors);

    // MCQ questions must have options
    if (!Array.isArray(question.options)) {
      errors.push({
        field: `questions[${index}]`,
        message: "MCQ Cloze questions must have options",
        value: question,
      });
    }
  });

  if (
    typeof expectedQuestionCount === "number" &&
    baseData.questions.length !== expectedQuestionCount
  ) {
    errors.push({
      field: "questions",
      message:
        `This task must contain exactly ${expectedQuestionCount} questions`,
      value: baseData.questions.length,
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    data: errors.length === 0 ? (data as MCQClozeExercise) : undefined,
  };
}

/**
 * Validates Open Cloze exercise structure
 */
export function validateOpenClozeResponse(
  data: unknown,
  config: OpenClozeValidationConfig = {},
  taskCode?: string,
): ValidationResult<OpenClozeExercise> {
  const baseValidation = validateBaseExercise(data);
  if (!baseValidation.isValid || !baseValidation.data) {
    return {
      isValid: false,
      errors: baseValidation.errors,
    };
  }

  const baseData = baseValidation.data;
  const errors: ValidationError[] = [];
  const { expectedQuestionCount } = config;

  if (taskCode) {
    validateTitleQuality(baseData.title, taskCode, errors);
  }

  // Validate each question
  baseData.questions.forEach((question, index: number) => {
    const questionErrors = validateQuestion(question, index);
    errors.push(...questionErrors);

    // Open cloze questions must have correctAnswers
    if (!question.correctAnswers) {
      errors.push({
        field: `questions[${index}]`,
        message: "Open Cloze questions must have correctAnswers",
        value: question,
      });
    }
  });

  if (
    typeof expectedQuestionCount === "number" &&
    baseData.questions.length !== expectedQuestionCount
  ) {
    errors.push({
      field: "questions",
      message:
        `This task must contain exactly ${expectedQuestionCount} questions`,
      value: baseData.questions.length,
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    data: errors.length === 0 ? (data as OpenClozeExercise) : undefined,
  };
}

/**
 * Validates Word Formation exercise structure
 */
export function validateWordFormationResponse(
  data: unknown,
): ValidationResult<WordFormationExercise> {
  const baseValidation = validateBaseExercise(data);
  if (!baseValidation.isValid || !baseValidation.data) {
    return {
      isValid: false,
      errors: baseValidation.errors,
    };
  }

  const baseData = baseValidation.data;
  const errors: ValidationError[] = [];

  // Validate each question
  baseData.questions.forEach((question, index: number) => {
    const questionErrors = validateQuestion(question, index);
    errors.push(...questionErrors);

    // Word formation questions must have correctAnswers and questionText (root word)
    if (!question.correctAnswers) {
      errors.push({
        field: `questions[${index}]`,
        message: "Word Formation questions must have correctAnswers",
        value: question,
      });
    }

    if (!question.questionText) {
      errors.push({
        field: `questions[${index}]`,
        message: "Word Formation questions must have questionText (root word)",
        value: question,
      });
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    data: errors.length === 0 ? (data as WordFormationExercise) : undefined,
  };
}

/**
 * Validates Key Word Transformation exercise structure
 */
export function validateKeyWordTransformationResponse(
  data: unknown,
): ValidationResult<KeyWordTransformationExercise> {
  const baseValidation = validateBaseExercise(data);
  if (!baseValidation.isValid || !baseValidation.data) {
    return {
      isValid: false,
      errors: baseValidation.errors,
    };
  }

  const baseData = baseValidation.data;
  const errors: ValidationError[] = [];

  // Validate each question
  baseData.questions.forEach((question, index: number) => {
    const questionErrors = validateQuestion(question, index);
    errors.push(...questionErrors);

    // Key word transformation questions must have correctAnswers
    if (!question.correctAnswers) {
      errors.push({
        field: `questions[${index}]`,
        message: "Key Word Transformation questions must have correctAnswers",
        value: question,
      });
    }

    const keyword = typeof question.questionText === "string"
      ? question.questionText.trim()
      : "";
    const originalSentence = typeof question.originalSentence === "string"
      ? question.originalSentence.trim()
      : "";
    const transformationSentence =
      typeof question.transformationSentence === "string"
        ? question.transformationSentence.trim()
        : "";

    // Enforce new structure for P4: keyword + both sentences must be non-empty strings
    const hasNewStructure = keyword.length > 0 && originalSentence.length > 0 &&
      transformationSentence.length > 0;

    if (!hasNewStructure) {
      errors.push({
        field: `questions[${index}]`,
        message:
          "Key Word Transformation questions must include non-empty questionText (keyword), originalSentence, and transformationSentence",
        value: question,
      });
    }

    if (
      typeof question.explanation !== "string" ||
      question.explanation.trim().length === 0
    ) {
      errors.push({
        field: `questions[${index}].explanation`,
        message:
          "Key Word Transformation questions must include a non-empty explanation",
        value: question.explanation,
      });
    }

    if (keyword.length > 0 && keyword !== keyword.toUpperCase()) {
      errors.push({
        field: `questions[${index}].questionText`,
        message:
          "Key Word Transformation keywords must be provided in uppercase",
        value: question.questionText,
      });
    }

    // Additional formatting check: transformationSentence must contain a single underscore gap
    if (typeof question.transformationSentence === "string") {
      const matches = transformationSentence.match(/_{2,}/g) || [];
      if (matches.length !== 1) {
        errors.push({
          field: `questions[${index}].transformationSentence`,
          message:
            "transformationSentence must contain exactly one continuous underscore gap (e.g., _______)",
          value: question.transformationSentence,
        });
      }
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    data: errors.length === 0
      ? (data as KeyWordTransformationExercise)
      : undefined,
  };
}

/**
 * Validates Reading Part 5 (Multiple Choice) exercise structure
 */
export function validateReadingMultipleChoiceResponse(
  data: unknown,
  config: MultipleChoiceValidationConfig = {},
): ValidationResult<ReadingMultipleChoiceExercise> {
  const baseValidation = validateBaseExercise(data);
  if (!baseValidation.isValid || !baseValidation.data) {
    return {
      isValid: false,
      errors: baseValidation.errors,
    };
  }

  const baseData = baseValidation.data;
  const errors: ValidationError[] = [];
  const expectedOptionCount = config.expectedOptionCount ??
    DEFAULT_OPTION_LETTERS.length;
  const allowedOptionLetters = config.allowedOptionLetters ??
    DEFAULT_OPTION_LETTERS;
  const expectedQuestionCount = config.expectedQuestionCount;

  // Validate each question
  baseData.questions.forEach((question, index: number) => {
    const questionErrors = validateQuestion(question, index, {
      expectedOptionCount,
      allowedOptionLetters,
    });
    errors.push(...questionErrors);

    // Reading multiple choice questions must have options and questionText
    if (!question.options) {
      errors.push({
        field: `questions[${index}]`,
        message: "Reading Multiple Choice questions must have options",
        value: question,
      });
    }

    if (!question.questionText) {
      errors.push({
        field: `questions[${index}]`,
        message: "Reading Multiple Choice questions must have questionText",
        value: question,
      });
    }

    if (!Array.isArray(question.options)) {
      errors.push({
        field: `questions[${index}].options`,
        message:
          "Reading Multiple Choice questions must include an options array",
        value: question.options,
      });
    }
  });

  if (
    typeof expectedQuestionCount === "number" &&
    baseData.questions.length !== expectedQuestionCount
  ) {
    errors.push({
      field: "questions",
      message:
        `This task must contain exactly ${expectedQuestionCount} questions`,
      value: baseData.questions.length,
    });
  }

  if (config.enforceNoticeHeadings) {
    const rawText = baseData.mainTextWithPlaceholders;
    if (typeof rawText !== "string") {
      errors.push({
        field: "mainTextWithPlaceholders",
        message:
          'mainTextWithPlaceholders must be a string containing five notices labelled "Notice 1:" through "Notice 5:"',
        value: rawText,
      });
    } else {
      const matches = Array.from(rawText.matchAll(/Notice\s+(\d)\s*:/g));
      const noticeNumbers = matches.map((m) => Number(m[1]));
      const uniqueNotices = new Set(noticeNumbers);

      if (
        noticeNumbers.length !== 5 || uniqueNotices.size !== 5 ||
        ![1, 2, 3, 4, 5].every((n) => uniqueNotices.has(n))
      ) {
        errors.push({
          field: "mainTextWithPlaceholders",
          message:
            'Reading Part 1 must include exactly five notices labelled "Notice 1:" through "Notice 5:"',
          value: rawText,
        });
      }

      const seenNotices = new Set<number>();
      matches.forEach((match, index) => {
        const noticeNumber = Number(match[1]);
        const heading = match[0] ?? "";
        const headingStart = match.index ?? 0;
        const headingEnd = headingStart + heading.length;
        const nextHeadingStart = index + 1 < matches.length
          ? (matches[index + 1].index ?? rawText.length)
          : rawText.length;
        const bodyRaw = rawText
          .slice(headingEnd, nextHeadingStart)
          .replace(/\s+/g, " ")
          .trim();

        seenNotices.add(noticeNumber);

        if (!bodyRaw) {
          errors.push({
            field: `mainTextWithPlaceholders.notice${noticeNumber}`,
            message:
              `Notice ${noticeNumber} must include meaningful text; current value is empty`,
            value: rawText.slice(headingStart, nextHeadingStart),
          });
          return;
        }

        const wordCount = bodyRaw.split(/\s+/).filter(Boolean).length;
        const MIN_WORDS = 4;
        const MAX_WORDS = 60;
        if (wordCount < MIN_WORDS || wordCount > MAX_WORDS) {
          errors.push({
            field: `mainTextWithPlaceholders.notice${noticeNumber}`,
            message:
              `Notice ${noticeNumber} should contain between ${MIN_WORDS} and ${MAX_WORDS} words (found ${wordCount})`,
            value: bodyRaw,
          });
        }

        if (/^Notice\s+\d\s*:$/i.test(bodyRaw)) {
          errors.push({
            field: `mainTextWithPlaceholders.notice${noticeNumber}`,
            message:
              `Notice ${noticeNumber} only repeats the heading and must contain additional content`,
            value: bodyRaw,
          });
        }
      });

      const missingBody = [1, 2, 3, 4, 5].filter((n) => !seenNotices.has(n));
      if (missingBody.length > 0) {
        errors.push({
          field: "mainTextWithPlaceholders",
          message: `Unable to detect text content for notices: ${
            missingBody.join(", ")
          }`,
          value: rawText,
        });
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    data: errors.length === 0
      ? (data as ReadingMultipleChoiceExercise)
      : undefined,
  };
}

/**
 * Validates Gapped Text exercise structure
 */
// Utility: allowed option letters per task
function getAllowedLettersForTask(taskCode: string): string[] {
  if (GAPPED_TEXT_CONFIG[taskCode]) {
    return GAPPED_TEXT_CONFIG[taskCode].allowedLetters;
  }
  if (MULTIPLE_MATCHING_CONFIG[taskCode]) {
    return MULTIPLE_MATCHING_CONFIG[taskCode].allowedLetters;
  }
  return DEFAULT_OPTION_LETTERS;
}

/**
 * Validates Gapped Text exercise structure
 */
export function validateGappedTextResponse(
  data: unknown,
  taskCode: string,
): ValidationResult<GappedTextExercise> {
  const baseValidation = validateBaseExercise(data);
  if (!baseValidation.isValid || !baseValidation.data) {
    return {
      isValid: false,
      errors: baseValidation.errors,
    };
  }

  const baseData = baseValidation.data;
  const errors: ValidationError[] = [];
  // Enforce natural language title (no code-like values)
  validateTitleQuality(baseData.title, taskCode, errors);
  const config = GAPPED_TEXT_CONFIG[taskCode];
  const allowed = config?.allowedLetters ?? getAllowedLettersForTask(taskCode);
  const expectedOptionsCount = config?.expectedOptions;
  const expectedQuestionsCount = config?.expectedQuestions;

  // Check that options array exists
  if (!Array.isArray(baseData.options)) {
    errors.push({
      field: "options",
      message: "Gapped Text exercises must have an options array",
      value: baseData.options,
    });
  } else {
    if (
      typeof expectedOptionsCount === "number" &&
      baseData.options.length !== expectedOptionsCount
    ) {
      errors.push({
        field: "options",
        message:
          `Gapped Text must have exactly ${expectedOptionsCount} options for ${taskCode}`,
        value: baseData.options.length,
      });
    }
    // Validate each option
    baseData.options.forEach((option, index: number) => {
      if (!isRecord(option) || typeof option.letter !== "string") {
        errors.push({
          field: `options[${index}].letter`,
          message: "Option letter is required and must be a string",
          value: isRecord(option) ? option.letter : option,
        });
      }

      if (!isRecord(option) || typeof option.text !== "string") {
        errors.push({
          field: `options[${index}].text`,
          message: "Option text is required and must be a string",
          value: isRecord(option) ? option.text : option,
        });
      }

      // Letter must be in allowed set
      if (isRecord(option) && typeof option.letter === "string") {
        const letter = option.letter.trim().toUpperCase();
        if (!allowed.includes(letter)) {
          errors.push({
            field: `options[${index}].letter`,
            message:
              `Invalid option letter '${option.letter}' for task ${taskCode}`,
            value: option.letter,
          });
        }
      }
    });
    // Check for unique letters
    const letters = baseData.options.map((rawOption) => {
      if (isRecord(rawOption) && typeof rawOption.letter === "string") {
        return rawOption.letter.trim().toUpperCase();
      }
      return String(rawOption);
    });
    const unique = new Set(letters);
    if (letters.length !== unique.size) {
      errors.push({
        field: "options",
        message: "All option letters must be unique",
        value: letters,
      });
    }
  }

  // Validate each question
  baseData.questions.forEach((question, index: number) => {
    const questionErrors = validateQuestion(question, index);
    errors.push(...questionErrors);

    // Gapped text questions must have correctAnswers but not questionText
    if (!question.correctAnswers) {
      errors.push({
        field: `questions[${index}]`,
        message: "Gapped Text questions must have correctAnswers",
        value: question,
      });
    }

    if (question.questionText) {
      errors.push({
        field: `questions[${index}]`,
        message: "Gapped Text questions should not have questionText",
        value: question,
      });
    }

    // Validate correctAnswers letters belong to allowed set
    if (Array.isArray(question.correctAnswers)) {
      question.correctAnswers.forEach((ans, aidx: number) => {
        if (typeof ans !== "string") {
          errors.push({
            field: `questions[${index}].correctAnswers[${aidx}]`,
            message: "Correct answer must be a string letter",
            value: ans,
          });
        } else {
          const letter = ans.trim().toUpperCase();
          if (!allowed.includes(letter)) {
            errors.push({
              field: `questions[${index}].correctAnswers[${aidx}]`,
              message:
                `Invalid correct answer letter '${ans}' for task ${taskCode}`,
              value: ans,
            });
          }
        }
      });
    }
  });

  if (
    typeof expectedQuestionsCount === "number" &&
    baseData.questions.length !== expectedQuestionsCount
  ) {
    errors.push({
      field: "questions",
      message:
        `Gapped Text must include exactly ${expectedQuestionsCount} questions for ${taskCode}`,
      value: baseData.questions.length,
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    data: errors.length === 0 ? (data as GappedTextExercise) : undefined,
  };
}

// Additional title quality check for reading tasks (reject code-like titles)
function validateTitleQuality(
  title: unknown,
  taskCode: string,
  errors: ValidationError[],
) {
  if (typeof title !== "string") return;
  const trimmed = title.trim();
  // Reject if it looks like a task code or all-caps underscore token
  const normalized = trimmed.toUpperCase();
  const looksLikeCode = /^(B2|C1|B1|C2)_[A-Z_]+$/.test(normalized) ||
    /^[A-Z_]{6,}$/.test(normalized) ||
    normalized.includes(taskCode.toUpperCase());
  if (looksLikeCode || trimmed.length < 8 || !/\s/.test(trimmed)) {
    errors.push({
      field: "title",
      message:
        `Title must be a natural language phrase, not a code (task: ${taskCode})`,
      value: title,
    });
  }
}

/**
 * Validates Multiple Matching exercise structure
 */
export function validateMultipleMatchingResponse(
  data: unknown,
  taskCode: string,
): ValidationResult<MultipleMatchingExercise> {
  const baseValidation = validateBaseExercise(data);
  if (!baseValidation.isValid || !baseValidation.data) {
    return {
      isValid: false,
      errors: baseValidation.errors,
    };
  }

  const baseData = baseValidation.data;
  const errors: ValidationError[] = [];
  // Ensure natural-language title for reading parts (avoid code-like titles)
  validateTitleQuality(baseData.title, taskCode, errors);
  const config = MULTIPLE_MATCHING_CONFIG[taskCode];
  const allowed = config?.allowedLetters ?? getAllowedLettersForTask(taskCode);
  const expectedQuestionsCount = config?.expectedQuestions;

  const isContiguousFromA = (letters: string[]): boolean => {
    if (letters.length === 0) return false;
    const normalized = letters.map((letter) => letter.trim().toUpperCase());
    const unique = Array.from(new Set(normalized));
    if (unique.length !== normalized.length) return false;
    const sorted = unique.sort();
    for (let i = 0; i < sorted.length; i++) {
      const expected = String.fromCharCode("A".charCodeAt(0) + i);
      if (sorted[i] !== expected) {
        return false;
      }
    }
    return true;
  };

  // Require and validate global options
  let optionLetters: string[] = [];
  const rawOptions = baseData.options;
  if (!Array.isArray(rawOptions)) {
    errors.push({
      field: "options",
      message:
        "Multiple Matching exercises must include a global options array for sections",
      value: rawOptions,
    });
  } else {
    if (config?.expectedOptions !== undefined) {
      if (rawOptions.length !== config.expectedOptions) {
        errors.push({
          field: "options",
          message:
            `Multiple Matching must have exactly ${config.expectedOptions} options for ${taskCode}`,
          value: rawOptions.length,
        });
      }
    } else {
      if (
        config?.minOptions !== undefined &&
        rawOptions.length < config.minOptions
      ) {
        errors.push({
          field: "options",
          message:
            `Multiple Matching for ${taskCode} requires at least ${config.minOptions} options`,
          value: rawOptions.length,
        });
      }
      if (
        config?.maxOptions !== undefined &&
        rawOptions.length > config.maxOptions
      ) {
        errors.push({
          field: "options",
          message:
            `Multiple Matching for ${taskCode} allows at most ${config.maxOptions} options`,
          value: rawOptions.length,
        });
      }
    }

    const normalizedLetters: string[] = [];
    rawOptions.forEach((opt, idx: number) => {
      if (!isRecord(opt) || typeof opt.letter !== "string") {
        errors.push({
          field: `options[${idx}].letter`,
          message: "Option letter is required and must be a string",
          value: isRecord(opt) ? opt.letter : opt,
        });
      } else {
        const normalized = opt.letter.trim().toUpperCase();
        if (!allowed.includes(normalized)) {
          errors.push({
            field: `options[${idx}].letter`,
            message:
              `Invalid section letter '${opt.letter}' for task ${taskCode}`,
            value: opt.letter,
          });
        }
        normalizedLetters.push(normalized);
      }

      if (!isRecord(opt) || typeof opt.text !== "string") {
        errors.push({
          field: `options[${idx}].text`,
          message: "Option text is required and must be a string",
          value: isRecord(opt) ? opt.text : opt,
        });
      }
    });

    optionLetters = normalizedLetters;
    const unique = new Set(normalizedLetters);
    if (normalizedLetters.length !== unique.size) {
      errors.push({
        field: "options",
        message: "All option letters must be unique",
        value: normalizedLetters,
      });
    }
    if (config?.enforceContiguity && !isContiguousFromA(normalizedLetters)) {
      errors.push({
        field: "options",
        message:
          `Options must form a contiguous block starting at A for ${taskCode}`,
        value: normalizedLetters,
      });
    }
  }

  const optionLetterSet = new Set(optionLetters);

  const mainTextRaw = typeof baseData.mainTextWithPlaceholders === "string"
    ? baseData.mainTextWithPlaceholders
    : "";
  if (mainTextRaw.trim().length === 0) {
    errors.push({
      field: "mainTextWithPlaceholders",
      message:
        "Main text must include an introductory rubric followed by the section texts.",
      value: mainTextRaw,
    });
  }

  const sectionRegex =
    /Section\s+([A-Z])\s*(?:\r?\n)+([\s\S]*?)(?=Section\s+[A-Z]\s*(?:\r?\n)|$)/g;
  const sectionTextMap = new Map<string, string>();
  const normalizedMain = mainTextRaw.replace(/\r/g, "");
  let match: RegExpExecArray | null;
  while ((match = sectionRegex.exec(normalizedMain)) !== null) {
    const letter = match[1]?.trim().toUpperCase();
    if (!letter) continue;
    const text = (match[2] ?? "").trim();
    if (
      !sectionTextMap.has(letter) ||
      text.length > (sectionTextMap.get(letter)?.length ?? 0)
    ) {
      sectionTextMap.set(letter, text);
    }
  }

  if (optionLetters.length > 0) {
    for (const letter of optionLetters) {
      if (!sectionTextMap.has(letter)) {
        errors.push({
          field: "mainTextWithPlaceholders",
          message:
            `Main text must include a clearly headed section for letter ${letter}.`,
          value: mainTextRaw,
        });
      }
    }
  }

  const specDetails = MULTIPLE_MATCHING_COUNTS[taskCode];
  if (specDetails && specDetails.sectionLengthRange) {
    const { minWords, maxWords } = specDetails.sectionLengthRange;
    for (const letter of optionLetters) {
      const text = sectionTextMap.get(letter);
      if (!text) continue;
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      if (wordCount < minWords || wordCount > maxWords) {
        errors.push({
          field: "mainTextWithPlaceholders",
          message:
            `Section ${letter} should be between ${minWords} and ${maxWords} words (found ${wordCount}).`,
          value: text,
        });
      }
    }
  }

  // Validate each question
  baseData.questions.forEach((question, index: number) => {
    const questionErrors = validateQuestion(question, index);
    errors.push(...questionErrors);

    // Multiple matching questions must have correctAnswers and questionText
    if (!question.correctAnswers) {
      errors.push({
        field: `questions[${index}]`,
        message: "Multiple Matching questions must have correctAnswers",
        value: question,
      });
    }

    if (!question.questionText) {
      errors.push({
        field: `questions[${index}]`,
        message: "Multiple Matching questions must have questionText",
        value: question,
      });
    }

    if (
      typeof question.explanation !== "string" ||
      question.explanation.trim().length === 0
    ) {
      errors.push({
        field: `questions[${index}].explanation`,
        message:
          "Multiple Matching questions must include a non-empty explanation",
        value: question.explanation,
      });
    }

    // Validate correctAnswers contain only allowed section letters
    if (Array.isArray(question.correctAnswers)) {
      question.correctAnswers.forEach((ans, aidx: number) => {
        if (typeof ans !== "string") {
          errors.push({
            field: `questions[${index}].correctAnswers[${aidx}]`,
            message: "Correct answer must be a string letter",
            value: ans,
          });
        } else {
          const letter = ans.trim().toUpperCase();
          if (!allowed.includes(letter)) {
            errors.push({
              field: `questions[${index}].correctAnswers[${aidx}]`,
              message:
                `Invalid correct answer letter '${ans}' for task ${taskCode}`,
              value: ans,
            });
          } else if (optionLetters.length > 0 && !optionLetterSet.has(letter)) {
            errors.push({
              field: `questions[${index}].correctAnswers[${aidx}]`,
              message:
                `Correct answer letter '${ans}' not present in options set`,
              value: ans,
            });
          }
        }
      });
    }
  });

  if (
    typeof expectedQuestionsCount === "number" &&
    baseData.questions.length !== expectedQuestionsCount
  ) {
    errors.push({
      field: "questions",
      message:
        `Multiple Matching must include exactly ${expectedQuestionsCount} questions for ${taskCode}`,
      value: baseData.questions.length,
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    data: errors.length === 0 ? (data as MultipleMatchingExercise) : undefined,
  };
}

/**
 * Validates Cross-Text Matching exercise structure
 */
export function validateCrossTextMatchingResponse(
  data: unknown,
): ValidationResult<CrossTextMatchingExercise> {
  const baseValidation = validateBaseExercise(data);
  if (!baseValidation.isValid || !baseValidation.data) {
    return {
      isValid: false,
      errors: baseValidation.errors,
    };
  }

  const baseData = baseValidation.data;
  const errors: ValidationError[] = [];
  // Apply the same title quality rule here (task code fixed for context)
  validateTitleQuality(baseData.title, "C1_READ_CROSS_TEXT", errors);

  // Check that texts array exists
  if (!Array.isArray(baseData.texts)) {
    errors.push({
      field: "texts",
      message: "Cross-Text Matching exercises must have a texts array",
      value: baseData.texts,
    });
  } else {
    // Validate each text
    baseData.texts.forEach((text, index: number) => {
      if (!isRecord(text) || typeof text.letter !== "string") {
        errors.push({
          field: `texts[${index}].letter`,
          message: "Text letter is required and must be a string",
          value: isRecord(text) ? text.letter : text,
        });
      }

      if (!isRecord(text) || typeof text.title !== "string") {
        errors.push({
          field: `texts[${index}].title`,
          message: "Text title is required and must be a string",
          value: isRecord(text) ? text.title : text,
        });
      }

      if (!isRecord(text) || typeof text.content !== "string") {
        errors.push({
          field: `texts[${index}].content`,
          message: "Text content is required and must be a string",
          value: isRecord(text) ? text.content : text,
        });
      }
    });
  }

  // Validate each question
  baseData.questions.forEach((question, index: number) => {
    const questionErrors = validateQuestion(question, index);
    errors.push(...questionErrors);

    // Cross-text matching questions must have correctAnswers and questionText
    if (!question.correctAnswers) {
      errors.push({
        field: `questions[${index}]`,
        message: "Cross-Text Matching questions must have correctAnswers",
        value: question,
      });
    }

    if (!question.questionText) {
      errors.push({
        field: `questions[${index}]`,
        message: "Cross-Text Matching questions must have questionText",
        value: question,
      });
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    data: errors.length === 0 ? (data as CrossTextMatchingExercise) : undefined,
  };
}

/**
 * Main validation function that dispatches to specific validators based on task code
 */
export function validateExerciseResponse(
  data: unknown,
  taskCode: string,
): ValidationResult<RUoEExercise> {
  switch (taskCode) {
    case "B2_LANG_MC_CLOZE":
    case "C1_LANG_MC_CLOZE":
      return validateMCQClozeResponse(data, {
        expectedQuestionCount: 8,
      });
    case "B1_LANG_MC_CLOZE":
      return validateMCQClozeResponse(data, {
        expectedQuestionCount: 6,
      });
    case "C2_LANG_MC_CLOZE":
      return validateMCQClozeResponse(data, {
        expectedQuestionCount: 8,
      });

    case "B2_LANG_OPEN_CLOZE":
    case "C1_LANG_OPEN_CLOZE":
    case "C2_LANG_OPEN_CLOZE":
      return validateOpenClozeResponse(data, {
        expectedQuestionCount: OPEN_CLOZE_EXPECTED_QUESTIONS[taskCode],
      }, taskCode);
    case "B1_LANG_OPEN_CLOZE":
      return validateOpenClozeResponse(data, {
        expectedQuestionCount: OPEN_CLOZE_EXPECTED_QUESTIONS[taskCode],
      }, taskCode);

    case "B2_LANG_WORD_FORMATION":
    case "C1_LANG_WORD_FORMATION":
      return validateWordFormationResponse(data);
    case "C2_LANG_WORD_FORMATION":
      return validateWordFormationResponse(data);

    case "B2_LANG_TRANSFORMATION":
    case "C1_LANG_TRANSFORMATION":
      return validateKeyWordTransformationResponse(data);
    case "C2_LANG_TRANSFORMATION":
      return validateKeyWordTransformationResponse(data);

    case "B2_READ_MCQ":
    case "C1_READ_MCQ":
      return validateReadingMultipleChoiceResponse(data, {
        expectedQuestionCount: 6,
      });
    case "B1_READ_MCQ_SHORT":
      return validateReadingMultipleChoiceResponse(data, {
        expectedOptionCount: 3,
        allowedOptionLetters: ["A", "B", "C"],
        expectedQuestionCount: 5,
        enforceNoticeHeadings: true,
      });
    case "B1_READ_MCQ_LONG":
      return validateReadingMultipleChoiceResponse(data, {
        expectedQuestionCount: 5,
      });
    case "C2_READ_MCQ":
      return validateReadingMultipleChoiceResponse(data, {
        expectedQuestionCount: 6,
      });

    case "B2_READ_GAPPED_TEXT":
    case "C1_READ_GAPPED_TEXT":
      return validateGappedTextResponse(data, taskCode);
    case "B1_READ_GAPPED_TEXT":
      return validateGappedTextResponse(data, taskCode);
    case "C2_READ_GAPPED_TEXT":
      return validateGappedTextResponse(data, taskCode);

    case "B2_READ_MULTIPLE_MATCHING":
    case "C1_READ_MULTIPLE_MATCHING":
      return validateMultipleMatchingResponse(data, taskCode);
    case "B1_READ_MULTIPLE_MATCHING":
      return validateMultipleMatchingResponse(data, taskCode);
    case "C2_READ_MULTIPLE_MATCHING":
      return validateMultipleMatchingResponse(data, taskCode);

    case "C1_READ_CROSS_TEXT":
      return validateCrossTextMatchingResponse(data);

    default:
      return {
        isValid: false,
        errors: [{
          field: "taskCode",
          message: `Unsupported task code: ${taskCode}`,
          value: taskCode,
        }],
      };
  }
}
