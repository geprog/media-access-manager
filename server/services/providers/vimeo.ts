import type { MediaItem, MediaProvider, OEmbedResponse } from './types';
import { extract } from '@extractus/oembed-extractor';

export function createVimeoProvider(apiToken?: string): MediaProvider {
  return {
    id: 'vimeo',

    async listMedia(): Promise<MediaItem[]> {
      if (!apiToken) {
        return [];
      }
      const response = await fetch('https://api.vimeo.com/me/videos?per_page=100', {
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      });
      if (!response.ok) {
        throw new Error(`Vimeo API error: ${response.status}`);
      }
      const data = await response.json() as { data: Array<{ uri: string, name: string, resource_key?: string }> };
      return (data.data ?? []).map(v => ({
        id: v.uri.replace(/^\/videos\//, ''),
        providerId: 'vimeo',
        title: v.name,
        providerConfig: {
          vimeoId: v.uri.replace(/^\/videos\//, ''),
          resourceKey: v.resource_key,
        },
      }));
    },

    async getViewableContent(
      mediaId: string,
      _providerConfig: Record<string, unknown>,
    ): Promise<OEmbedResponse> {
      const url = `https://vimeo.com/${mediaId}`;
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
