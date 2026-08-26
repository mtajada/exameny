import { describe, expect, it } from 'vitest';
import { escapeHtml } from './html';

describe('escapeHtml', () => {
  it('escapes angle brackets and ampersands', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes quotes and apostrophes', () => {
    expect(escapeHtml('Tom & "Jerry"\'s <b>Adventure</b>'))
      .toBe('Tom &amp; &quot;Jerry&quot;&#39;s &lt;b&gt;Adventure&lt;/b&gt;');
  });
});
