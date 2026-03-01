<template>
  <div class="flex px-4 py-3.5 border-b border-accented">
    <UInput v-model="globalFilter" class="max-w-sm" placeholder="Filter..." />
  </div>

  <UTable
    v-model:global-filter="globalFilter"
    :data="paginatedTokens"
    :columns="columns"
    :loading
  >
    <template #empty>
      <p class="py-4 text-sm text-muted">
        {{ t('tokens_empty') }}
      </p>
    </template>
  </UTable>
  <UPagination
    v-if="filteredTokens && filteredTokens.length > 0"
    v-model:page="page"
    class="flex justify-center"
    :items-per-page="PAGE_SIZE"
    :total="filteredTokens.length"
  />
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui';

interface TokenRow { token: string, name: string, usageCount: number, usageLimit: number | null, expiresAt: string | null }

const props = defineProps<{
  mediaId?: string
  batchId?: string
  columns: TableColumn<TokenRow>[]
}>();

const { t } = useI18n();

const { data: tokens, status: tokensStatus } = await useFetch(`/api/tokens?batchId=${props.batchId}&mediaId=${props.mediaId}`);

const loading = computed(() => tokensStatus.value === 'pending');

const PAGE_SIZE = 5;

const page = ref(1);
const pageStart = computed(() => (page.value - 1) * PAGE_SIZE);

const globalFilter = ref('');

const filteredTokens = computed(() => {
  return tokens.value?.filter(({ token }) => token.toLowerCase().includes(globalFilter.value.toLowerCase()));
});

watch(filteredTokens, () => {
  if (filteredTokens.value && filteredTokens.value.length < pageStart.value) {
    page.value = 1;
  }
});

const paginatedTokens = computed(() => {
  return filteredTokens.value?.slice(pageStart.value, pageStart.value + PAGE_SIZE);
});
</script>
