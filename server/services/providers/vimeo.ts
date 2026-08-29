import type { MediaItem, MediaProvider, OEmbedResponse } from './types';
import type { VimeoConfig } from '~/server/db/schema';
import { extract } from '@extractus/oembed-extractor';

export function createVimeoProvider(apiToken?: string): MediaProvider<VimeoConfig> {
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
      const data = await response.json() as { data: Array<{ uri: string, name: string }> };
      return (data.data ?? []).map((v) => {
        const videoId = v.uri.replace(/^\/videos\//, '');
        return {
          id: videoId,
          providerId: 'vimeo',
          title: v.name,
          providerConfig: {
            providerId: 'vimeo',
            videoId,
          } satisfies VimeoConfig,
        };
      });
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
