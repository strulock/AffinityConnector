import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: true,
  },
  resolve: {
    // Resolve .js imports to .ts source files (Workers/ESM convention)
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
  },
});
