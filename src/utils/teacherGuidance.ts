const CONTROL_CHAR_RANGE = '\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F'
const CONTROL_CHAR_REGEX = new RegExp(`[${CONTROL_CHAR_RANGE}]`, 'g')

export const TEACHER_GUIDANCE_MAX_LENGTH = 200

export interface SanitizedGuidanceField {
  value: string | null
  rawLength: number
  trimmedLength: number
  removedControlCharacters: boolean
  wasTruncated: boolean
}

export interface PreparedTeacherGuidance {
  theme: string | null
  skillFocus: string | null
  sanitizedTheme: SanitizedGuidanceField
  sanitizedSkillFocus: SanitizedGuidanceField
}

export function sanitizeGuidanceField(input: unknown): SanitizedGuidanceField {
  if (typeof input !== 'string') {
    return {
      value: null,
      rawLength: 0,
      trimmedLength: 0,
      removedControlCharacters: false,
      wasTruncated: false,
    }
  }

  const rawLength = input.length
  const stripped = input.replace(CONTROL_CHAR_REGEX, '')
  const removedChars = stripped.length !== rawLength
  const trimmed = stripped.trim()

  const trimmedLength = trimmed.length
  const truncated = trimmedLength > TEACHER_GUIDANCE_MAX_LENGTH
  return {
    value: trimmed.length > 0 ? trimmed.slice(0, TEACHER_GUIDANCE_MAX_LENGTH) : null,
    rawLength,
    trimmedLength,
    removedControlCharacters: removedChars,
    wasTruncated: truncated,
  }
}

export function prepareTeacherGuidance(themeInput: unknown, skillFocusInput: unknown): PreparedTeacherGuidance {
  const sanitizedTheme = sanitizeGuidanceField(themeInput)
  const sanitizedSkillFocus = sanitizeGuidanceField(skillFocusInput)

  return {
    sanitizedTheme,
    sanitizedSkillFocus,
    theme: sanitizedTheme.value,
    skillFocus: sanitizedSkillFocus.value,
  }
}
