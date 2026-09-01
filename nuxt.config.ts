// https://nuxt.com/docs/api/configuration/nuxt-config

export default defineNuxtConfig({
  compatibilityDate: '2025-01-27',
  devtools: { enabled: true },
  telemetry: false,
  ssr: false,
  runtimeConfig: {
    // Empty on purpose: a deployment must set `NUXT_ADMIN_PASSWORD`, and until
    // it does every login is refused. Only `$development` fills in a default,
    // so no built image can ever carry a password someone else knows.
    adminPassword: '',
    vimeoApiToken: '',
    public: {
      // Where a visitor whose access has ended asks for a new link. Empty
      // means no address is published, so the token page offers no mail link.
      supportEmail: '',
      // White-label theme, applied by `plugins/theme.ts`. Every value is
      // set per deployment through `NUXT_PUBLIC_THEME_*`; see `docs/theming.md`.
      theme: {
        title: 'Media Access Manager',
        // The deployment's own site, linked from an icon next to the brand
        // in the header. Empty publishes no such link.
        url: '',
        logo: '',
        logoDark: '',
        logoHeight: '2rem',
        favicon: '',
        colors: {
          primary: '',
          secondary: '',
          success: '',
          info: '',
          warning: '',
          error: '',
          neutral: '',
        },
        radius: '',
        spacing: '',
        container: '',
        // Who runs this deployment. A `url` publishes a footer link – company
        // page, imprint – that visitors see too, because the branded surface
        // is theirs. `name` labels it and falls back to `title`.
        provider: {
          name: '',
          url: '',
        },
      },
    },
    session: {
      name: 'mam-session',
      // Seals the admin session cookie; set through `NUXT_SESSION_PASSWORD`
      // (at least 32 characters). Empty here for the same reason as
      // `adminPassword` above.
      password: '',
    },
  },
  // Development-only credentials, so `pnpm dev` needs no `.env` while a
  // production build ships without a usable default for either secret.
  $development: {
    runtimeConfig: {
      adminPassword: 'password',
      session: {
        password: 'my-secret-password-with-min-32-characters',
      },
    },
  },
  modules: ['@nuxt/ui', '@nuxtjs/i18n', 'nuxt-auth-utils'],
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      // Only the shell title; `plugins/theme.ts` replaces it with the
      // configured company name as soon as the app boots.
      title: 'Media Access Manager',
      charset: 'utf-8',
      viewport: 'width=device-width, initial-scale=1',
    },
  },
  typescript: {
    strict: true,
  },
  i18n: {
    locales: [
      { code: 'en', file: 'en.json' },
      { code: 'de', file: 'de.json' },
    ],
    strategy: 'no_prefix',
    defaultLocale: 'en',
  },
});
