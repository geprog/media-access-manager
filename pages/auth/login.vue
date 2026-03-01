<template>
  <div class="flex min-h-screen items-center justify-center p-4">
    <UCard class="w-full max-w-md">
      <template #header>
        <h1 class="text-xl font-semibold">
          {{ $t('login_title') }}
        </h1>
      </template>
      <form @submit.prevent="handleLogin">
        <UFormField :label="$t('login_password')">
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
          :title="$t('login_error')"
          class="mt-4"
        />
        <UButton
          type="submit"
          class="mt-4 w-full"
          :loading="loading"
        >
          {{ $t('login_submit') }}
        </UButton>
      </form>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const { fetch: fetchSession } = useUserSession();

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
