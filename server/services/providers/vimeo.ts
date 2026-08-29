import type { MediaItem, MediaProvider, OEmbedResponse } from './types';
import type { VimeoConfig } from '~/server/db/schema';
import { extract } from '@extractus/oembed-extractor';

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
  };
}
