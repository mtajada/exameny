import { isGappedTextTask, isMultipleMatchingTask } from '@/types/ruoe';
import { escapeHtml } from '@/utils/html';

const LINE_ENDING_PATTERN = /\r\n?/g;
const DOUBLE_STRONG_PATTERN = /\*\*(.*?)\*\*/g;
const HTML_TAG_PATTERN = /<[^>]+>/g;
const DOUBLE_NEWLINE_PATTERN = /\n{2,}/;
const ANY_NEWLINE_PATTERN = /\n+/;
const ANY_NEWLINE_GLOBAL_PATTERN = /\n+/g;
const SENTENCE_ENDING_PATTERN = /[.?!]/;

const CROSS_TEXT_HEADING_PATTERN = /^(?:\*\*)?Text\s+([A-D])(?:\*\*)?\s*[—–:-].*$/gm;
const CROSS_TEXT_BOLD_PATTERN = /^(?:\*\*)?(Text\s+[A-D])(?:\*\*)$/gm;
const MULTIPLE_MATCHING_HEADING_PATTERN = /^(?:\*\*)?Section\s+([A-Z])(?:\*\*)?\s*[—–:-]\s*(.*)$/gm;
const MULTIPLE_MATCHING_BOLD_PATTERN = /^(?:\*\*)?(Section\s+[A-Z])(?:\*\*)$/gm;
const MULTIPLE_MATCHING_RUBRIC_PATTERN = /\b(?:you are going to read|for questions?\s*\d|choose\s+the\s+[a-z]+)/i;

const TEXT_HEADING_ONLY_PATTERN = /^(?:<strong>)?Text\s+([A-D])(?:<\/strong>)?$/;
const SECTION_HEADING_ONLY_PATTERN = /^(?:<strong>)?Section\s+([A-Z])(?:<\/strong>)?$/;
const NOTICE_HEADING_ONLY_PATTERN = /^(?:<strong>)?Notice\s+([1-9])(?:<\/strong>)?$/;
const SECTION_WITH_REMAINDER_PATTERN = /^(?:<strong>)?Section\s+([A-Z])(?:<\/strong>)?(?:\s*[—–:-]\s*)?([\s\S]*)$/;
const NOTICE_WITH_REMAINDER_PATTERN = /^(?:<strong>)?Notice\s+([1-9])(?:<\/strong>)?(?:\s*[—–:-]\s*)?([\s\S]*)$/;

const trimTrailingSentencePunctuation = (value: string): string => value.replace(/[.?!]+$/, '').trim();

const cleanupUnbalancedDoubleStrong = (value: string): string => {
  if (!value) return value;
  const doubleStrongMatches = value.match(/\*\*/g);
  if (!doubleStrongMatches || doubleStrongMatches.length % 2 === 0) {
    return value;
  }

  if (/\*\*$/.test(value)) {
    return value.replace(/\*\*$/, '').trimEnd();
  }

  if (/^\*\*/.test(value)) {
    return value.replace(/^\*\*/, '').trimStart();
  }

  return value;
};

const isLikelyTitle = (text: string, options?: { allowNumbers?: boolean }): boolean => {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (!options?.allowNumbers && /\d/.test(trimmed)) return false;
  if (trimmed.length > 60) return false;
  const wordCount = trimmed.split(/\s+/).length;
  return wordCount <= 8;
};

const stripHtml = (value: string): string => value.replace(HTML_TAG_PATTERN, '').trim();

const applyStrongFormatting = (value: string): string =>
  escapeHtml(value).replace(DOUBLE_STRONG_PATTERN, '<strong>$1</strong>');

const deriveHeadingAndBody = (raw: string): { heading?: string; body: string } => {
  const lines = raw
    .replace(/\r/g, '')
    .split(ANY_NEWLINE_PATTERN)
    .map(line => cleanupUnbalancedDoubleStrong(line.trim()))
    .filter(Boolean);

  if (lines.length === 0) {
    return { body: '' };
  }

  const [firstLine, ...remainingLines] = lines;
  const firstLinePlain = stripHtml(firstLine);

  if (isLikelyTitle(firstLinePlain, { allowNumbers: true }) && remainingLines.length > 0) {
    return {
      heading: trimTrailingSentencePunctuation(firstLinePlain),
      body: cleanupUnbalancedDoubleStrong(remainingLines.join(' ').trim()),
    };
  }

  if (remainingLines.length > 0) {
    return {
      body: cleanupUnbalancedDoubleStrong([firstLine, ...remainingLines].join(' ').trim()),
    };
  }

  const punctuationIndex = firstLinePlain.search(SENTENCE_ENDING_PATTERN);
  const punctuationRawIndex = firstLine.search(SENTENCE_ENDING_PATTERN);

  if (punctuationIndex > -1 && punctuationRawIndex > -1) {
    const headingCandidate = firstLinePlain.slice(0, punctuationIndex).trim();
    const bodyCandidateRaw = cleanupUnbalancedDoubleStrong(firstLine.slice(punctuationRawIndex + 1).trim());
    const bodyCandidatePlain = stripHtml(bodyCandidateRaw);

    if (isLikelyTitle(headingCandidate, { allowNumbers: true }) && bodyCandidatePlain) {
      return {
        heading: headingCandidate,
        body: bodyCandidateRaw,
      };
    }
  }

  return {
    body: firstLine,
  };
};

const applyCrossTextNormalization = (text: string): string => text
  .replace(CROSS_TEXT_HEADING_PATTERN, 'Text $1')
  .replace(CROSS_TEXT_BOLD_PATTERN, '$1');

