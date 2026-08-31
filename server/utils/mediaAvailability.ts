import type { ProviderConfig } from '~/server/db/schema';

/**
 * Stable key for a provider config so two configs describing the same remote
 * media compare equal regardless of key order. Configs are flat by contract.
 */
function providerConfigKey(config: ProviderConfig<string>): string {
  return JSON.stringify(
    Object.keys(config)
      .sort()
      .map(key => [key, config[key]]),
  );
}

/**
 * Keeps only the provider items that are not backed by an existing media row.
 */
export function filterAvailableMediaItems<Item extends { providerConfig: ProviderConfig<string> }>(
  providerItems: Item[],
  existingConfigs: ProviderConfig<string>[],
): Item[] {
  const used = new Set(existingConfigs.map(providerConfigKey));
  return providerItems.filter(item => !used.has(providerConfigKey(item.providerConfig)));
}
