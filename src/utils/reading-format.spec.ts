import { describe, expect, it } from 'vitest';
import { normalizeReadingHeadings } from './reading-format';

describe('normalizeReadingHeadings', () => {
  it('escapes raw HTML while preserving strong formatting', () => {
    const html = normalizeReadingHeadings('Hello <img src=x onerror=alert(1)> **bold**', 'B2_READ_MCQ');

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('keeps GAP tokens for post-processing', () => {
    const html = normalizeReadingHeadings('Gap here {{GAP_1}}', 'B2_READ_GAPPED_TEXT');

    expect(html).toContain('{{GAP_1}}');
  });
});
