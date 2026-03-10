import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals:      true,
    environment:  'node',
    include:      ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    setupFiles:   ['./src/test/setup.ts'],
    env: {
      NODE_ENV:   'test',
      JWT_SECRET: 'test-secret-min-32-chars-for-hs256!!',

      // DB (fictif pour tests unitaires)
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',

      // Requis par MistralOcrAdapter.fromEnv() (appelé dans processingPlugin)
      MISTRAL_API_KEY: 'test-mistral-key',

      // Requis par S3ServiceAdapter.fromEnv() (appelé dans processingPlugin)
      AWS_REGION:            'eu-west-1',
      AWS_ACCESS_KEY_ID:     'test-access-key',
      AWS_SECRET_ACCESS_KEY: 'test-secret-key',
      AWS_BUCKET:            'test-bucket',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include:  ['src/**/*.ts'],
      exclude: [
        'src/server.ts',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
      ],
      thresholds: {
        lines:     70,
        functions: 70,
        branches:  70,
      },
    },
  },
});
