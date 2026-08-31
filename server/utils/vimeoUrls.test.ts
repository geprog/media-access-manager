import { describe, expect, it } from 'vitest';
import { vimeoSettingsUrl } from './vimeoUrls';

describe('vimeoSettingsUrl', () => {
  it('links to the privacy settings of a video', () => {
    expect(vimeoSettingsUrl('123456789')).toBe('https://vimeo.com/manage/videos/123456789/privacy');
  });

  it('ignores a private link hash appended to the id', () => {
    expect(vimeoSettingsUrl('123456789/abcdef')).toBe('https://vimeo.com/manage/videos/123456789/privacy');
  });

  it('tolerates surrounding whitespace from a manually entered id', () => {
    expect(vimeoSettingsUrl('  123456789 ')).toBe('https://vimeo.com/manage/videos/123456789/privacy');
  });

  it('has no link for an id that is not a video id', () => {
    expect(vimeoSettingsUrl('')).toBeNull();
    expect(vimeoSettingsUrl('   ')).toBeNull();
    expect(vimeoSettingsUrl('not-a-video')).toBeNull();
  });
});
