import { describe, expect, it } from 'vitest';
import { labelSpace, layoutSticker, qrSizeFor } from './qrSticker';

const box = { x: 0, y: 0, width: 100, height: 60 };

describe('qrSticker', () => {
  describe('qrSizeFor', () => {
    it('fills the box without a label, leaving room for the token', () => {
      expect(qrSizeFor(box, 10, null)).toBe(50);
    });

    it('leaves a label beside the code most of the remaining width', () => {
      expect(qrSizeFor({ width: 80, height: 60 }, 0, 'right')).toBe(44);
      expect(qrSizeFor({ width: 80, height: 60 }, 0, 'left')).toBe(44);
    });

    it('leaves a label above or below the code part of the height', () => {
      expect(qrSizeFor(box, 10, 'bottom')).toBe(35);
      expect(qrSizeFor(box, 10, 'top')).toBe(35);
    });
  });

  describe('labelSpace', () => {
    it('gives a label beside the code the width next to it', () => {
      expect(labelSpace(box, 40, 10, 5, 'right')).toEqual({ width: 50, height: 50 });
      expect(labelSpace(box, 40, 10, 5, 'left')).toEqual({ width: 50, height: 50 });
    });

    it('gives a label above or below the code the height left over', () => {
      expect(labelSpace(box, 30, 10, 5, 'bottom')).toEqual({ width: 90, height: 10 });
      expect(labelSpace(box, 30, 10, 5, 'top')).toEqual({ width: 90, height: 10 });
    });
  });

  describe('layoutSticker', () => {
    it('centers the code and its token without a label', () => {
      expect(layoutSticker(box, 40, 10, 5, null)).toEqual({ qr: { x: 30, y: 15 } });
    });

    it('puts the label right of the code, aligned towards it', () => {
      expect(layoutSticker(box, 40, 0, 5, { position: 'right', width: 20, height: 10 })).toEqual({
        qr: { x: 17.5, y: 10 },
        label: { x: 62.5, y: 25, width: 20, height: 10, align: 'left' },
      });
    });

    it('puts the label left of the code, aligned towards it', () => {
      expect(layoutSticker(box, 40, 0, 5, { position: 'left', width: 20, height: 10 })).toEqual({
        qr: { x: 42.5, y: 10 },
        label: { x: 17.5, y: 25, width: 20, height: 10, align: 'right' },
      });
    });

    it('puts the label below the token, centered', () => {
      expect(layoutSticker(box, 30, 10, 5, { position: 'bottom', width: 60, height: 10 })).toEqual({
        qr: { x: 35, y: 27.5 },
        label: { x: 20, y: 2.5, width: 60, height: 10, align: 'center' },
      });
    });

    it('puts the label above the code, centered', () => {
      expect(layoutSticker(box, 30, 10, 5, { position: 'top', width: 60, height: 10 })).toEqual({
        qr: { x: 35, y: 12.5 },
        label: { x: 20, y: 47.5, width: 60, height: 10, align: 'center' },
      });
    });

    it('offsets everything by the box position', () => {
      const moved = layoutSticker({ ...box, x: 100, y: 200 }, 40, 10, 5, null);
      expect(moved).toEqual({ qr: { x: 130, y: 215 } });
    });
  });
});
