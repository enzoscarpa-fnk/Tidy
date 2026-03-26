import { defineVitestConfig } from '@nuxt/test-utils/config'
import { resolve } from 'path'

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    environmentOptions: {
      nuxt: {
        rootDir: '.',
      },
    },
    include: ['tests/**/*.{test,nuxt.test}.ts'],
    tsconfig: './tests/tsconfig.json',
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, 'app'),
      '@': resolve(__dirname, 'app'),
    },
  },
})
