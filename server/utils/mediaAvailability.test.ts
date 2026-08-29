import { describe, expect, it } from 'vitest';
import { filterAvailableMediaItems } from './mediaAvailability';

function vimeoItem(videoId: string, title = `Video ${videoId}`) {
  return {
    id: videoId,
    providerId: 'vimeo',
    title,
    providerConfig: { providerId: 'vimeo', videoId },
  };
}

describe('mediaAvailability', () => {
  describe('filterAvailableMediaItems', () => {
    it('returns all items when nothing has been added yet', () => {
      const items = [vimeoItem('1'), vimeoItem('2')];
      expect(filterAvailableMediaItems(items, [])).toEqual(items);
    });

    it('drops items that are already added', () => {
      const items = [vimeoItem('1'), vimeoItem('2'), vimeoItem('3')];
      const result = filterAvailableMediaItems(items, [
        { providerId: 'vimeo', videoId: '2' },
      ]);
      expect(result.map(i => i.id)).toEqual(['1', '3']);
    });

    it('ignores key order when comparing configs', () => {
      const result = filterAvailableMediaItems([vimeoItem('7')], [
        { videoId: '7', providerId: 'vimeo' },
      ]);
      expect(result).toEqual([]);
    });

    it('keeps items of the same id from a different provider', () => {
      const result = filterAvailableMediaItems([vimeoItem('42')], [
        { providerId: 'youtube', videoId: '42' },
      ]);
      expect(result.map(i => i.id)).toEqual(['42']);
    });

    it('returns an empty list when every item is added', () => {
      const result = filterAvailableMediaItems([vimeoItem('1'), vimeoItem('2')], [
        { providerId: 'vimeo', videoId: '1' },
        { providerId: 'vimeo', videoId: '2' },
      ]);
      expect(result).toEqual([]);
    });
  });
});
