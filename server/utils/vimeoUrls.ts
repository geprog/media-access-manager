/**
 * Vimeo's dashboard page for one video, deep-linked to the privacy tab. Every
 * setting a failed playback check asks for lives there, so an admin can jump
 * from the complaint straight to the switch that fixes it.
 *
 * A video id may carry a private link hash (`123456789/abcdef`); the dashboard
 * is addressed by the numeric id alone.
 */
export function vimeoSettingsUrl(videoId: string): string | null {
  const numericId = videoId.trim().match(/^\d+/)?.[0];
  return numericId ? `https://vimeo.com/manage/videos/${numericId}/privacy` : null;
}
