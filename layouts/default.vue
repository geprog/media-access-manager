<template>
  <div class="flex min-h-screen flex-col">
    <header class="border-b border-gray-200 dark:border-gray-800">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <div class="flex items-center gap-4">
          <img
            v-if="logo"
            :src="logo"
            :alt="title"
            class="h-8 object-contain"
          >
          <NuxtLink to="/" class="text-lg font-semibold">
            {{ title }}
          </NuxtLink>
        </div>
        <div v-if="!loggedIn" class="flex items-center gap-2">
          <span class="text-sm text-gray-500 dark:text-gray-400">
            {{ $t('media_list_title') }}
          </span>
          <UButton
            variant="ghost"
            :label="$t('logout')"
            @click="handleLogout"
          />
        </div>
      </div>
    </header>
    <main class="flex-1 p-4">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
const router = useRouter();
const { clear, loggedIn } = useUserSession();
const { title, logo } = useRuntimeConfig().public;

async function handleLogout() {
  await clear();
  await router.push('/login');
}
</script>
