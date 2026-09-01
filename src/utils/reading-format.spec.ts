import { describe, expect, it } from 'vitest';
import { normalizeReadingHeadings } from './reading-format';

describe('normalizeReadingHeadings', () => {
  it('escapes raw HTML while preserving strong formatting', () => {
    const html = normalizeReadingHeadings('Hello <img src=x onerror=alert(1)> **bold**', 'B2_READ_MCQ');

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('escapes raw HTML inside strong formatting', () => {
    const html = normalizeReadingHeadings(
      '**</strong><script>alert(1)</script><strong>**',
      'B2_READ_MCQ',
    );

    expect(html).toContain(
      '<strong>&lt;/strong&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;strong&gt;</strong>',
    );
    expect(html).not.toContain('<script>');
  });

  it('keeps GAP tokens for post-processing', () => {
    const html = normalizeReadingHeadings('Gap here {{GAP_1}}', 'B2_READ_GAPPED_TEXT');

    expect(html).toContain('{{GAP_1}}');
  });
});
