// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  modules: [
    '@pinia/nuxt',
    '@vueuse/nuxt',
    'nuxt-auth-utils',
  ],
  css: ['~/assets/css/main.css'],
  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  },
  runtimeConfig: {
    sessionPassword: '',       // set via NUXT_SESSION_PASSWORD in .env
    geminiApiKey: '',          // set via NUXT_GEMINI_API_KEY in .env
    openrouterApiKey: '',      // set via NUXT_OPENROUTER_API_KEY in .env
    resendApiKey: '',          // set via NUXT_RESEND_API_KEY in .env
    fromEmail: 'noreply@chat-tree.app',  // set via NUXT_FROM_EMAIL in .env
    public: {
      appName: 'Dendro',
    },
  },
  nitro: {
    experimental: {
      asyncContext: true,
    },
  },
})
