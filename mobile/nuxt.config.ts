export default defineNuxtConfig({
  future: {
    compatibilityVersion: 4,
  },

  devServer: {
    port: 3001,
  },

  ssr: false,

  app: {
    baseURL: '/',
    head: {
      title: 'Tidy',
      meta: [
        { charset: 'utf-8' },
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1, viewport-fit=cover',
        },
      ],
    },
  },

  modules: [
    '@nuxtjs/tailwindcss',
    '@pinia/nuxt',
    '@vueuse/nuxt',
  ],

  css: ['~/assets/css/components.css'],

  runtimeConfig: {
    public: {
      apiBaseUrl: 'http://localhost:3000/api/v1',
    },
  },

  typescript: {
    strict: true,
    typeCheck: true,
  },

  imports: {
    autoImport: true,
  },

  devtools: { enabled: false },
})
