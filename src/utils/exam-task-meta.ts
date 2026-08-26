import { ALL_RUOE_TASK_CODES } from '@/config/ruoeFunctionMap';

export type ExamSkill = 'writing' | 'ruoe';

export interface ExamTaskMeta {
  skill: ExamSkill;
  skillLabel: string;
  sectionLabel: string;
  partKey: string | null;
  partNumber: number | null;
  partLabel: string | null;
  formatLabel: string | null;
}

const NORMALIZED_RUOE_CODES: ReadonlySet<string> = new Set(
  ALL_RUOE_TASK_CODES.map((code) => normalizeTaskCode(code)),
);

const RUOE_CODE_PATTERN = /(?:^|_)(?:UOE|READ)(?:_|$)/;
const RUOE_NAME_PATTERNS: ReadonlyArray<RegExp> = [
  /r&uo?e/i,
  /reading\s*(?:&|and)\s*use\s+of\s+english/i,
  /use\s+of\s+english/i,
];

function normalizeTaskCode(taskCode: string): string {
  return taskCode
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
    .replace(/__+/g, '_');
}

export function isRuoeTaskCode(taskCode?: string | null): boolean {
  if (!taskCode) return false;
  const normalized = normalizeTaskCode(taskCode);
  if (NORMALIZED_RUOE_CODES.has(normalized)) return true;
  return RUOE_CODE_PATTERN.test(normalized);
}

export function isRuoeTask(taskCode?: string | null, taskTypeName?: string | null): boolean {
  if (isRuoeTaskCode(taskCode)) return true;
  if (!taskTypeName) return false;
  const name = taskTypeName.toLowerCase();
  return RUOE_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

function extractPartInfo(taskCode: string): { partKey: string | null; partNumber: number | null; partLabel: string | null } {
  const partMatch = taskCode.match(/_(P|T)(\d+)/i);
  if (!partMatch) {
    return { partKey: null, partNumber: null, partLabel: null };
  }

  const [, prefix, numberStr] = partMatch;
  const num = Number.parseInt(numberStr, 10);
  if (Number.isNaN(num)) {
    return { partKey: null, partNumber: null, partLabel: null };
  }

  const upperPrefix = prefix.toUpperCase();
  const labelPrefix = upperPrefix === 'T' ? 'Task' : 'Part';
  return {
    partKey: `${upperPrefix}${num}`,
    partNumber: num,
    partLabel: `${labelPrefix} ${num}`,
  };
}

function normalizeFormatLabel(taskTypeName?: string | null): string | null {
  if (!taskTypeName) return null;
  const [, afterColon] = taskTypeName.split(/:\s*/, 2);
  const base = afterColon ?? taskTypeName;
  const cleaned = base.replace(/\([^)]*\)/g, '').trim();
  if (!cleaned) return null;
  // Normalize capitalization (sentence case)
  return cleaned
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .replace(/\s+/g, ' ');
}

function resolveSection(skill: ExamSkill, taskCode: string | null, taskTypeName?: string | null): string {
  if (skill === 'writing') return 'Writing';
  if (taskCode) {
    if (/_READ_/i.test(taskCode)) return 'Reading';
    if (/_(?:LANG|UOE)_/i.test(taskCode)) return 'Language Use';
  }

  if (taskTypeName) {
    const lower = taskTypeName.toLowerCase();
    if (/(?:language\s+use|use\s+of\s+english)/.test(lower)) return 'Language Use';
    if (/reading/.test(lower)) return 'Reading';
  }

  return 'Reading and Language Use';
}

export function getExamTaskMeta(taskCode?: string | null, taskTypeName?: string | null): ExamTaskMeta {
  if (!taskCode) {
    return {
      skill: 'writing',
      skillLabel: 'Writing',
      sectionLabel: 'Writing',
      partKey: null,
      partNumber: null,
      partLabel: null,
      formatLabel: normalizeFormatLabel(taskTypeName),
    };
  }

  const normalizedCode = normalizeTaskCode(taskCode);
  const skill: ExamSkill = isRuoeTask(taskCode, taskTypeName) ? 'ruoe' : 'writing';
  const skillLabel = skill === 'writing' ? 'Writing' : 'Reading and Language Use';
  const sectionLabel = resolveSection(skill, normalizedCode, taskTypeName);
  const { partKey, partNumber, partLabel } = extractPartInfo(normalizedCode);
  const formatLabel = normalizeFormatLabel(taskTypeName);

  return {
    skill,
    skillLabel,
    sectionLabel,
    partKey,
    partNumber,
    partLabel,
    formatLabel,
  };
}
