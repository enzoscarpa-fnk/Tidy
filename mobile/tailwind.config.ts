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
        // ── Anciens tokens conservés pour non-régression ──────────────────
        'tidy-primary': {
          DEFAULT: '#4F6EF7',
          light: '#7B93FA',
          dark: '#3554E0',
        },

        // ── Nouveau design system dark ────────────────────────────────────
        // Orange = actions primaires, FAB, CTA
        'tidy-orange': {
          DEFAULT: '#F97316',
          light:   '#FB923C',
          dark:    '#EA6100',
          glow:    '#F9731640',  // halo/aura (25% opacité)
        },
        // Mauve = accents secondaires, liens, hiérarchie intermédiaire
        'tidy-mauve': {
          DEFAULT: '#A78BFA',
          light:   '#C4B5FD',
          dark:    '#7C3AED',
          glow:    '#A78BFA30',
        },

        // ── Surfaces dark ─────────────────────────────────────────────────
        'tidy-surface': {
          DEFAULT:  '#0D0D14',   // background global
          card:     '#13131F',   // cartes/blocs
          overlay:  '#1A1A2E',   // hover states, overlays légers
          glass:    '#FFFFFF08', // fond glassmorphism (blanc très transparent)
        },

        // ── Bordures ──────────────────────────────────────────────────────
        'tidy-border': {
          DEFAULT: '#2A2A3E',
          strong:  '#3D3D5C',
          glass:   '#FFFFFF14', // bordure glassmorphism
        },

        // ── Texte ─────────────────────────────────────────────────────────
        'tidy-text': {
          primary:   '#F1F0FF',
          secondary: '#8B8AA8',
          tertiary:  '#55546A',
          inverse:   '#0D0D14',
        },

        // ── Statuts document (inchangés — bulles colorées) ────────────────
        'tidy-status': {
          processing: '#3B82F6',
          success:    '#10B981',
          warning:    '#F59E0B',
          error:      '#EF4444',
          archived:   '#9CA3AF',
        },
      },

      // ── Animations ───────────────────────────────────────────────────────
      animation: {
        'status-pulse':  'statusPulse 2s ease-in-out infinite',
        'fab-glow':      'fabGlow 2.5s ease-in-out infinite',
        'fab-sparkle':   'fabSparkle 3s ease-in-out infinite',
        'fab-sparkle-2': 'fabSparkle 3s ease-in-out 1s infinite',
        'fab-sparkle-3': 'fabSparkle 3s ease-in-out 2s infinite',
        'search-dim':    'searchDim 0.2s ease forwards',
      },
      keyframes: {
        statusPulse: {
          '0%, 100%': { opacity: '1' },
          '50%':       { opacity: '0.4' },
        },
        fabGlow: {
          '0%, 100%': { boxShadow: '0 0 18px 6px #F9731640, 0 0 40px 10px #F9731620' },
          '50%':      { boxShadow: '0 0 28px 10px #F9731660, 0 0 60px 16px #F9731630' },
        },
        fabSparkle: {
          '0%':   { opacity: '0', transform: 'scale(0) translateY(0)' },
          '30%':  { opacity: '1', transform: 'scale(1) translateY(-4px)' },
          '70%':  { opacity: '0.6', transform: 'scale(0.8) translateY(-8px)' },
          '100%': { opacity: '0', transform: 'scale(0) translateY(-14px)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
