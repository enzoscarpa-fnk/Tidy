import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    env: {
      NODE_ENV:   'test',
      AWS_REGION:            'us-east-1',
      AWS_ACCESS_KEY_ID:     'test-key-id',
      AWS_SECRET_ACCESS_KEY: 'test-secret',
      AWS_BUCKET:            'test-bucket',
      MISTRAL_API_KEY:       'test-mistral-key',
      JWT_SECRET: 'test-secret-min-32-chars-for-hs256!!',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test', // fictif pour tests unitaires
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/server.ts',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
      },
    },
  },
});
