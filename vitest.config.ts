import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/**/*.ts'
      ],
      exclude: [
        'src/__tests__/**',
        'src/index.ts',
        'src/types/**',
        'dist/**',
        'node_modules/**'
      ],
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: 'coverage'
    },
    testTimeout: 10000,
    hookTimeout: 10000
  }
});