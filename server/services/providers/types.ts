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

export type AccessibilitySeverity = 'error' | 'warning';

export interface AccessibilityIssue {
  /** Rendered by the UI as the i18n key `accessibility_issue_<code>`. */
  code: string
  severity: AccessibilitySeverity
  /** Interpolation values for the translated message. */
  details?: Record<string, string>
}

export interface AccessibilityReport {
  /**
   * `ok` when a token holder can watch the media, `warning` when playback
   * works but is conditional (e.g. limited to certain domains), `error` when
   * it cannot play, `unknown` when the provider could not be interrogated.
   */
  status: 'ok' | 'warning' | 'error' | 'unknown'
  issues: AccessibilityIssue[]
}

export interface AccessibilityContext {
  /** Hostname this app is served from, without port; `undefined` when unknown. */
  host?: string
}

export interface MediaProvider<Config extends ProviderConfig<string>> {
  id: string
  listMedia: () => Promise<MediaItem[]>
  getViewableContent: (providerConfig: Config) => Promise<OEmbedResponse>
  /**
   * Checks whether a public visitor holding a valid token could actually watch
   * this media, and explains what to change when they could not.
   */
  verifyAccessibility: (
    providerConfig: Config,
    context?: AccessibilityContext,
  ) => Promise<AccessibilityReport>
  /** i18n keys the admin UI renders as an ordered setup checklist. */
  setupInstructionKeys: string[]
  /**
   * Direct link to this media at the provider, pointing where its playback
   * settings are changed, so an admin acting on a failed check does not have to
   * find the media there by hand. `null` when the config names no media the
   * provider can link to.
   */
  getSettingsUrl: (providerConfig: Config) => string | null
}
