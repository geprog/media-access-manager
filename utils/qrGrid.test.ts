import { describe, expect, it } from 'vitest';
import { computeQRGridCells, DEFAULT_QR_GRID_SPACING, parseQRGridSpacing, QR_GRID_SPACING_MAX_CM } from './qrGrid';

const noSpacing = { marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0, gapX: 0, gapY: 0 };

describe('qrGrid', () => {
  describe('parseQRGridSpacing', () => {
    it('falls back to the defaults when nothing is given', () => {
      expect(parseQRGridSpacing({})).toEqual(DEFAULT_QR_GRID_SPACING);
    });

    it('reads every value in cm', () => {
      expect(parseQRGridSpacing({
        marginTop: '1.3',
        marginRight: '0.7',
        marginBottom: '2',
        marginLeft: '0.75',
        gapX: '0.25',
        gapY: '0',
      })).toEqual({ marginTop: 1.3, marginRight: 0.7, marginBottom: 2, marginLeft: 0.75, gapX: 0.25, gapY: 0 });
    });

    it('keeps zero instead of replacing it with the default', () => {
      expect(parseQRGridSpacing({ marginTop: '0' }).marginTop).toBe(0);
    });

    it('replaces values that are not numbers with the default', () => {
      expect(parseQRGridSpacing({ marginLeft: 'abc', gapX: '' })).toEqual(DEFAULT_QR_GRID_SPACING);
    });

    it('clamps values into the allowed range', () => {
      const spacing = parseQRGridSpacing({ marginTop: '-1', gapY: '99' });
      expect(spacing.marginTop).toBe(0);
      expect(spacing.gapY).toBe(QR_GRID_SPACING_MAX_CM);
    });
  });

  describe('computeQRGridCells', () => {
    it('splits the page evenly without spacing', () => {
      const cells = computeQRGridCells(2, 2, noSpacing, { width: 20, height: 30 });
      expect(cells).toEqual([
        { x: 0, y: 0, width: 10, height: 15 },
        { x: 10, y: 0, width: 10, height: 15 },
        { x: 0, y: 15, width: 10, height: 15 },
        { x: 10, y: 15, width: 10, height: 15 },
      ]);
    });

    it('orders cells row by row from the top left', () => {
      const cells = computeQRGridCells(3, 2, noSpacing, { width: 30, height: 20 });
      expect(cells?.map(c => [c.x, c.y])).toEqual([[0, 0], [10, 0], [20, 0], [0, 10], [10, 10], [20, 10]]);
    });

    it('offsets the grid by the top and left margins', () => {
      const cells = computeQRGridCells(1, 1, { ...noSpacing, marginTop: 2, marginLeft: 1 }, { width: 20, height: 30 });
      expect(cells).toEqual([{ x: 1, y: 2, width: 19, height: 28 }]);
    });

    it('shrinks the cells by the right and bottom margins', () => {
      const cells = computeQRGridCells(1, 1, { ...noSpacing, marginRight: 3, marginBottom: 4 }, { width: 20, height: 30 });
      expect(cells).toEqual([{ x: 0, y: 0, width: 17, height: 26 }]);
    });

    it('puts the gaps only between cells', () => {
      const cells = computeQRGridCells(2, 2, { ...noSpacing, gapX: 2, gapY: 4 }, { width: 22, height: 34 });
      expect(cells).toEqual([
        { x: 0, y: 0, width: 10, height: 15 },
        { x: 12, y: 0, width: 10, height: 15 },
        { x: 0, y: 19, width: 10, height: 15 },
        { x: 12, y: 19, width: 10, height: 15 },
      ]);
    });

    it('matches a common 3 × 8 sticker sheet on A4', () => {
      // 70 × 36 mm labels, 4.5 mm top and bottom margin, no side margin or gaps.
      const cells = computeQRGridCells(3, 8, { ...noSpacing, marginTop: 0.45, marginBottom: 0.45 });
      expect(cells).toHaveLength(24);
      expect(cells![0]!.width).toBeCloseTo(7);
      expect(cells![0]!.height).toBeCloseTo(3.6);
      expect(cells![23]!.x).toBeCloseTo(14);
      expect(cells![23]!.y).toBeCloseTo(0.45 + 7 * 3.6);
    });

    it('returns null when the spacing leaves no room for the cells', () => {
      expect(computeQRGridCells(2, 1, { ...noSpacing, marginLeft: 10, marginRight: 10, gapX: 1 })).toBeNull();
    });
  });
});
