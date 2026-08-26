/// <reference types="vitest/globals" />

import 'vitest';

declare module 'vitest' {
  interface Assertion<T> {
    toBeInTheDocument(): void;
    toBeDisabled(): void;
    toHaveTextContent(
      text: string | RegExp,
      options?: {
        normalizeWhitespace?: boolean;
      },
    ): void;
  }

  interface AsymmetricMatchersContaining {
    toBeInTheDocument(): void;
    toBeDisabled(): void;
    toHaveTextContent(
      text: string | RegExp,
      options?: {
        normalizeWhitespace?: boolean;
      },
    ): void;
  }
}
