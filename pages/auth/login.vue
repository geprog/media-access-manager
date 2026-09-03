<template>
  <div class="flex min-h-screen flex-col">
    <main class="flex flex-1 items-center justify-center p-4">
      <div class="w-full max-w-md">
        <!-- The brand carries the page: with no header above the card, this is
             the only place the deployment names itself. -->
        <div class="mb-6 flex flex-col items-center gap-2 text-center">
          <div class="flex items-center gap-2">
            <BrandLogo />
            <span class="text-2xl font-semibold">
              {{ title }}
            </span>
          </div>
          <!-- Same hint the header badge carries, so an admin recognizes which
               app they are signing in to before they have a session. -->
          <p class="text-muted text-sm">
            {{ t('admin_ui_hint') }}
          </p>
        </div>
        <UCard>
          <template #header>
            <h1 class="text-xl font-semibold">
              {{ t('login_title') }}
            </h1>
          </template>
          <form @submit.prevent="handleLogin">
            <UFormField :label="t('login_password')">
              <UInput
                v-model="password"
                type="password"
                autocomplete="current-password"
                :disabled="loading"
              />
            </UFormField>
            <UAlert
              v-if="error"
              color="error"
              :title="t('login_error')"
              class="mt-4"
            />
            <UButton
              type="submit"
              block
              class="mt-4"
              :loading="loading"
            >
              {{ t('login_submit') }}
            </UButton>
          </form>
        </UCard>
      </div>
    </main>
    <AppFooter />
  </div>
</template>

<script setup lang="ts">
const { fetch: fetchSession } = useUserSession();
const { title } = useRuntimeConfig().public.theme;
const { t } = useI18n();

const password = ref('');
const loading = ref(false);
const error = ref(false);

async function handleLogin() {
  if (!password.value)
    return;
  loading.value = true;
  error.value = false;
  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { password: password.value },
      credentials: 'include',
    });
    await fetchSession();
    await navigateTo('/', { replace: true });
  }
  catch {
    error.value = true;
  }
  finally {
    loading.value = false;
  }
}

definePageMeta({
  layout: false,
});
</script>
