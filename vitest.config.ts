import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/affinity/types.ts'], // type declarations only — no executable code
      reporter: ['text', 'lcov'],
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 95,
        lines: 95,
      },
    },
  },
  resolve: {
    // Resolve .js imports to .ts source files (Workers/ESM convention)
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
  },
});
