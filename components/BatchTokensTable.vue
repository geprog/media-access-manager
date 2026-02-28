<template>
  <UTable
    v-if="tokens && tokens.length > 0"
    :data="tokens"
    :columns="columns"
  />
  <p
    v-else
    class="py-4 text-sm text-muted"
  >
    {{ t('tokens_empty') }}
  </p>
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

const { data: tokens } = await useFetch(`/api/tokens?batchId=${props.batchId}&mediaId=${props.mediaId}`);
</script>
