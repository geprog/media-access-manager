import type { LocaleMessages } from './purchase';

/**
 * What a deployment configures for buying access, and what Nitro serves the
 * server for it. Kept apart from the payment service so its tests can stand
 * in for the deployment without a running Nuxt app.
 */

/** The Mollie API key, empty while purchasing is off, and the API root the tests redirect. */
export function getMollieSettings(): { apiKey: string, apiEndpoint: string } {
  const { apiKey, apiEndpoint } = useRuntimeConfig().mollie;
  return { apiKey, apiEndpoint };
}

export function getPaymentCurrency(): string {
  return useRuntimeConfig().public.payment.currency || 'EUR';
}

/** Only plain language codes: the code comes from the request and names a file. */
const LOCALE_CODE = /^[a-z]{2,3}(?:-[a-z]{2,4})?$/i;

/**
 * The app's translations for a language, `null` for one it lacks. Read from
 * the translation files as Nitro server assets, see `nuxt.config.ts`.
 */
export async function loadLocaleMessages(locale: string): Promise<LocaleMessages> {
  if (!LOCALE_CODE.test(locale)) {
    return null;
  }
  return useStorage('assets:locales').getItem<Record<string, unknown>>(`${locale}.json`);
}
