<template>
  <div class="flex min-h-full flex-col items-center justify-center gap-4">
    <LoadingAnimation />
    <p class="text-lg text-gray-600 dark:text-gray-400">
      {{ $t('logging_out') }}
    </p>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n();
const userSession = useUserSession();
const router = useRouter();

useSeoMeta({
  title: t('logout'),
});

onMounted(async () => {
  try {
    // Clear the user session
    await userSession.clear();

    // Redirect to login page
    await router.push('/auth/login/');
  }
  catch (error) {
    console.error('Logout failed', error);
    // Even if logout fails, redirect to login page
    await router.push('/auth/login/');
  }
});
</script>
