<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<script setup lang="ts">
const toast = useToast();
const { t } = useI18n();

const { primaryColor } = useRuntimeConfig().public;
if (primaryColor) {
  updateAppConfig({
    ui: {
      colors: {
        primary: primaryColor,
      },
    },
  });
}

onErrorCaptured((error) => {
  console.error(error);
  toast.add({
    title: t('error_occurred'),
    description: error.message,
    color: 'error',
  });
});
</script>