const normalizeMultipleMatchingHeadings = (text: string): string => text
  .replace(MULTIPLE_MATCHING_HEADING_PATTERN, (_match, letter: string, remainder: string) => {
    const trimmedRemainder = cleanupUnbalancedDoubleStrong((remainder || '').trim());
    if (!trimmedRemainder) {
      return `Section ${letter}`;
    }
    return `Section ${letter}\n${trimmedRemainder}`;
  })
  .replace(MULTIPLE_MATCHING_BOLD_PATTERN, '$1');

const stripLeadingMultipleMatchingIntro = (text: string): string => {
  const trimmed = text.trimStart();
  if (!trimmed) {
    return trimmed;
  }

  const firstSectionIndex = trimmed.search(/Section\s+[A-Z]/);
  if (firstSectionIndex > 0) {
    return trimmed.slice(firstSectionIndex);
  }

  const paragraphs = trimmed.split(/\n{2,}/).filter(Boolean);
  while (paragraphs.length > 0) {
    const candidate = paragraphs[0].trim();
    if (!candidate) {
      paragraphs.shift();
      continue;
    }
    if (MULTIPLE_MATCHING_RUBRIC_PATTERN.test(candidate)) {
      paragraphs.shift();
      continue;
    }
    break;
  }

  return paragraphs.join('\n\n').trimStart();
};

const splitIntoBlocks = (text: string, { treatSingleNewlinesAsBreaks }: { treatSingleNewlinesAsBreaks: boolean }): string[] => {
  const primaryBlocks = text
    .split(DOUBLE_NEWLINE_PATTERN)
    .map(block => block.trim())
    .filter(Boolean);

  if (!treatSingleNewlinesAsBreaks || primaryBlocks.length > 1 || !ANY_NEWLINE_PATTERN.test(text)) {
    return primaryBlocks;
  }

  return text
    .split(ANY_NEWLINE_PATTERN)
    .map(block => block.trim())
    .filter(Boolean);
};

const renderBlock = (block: string, { gappedText }: { gappedText: boolean }): string => {
  const rawContentWithStrong = block.replace(DOUBLE_STRONG_PATTERN, '<strong>$1</strong>');
  const contentWithStrong = applyStrongFormatting(block);

  const textHeadingOnly = TEXT_HEADING_ONLY_PATTERN.exec(rawContentWithStrong);
  if (textHeadingOnly) {
    return `<p><strong>Text ${textHeadingOnly[1]}</strong></p>`;
  }

  const sectionHeadingOnly = SECTION_HEADING_ONLY_PATTERN.exec(rawContentWithStrong);
  if (sectionHeadingOnly) {
    return `<p><strong>Section ${sectionHeadingOnly[1]}</strong></p>`;
  }

  const noticeHeadingOnly = NOTICE_HEADING_ONLY_PATTERN.exec(rawContentWithStrong);
  if (noticeHeadingOnly) {
    return `<p><strong>Notice ${noticeHeadingOnly[1]}</strong></p>`;
  }

  const sectionWithRemainder = SECTION_WITH_REMAINDER_PATTERN.exec(rawContentWithStrong);
  if (sectionWithRemainder) {
    const letter = sectionWithRemainder[1];
    const remainderRaw = sectionWithRemainder[2] || '';
    const { heading, body } = deriveHeadingAndBody(remainderRaw);
    const headingHtml = heading
      ? `<p><strong>Section ${letter}: ${escapeHtml(heading)}</strong></p>`
      : `<p><strong>Section ${letter}</strong></p>`;
    const bodyContent = body
      ? `<p>${applyStrongFormatting(body).replace(ANY_NEWLINE_GLOBAL_PATTERN, ' ').trim()}</p>`
      : '';
    return headingHtml + bodyContent;
  }

  const noticeWithRemainder = NOTICE_WITH_REMAINDER_PATTERN.exec(rawContentWithStrong);
  if (noticeWithRemainder) {
    const number = noticeWithRemainder[1];
    const remainderRaw = noticeWithRemainder[2] || '';
    const { heading, body } = deriveHeadingAndBody(remainderRaw);
    const headingHtml = heading
      ? `<p><strong>Notice ${number}: ${escapeHtml(heading)}</strong></p>`
      : `<p><strong>Notice ${number}</strong></p>`;
    const bodyContent = body
      ? `<p>${applyStrongFormatting(body).replace(ANY_NEWLINE_GLOBAL_PATTERN, ' ').trim()}</p>`
      : '';
    return headingHtml + bodyContent;
  }

  const collapsedContent = gappedText
    ? contentWithStrong.replace(ANY_NEWLINE_GLOBAL_PATTERN, '<br/>')
    : contentWithStrong.replace(ANY_NEWLINE_GLOBAL_PATTERN, ' ');

  return `<p>${collapsedContent}</p>`;
};

export function normalizeReadingHeadings(rawContent: string, taskCode: string): string {
  let text = (rawContent || '').replace(LINE_ENDING_PATTERN, '\n');

  // Hide internal question anchor tokens such as {{Q_1}} or {{Q1}} that
  // may be present in AI-generated content for Reading MCQ tasks.
  // These markers are metadata for question mapping and should never be shown.
  // Do not touch {{GAP_n}} which are interactive placeholders for other tasks.
  text = text.replace(/\{\{\s*Q_?\d+\s*\}\}/g, '');

  const normalizedCode = (taskCode || '').toUpperCase();

  if (normalizedCode === 'C1_READ_CROSS_TEXT') {
    text = applyCrossTextNormalization(text);
  }

  if (isMultipleMatchingTask(normalizedCode)) {
    text = normalizeMultipleMatchingHeadings(stripLeadingMultipleMatchingIntro(text));
  }

  const gappedText = isGappedTextTask(normalizedCode);
  const blocks = splitIntoBlocks(text, { treatSingleNewlinesAsBreaks: gappedText });

  return blocks.map(block => renderBlock(block, { gappedText })).join('');
}
