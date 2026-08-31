import type { AccessibilityContext, AccessibilityReport, MediaItem, MediaProvider, OEmbedResponse } from './types';
import type { VimeoConfig } from '~/server/db/schema';
import type { VimeoAccessibilityInput } from '~/server/utils/vimeoAccessibility';
import { extract } from '@extractus/oembed-extractor';
import { diagnoseVimeoAccessibility } from '~/server/utils/vimeoAccessibility';
import { vimeoSettingsUrl } from '~/server/utils/vimeoUrls';

// Pin the Vimeo API version so response shapes cannot change under us when
// Vimeo moves its default. See https://developer.vimeo.com/api/guides/start
const VIMEO_API_VERSION = 'application/vnd.vimeo.*+json;version=3.4';

// 100 is Vimeo's maximum page size; larger libraries are read via `paging.next`.
const VIMEO_FIRST_PAGE = '/me/videos?per_page=100';

interface VimeoVideoPage {
  data?: Array<{ uri: string, name: string }>
  // Path relative to the API root, e.g. `/me/videos?page=2&per_page=100`.
  paging?: { next?: string | null }
}

interface VimeoVideoPrivacy {
  privacy?: { view?: string, embed?: string }
  embed?: { html?: string | null }
}

interface VimeoDomainPage {
  data?: Array<{ domain: string }>
}

/**
 * Ordered checklist shown next to a failing playback check. Kept as i18n keys
 * so the wording stays translatable and white-label friendly.
 */
const VIMEO_SETUP_INSTRUCTIONS = [
  'accessibility_setup_vimeo_open_privacy',
  'accessibility_setup_vimeo_hide_from_vimeo',
  'accessibility_setup_vimeo_embed_specific_domains',
  'accessibility_setup_vimeo_add_domain',
  'accessibility_setup_vimeo_recheck',
];

export function createVimeoProvider(apiToken?: string): MediaProvider<VimeoConfig> {
  return {
    id: 'vimeo',

    async listMedia(): Promise<MediaItem[]> {
      if (!apiToken) {
        console.warn('No API token configured for querying media from vimeo');
        return [];
      }
      const items: MediaItem[] = [];
      // Guard against a `next` cycle so a misbehaving response cannot hang the request.
      const visited = new Set<string>();
      let next: string | null | undefined = VIMEO_FIRST_PAGE;

      while (next && !visited.has(next)) {
        visited.add(next);
        const response = await fetch(`https://api.vimeo.com${next}`, {
          headers: {
            Accept: VIMEO_API_VERSION,
            Authorization: `Bearer ${apiToken}`,
          },
        });
        if (!response.ok) {
          throw new Error(`Vimeo API error: ${response.status}`);
        }
        const page = await response.json() as VimeoVideoPage;
        for (const v of page.data ?? []) {
          const videoId = v.uri.replace(/^\/videos\//, '');
          items.push({
            id: videoId,
            providerId: 'vimeo',
            title: v.name,
            providerConfig: {
              providerId: 'vimeo',
              videoId,
            } satisfies VimeoConfig,
          });
        }
        next = page.paging?.next;
      }

      return items;
    },

    async getViewableContent(
      providerConfig: VimeoConfig,
    ): Promise<OEmbedResponse> {
      const url = `https://vimeo.com/${providerConfig.videoId}`;
      const result = await extract(url, {
        maxwidth: 1280,
        maxheight: 720,
      });
      if (!result) {
        throw new Error('Failed to fetch oEmbed for Vimeo video');
      }
      return result as OEmbedResponse;
    },

    setupInstructionKeys: VIMEO_SETUP_INSTRUCTIONS,

    getSettingsUrl(providerConfig: VimeoConfig): string | null {
      return vimeoSettingsUrl(providerConfig.videoId);
    },

    async verifyAccessibility(
      providerConfig: VimeoConfig,
      context?: AccessibilityContext,
    ): Promise<AccessibilityReport> {
      const { videoId } = providerConfig;

      async function api<T>(path: string): Promise<T | null> {
        const response = await fetch(`https://api.vimeo.com${path}`, {
          headers: {
            Accept: VIMEO_API_VERSION,
            Authorization: `Bearer ${apiToken}`,
          },
        });
        return response.ok ? await response.json() as T : null;
      }

      const input: VimeoAccessibilityInput = {
        video: null,
        domains: [],
        embedFetched: false,
        apiChecked: !!apiToken,
        host: context?.host,
      };

      if (apiToken) {
        const video = await api<VimeoVideoPrivacy>(
          `/videos/${videoId}?fields=privacy.view,privacy.embed,embed.html`,
        );
        if (video) {
          input.video = {
            privacy: {
              view: video.privacy?.view ?? 'unknown',
              embed: video.privacy?.embed ?? 'unknown',
            },
            embedHtml: video.embed?.html ?? null,
          };
          if (video.privacy?.embed === 'whitelist') {
            const page = await api<VimeoDomainPage>(`/videos/${videoId}/privacy/domains`);
            input.domains = page?.data?.map(entry => entry.domain) ?? [];
          }
        }
      }

      // Run the very call the public viewer page makes, so the check fails
      // exactly when a real visitor would be turned away.
      try {
        const embed = await this.getViewableContent(providerConfig);
        input.embedFetched = 'html' in embed && !!embed.html;
      }
      catch {
        input.embedFetched = false;
      }

      return diagnoseVimeoAccessibility(input);
    },
  };
}
