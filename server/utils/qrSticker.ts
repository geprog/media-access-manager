/**
 * Where the parts of one printed QR code go: the code, the token below it and
 * an optional label on any of its sides. Coordinates follow PDF: the origin is
 * the bottom left corner and y grows upwards.
 */

import type { LabelPosition } from '~/utils/qrGrid';

interface Size {
  width: number
  height: number
}

export interface Rect extends Size {
  x: number
  y: number
}

function isBeside(position: LabelPosition) {
  return position === 'left' || position === 'right';
}

/**
 * The largest QR code that still leaves a label its share of the box: most of
 * the width beside the code, part of the height above or below it.
 */
export function qrSizeFor(box: Size, tokenHeight: number, position: LabelPosition | null): number {
  const height = box.height - tokenHeight;
  if (!position)
    return Math.min(box.width, height);
  return isBeside(position)
    ? Math.min(box.width * 0.55, height)
    : Math.min(box.width, height * 0.7);
}

/**
 * The room a label has next to the code, keeping `gap` from the code and from
 * the edges of the box. The code brings its own quiet zone, so the edge it
 * touches needs none.
 */
export function labelSpace(box: Size, qrSize: number, tokenHeight: number, gap: number, position: LabelPosition): Size {
  return isBeside(position)
    ? { width: box.width - qrSize - 2 * gap, height: box.height - 2 * gap }
    : { width: box.width - 2 * gap, height: box.height - qrSize - tokenHeight - 2 * gap };
}

export interface StickerLayout {
  /** Bottom left corner of the code; the token goes below it. */
  qr: { x: number, y: number }
  label?: Rect & { align: 'left' | 'center' | 'right' }
}

/**
 * Centers the code, its token and the label in `box` as one block. The label
 * is as large as the text it holds and aligned towards the code.
 */
export function layoutSticker(
  box: Rect,
  qrSize: number,
  tokenHeight: number,
  gap: number,
  label: (Size & { position: LabelPosition }) | null,
): StickerLayout {
  const codeHeight = qrSize + tokenHeight;
  if (!label) {
    return { qr: { x: box.x + (box.width - qrSize) / 2, y: box.y + (box.height - codeHeight) / 2 + tokenHeight } };
  }
  if (isBeside(label.position)) {
    const blockW = qrSize + gap + label.width;
    const blockH = Math.max(codeHeight, label.height);
    const x = box.x + (box.width - blockW) / 2;
    const y = box.y + (box.height - blockH) / 2;
    const qrY = y + (blockH - codeHeight) / 2 + tokenHeight;
    const labelY = y + (blockH - label.height) / 2;
    return label.position === 'right'
      ? {
          qr: { x, y: qrY },
          label: { x: x + qrSize + gap, y: labelY, width: label.width, height: label.height, align: 'left' },
        }
      : {
          qr: { x: x + label.width + gap, y: qrY },
          label: { x, y: labelY, width: label.width, height: label.height, align: 'right' },
        };
  }
  const blockW = Math.max(qrSize, label.width);
  const blockH = codeHeight + gap + label.height;
  const x = box.x + (box.width - blockW) / 2;
  const y = box.y + (box.height - blockH) / 2;
  const qrX = x + (blockW - qrSize) / 2;
  const labelX = x + (blockW - label.width) / 2;
  return label.position === 'bottom'
    ? {
        qr: { x: qrX, y: y + label.height + gap + tokenHeight },
        label: { x: labelX, y, width: label.width, height: label.height, align: 'center' },
      }
    : {
        qr: { x: qrX, y: y + tokenHeight },
        label: { x: labelX, y: y + codeHeight + gap, width: label.width, height: label.height, align: 'center' },
      };
}
