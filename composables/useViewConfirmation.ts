import type { Ref } from 'vue';

/** As much of a failed request as the denial page reads: the error body. */
interface RequestError {
  data?: unknown
}

/**
 * Spends the view the visitor confirmed on the access page. Posting to the URL
 * the preview came from answers with the player, which then replaces the
 * preview — while a reload of the page asks again rather than spending again.
 */
export function useViewConfirmation<T>(url: () => string, access: Ref<T | undefined>) {
  const confirming = ref(false);
  const error = ref<RequestError | null>(null);

  async function confirm() {
    confirming.value = true;
    try {
      access.value = await $fetch(url(), { method: 'POST' }) as T;
    }
    catch (caught) {
      error.value = caught as RequestError;
      access.value = undefined;
    }
    finally {
      confirming.value = false;
    }
  }

  return { confirming, error, confirm };
}
