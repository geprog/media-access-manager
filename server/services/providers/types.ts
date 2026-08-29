import type { ProviderConfig } from '~/server/db/schema';

export interface OEmbedBase {
  type: 'photo' | 'video' | 'link' | 'rich'
  version: string
  title?: string
  author_name?: string
  author_url?: string
  provider_name?: string
  provider_url?: string
  cache_age?: number
  thumbnail_url?: string
  thumbnail_width?: number
  thumbnail_height?: number
}

export interface OEmbedVideo extends OEmbedBase {
  type: 'video'
  html: string
  width: number
  height: number
}

export interface OEmbedPhoto extends OEmbedBase {
  type: 'photo'
  url: string
  width: number
  height: number
}

export interface OEmbedLink extends OEmbedBase {
  type: 'link'
}

export interface OEmbedRich extends OEmbedBase {
  type: 'rich'
  html: string
  width?: number
  height?: number
}

export type OEmbedResponse = OEmbedVideo | OEmbedPhoto | OEmbedLink | OEmbedRich;

export interface MediaItem {
  id: string
  providerId: string
  title: string
  providerConfig: ProviderConfig<string>
}

export interface MediaProvider<Config extends ProviderConfig<string>> {
  id: string
  listMedia: () => Promise<MediaItem[]>
  getViewableContent: (providerConfig: Config) => Promise<OEmbedResponse>
}
