import { describe, expect, it } from 'vitest';
import { fitLabel, wrapText } from './pdfLabel';

/** Every character is as wide as the font size, so widths are easy to count. */
function measure(text: string, size: number) {
  return text.length * size;
}

describe('pdfLabel', () => {
  describe('wrapText', () => {
    it('keeps text that fits on one line', () => {
      expect(wrapText('Hello world', 11, text => text.length)).toEqual(['Hello world']);
    });

    it('breaks between words', () => {
      expect(wrapText('Intro to the course', 9, text => text.length)).toEqual(['Intro to', 'the', 'course']);
    });

    it('collapses runs of whitespace', () => {
      expect(wrapText('  a \n  b  ', 10, text => text.length)).toEqual(['a b']);
    });

    it('breaks a word wider than the line inside the word', () => {
      expect(wrapText('abcdefgh ij', 3, text => text.length)).toEqual(['abc', 'def', 'gh', 'ij']);
    });

    it('returns no lines for blank text', () => {
      expect(wrapText('   ', 10, text => text.length)).toEqual([]);
    });
  });

  describe('fitLabel', () => {
    it('uses the largest size that fits on one line', () => {
      expect(fitLabel('Course', 60, 20, measure, { maxSize: 10, minSize: 5, lineHeight: 1 }))
        .toEqual({ size: 10, lines: ['Course'] });
    });

    it('shrinks the text until it fits', () => {
      expect(fitLabel('Course', 30, 20, measure, { maxSize: 10, minSize: 2, lineHeight: 1 }))
        .toEqual({ size: 5, lines: ['Course'] });
    });

    it('breaks a word only when no size keeps it whole', () => {
      expect(fitLabel('Course', 20, 20, measure, { maxSize: 10, minSize: 4, lineHeight: 1 }))
        .toEqual({ size: 6.5, lines: ['Cou', 'rse'] });
    });

    it('wraps onto several lines when they fit at a larger size', () => {
      expect(fitLabel('Big course', 60, 20, measure, { maxSize: 10, minSize: 5, lineHeight: 1 }))
        .toEqual({ size: 10, lines: ['Big', 'course'] });
    });

    it('cuts the text with an ellipsis when it does not fit even at the smallest size', () => {
      expect(fitLabel('one two three four', 25, 10, measure, { maxSize: 5, minSize: 5, lineHeight: 1 }))
        .toEqual({ size: 5, lines: ['one', 'two…'] });
    });

    it('returns null when not even one line fits', () => {
      expect(fitLabel('Course', 60, 4, measure, { maxSize: 10, minSize: 5, lineHeight: 1 })).toBeNull();
    });

    it('returns null for blank text', () => {
      expect(fitLabel('  ', 60, 20, measure)).toBeNull();
    });
  });
});
