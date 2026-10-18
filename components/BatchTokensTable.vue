<template>
  <UTable
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
    v-if="tokens.length > 0"
    v-model:page="page"
    class="flex justify-center"
    :items-per-page="PAGE_SIZE"
    :total="tokens.length"
  />
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui';
import type { TokenRow } from '~/utils/tokens';

const props = defineProps<{
  /** Already searched and narrowed down by the media details page. */
  tokens: TokenRow[]
  columns: TableColumn<TokenRow>[]
  loading?: boolean
  /** The search `tokens` were narrowed down by. */
  filter?: string
}>();

const { t } = useI18n();

const PAGE_SIZE = 5;

const page = ref(1);
const pageStart = computed(() => (page.value - 1) * PAGE_SIZE);

// A new search starts over at its first hits.
watch(() => props.filter, () => {
  page.value = 1;
});

// A deleted token can leave the current page past the last token; the last
// page left is the closest to where the admin was.
watch(() => props.tokens, () => {
  if (pageStart.value >= props.tokens.length) {
    page.value = Math.max(1, Math.ceil(props.tokens.length / PAGE_SIZE));
  }
});

const paginatedTokens = computed(() => props.tokens.slice(pageStart.value, pageStart.value + PAGE_SIZE));
</script>
