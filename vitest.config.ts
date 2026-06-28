import { defineConfig } from 'vitest/config';

// Engine tests are pure and headless — no browser environment needed.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
