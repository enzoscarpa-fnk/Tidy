import type { Config } from 'tailwindcss'

export default {
  content: [
    './components/**/*.{vue,js,ts}',
    './composables/**/*.{js,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './plugins/**/*.{js,ts}',
    './app.vue',
  ],
  theme: {
    extend: {
      colors: {
        'tidy-primary': {
          DEFAULT: '#4F6EF7',
          light: '#7B93FA',
          dark: '#3554E0',
        },
        'tidy-surface': {
          DEFAULT: '#F8F9FB',
          card: '#FFFFFF',
          overlay: '#F0F2F6',
        },
        'tidy-border': {
          DEFAULT: '#E4E7EE',
          strong: '#C9CDD8',
        },
        'tidy-text': {
          primary: '#1A1D2E',
          secondary: '#6B7280',
          tertiary: '#9CA3AF',
          inverse: '#FFFFFF',
        },
        'tidy-status': {
          processing: '#3B82F6',
          success: '#10B981',
          warning: '#F59E0B',
          error: '#EF4444',
          archived: '#9CA3AF',
        },
      },
      animation: {
        'status-pulse': 'statusPulse 2s ease-in-out infinite',
      },
      keyframes: {
        statusPulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
