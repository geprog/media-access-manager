/** Width and height of an A4 page in cm. */
export const A4_CM = { width: 21, height: 29.7 };

/**
 * Where the QR grid sits on the page, in cm. Margins are measured from the
 * page edges, gaps between neighboring cells – the same figures a sticker
 * sheet lists for its labels, so a grid can be laid onto any template.
 */
export interface QRGridSpacing {
  marginTop: number
  marginRight: number
  marginBottom: number
  marginLeft: number
  gapX: number
  gapY: number
}

export const DEFAULT_QR_GRID_SPACING: QRGridSpacing = {
  marginTop: 1.5,
  marginRight: 1.5,
  marginBottom: 1.5,
  marginLeft: 1.5,
  gapX: 0.5,
  gapY: 0.5,
};

export const QR_GRID_SPACING_MAX_CM = 10;

const SPACING_KEYS = Object.keys(DEFAULT_QR_GRID_SPACING) as (keyof QRGridSpacing)[];

/**
 * Spacing from query parameters. A value that is missing or not a number keeps
 * its default; anything else is clamped to 0–{@link QR_GRID_SPACING_MAX_CM}.
 */
export function parseQRGridSpacing(query: Partial<Record<keyof QRGridSpacing, unknown>>): QRGridSpacing {
  const spacing = { ...DEFAULT_QR_GRID_SPACING };
  for (const key of SPACING_KEYS) {
    const raw = query[key];
    if (raw == null || String(raw).trim() === '')
      continue;
    const value = Number(raw);
    if (Number.isFinite(value))
      spacing[key] = Math.min(QR_GRID_SPACING_MAX_CM, Math.max(0, value));
  }
  return spacing;
}

/** One grid cell in cm, measured from the top left corner of the page. */
export interface QRGridCell {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The cells of a `cols` × `rows` grid, row by row from the top left, or `null`
 * when the spacing leaves no room for them on the page.
 */
export function computeQRGridCells(
  cols: number,
  rows: number,
  spacing: QRGridSpacing,
  page: { width: number, height: number } = A4_CM,
): QRGridCell[] | null {
  const width = (page.width - spacing.marginLeft - spacing.marginRight - (cols - 1) * spacing.gapX) / cols;
  const height = (page.height - spacing.marginTop - spacing.marginBottom - (rows - 1) * spacing.gapY) / rows;
  if (width <= 0 || height <= 0)
    return null;
  const cells: QRGridCell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({
        x: spacing.marginLeft + col * (width + spacing.gapX),
        y: spacing.marginTop + row * (height + spacing.gapY),
        width,
        height,
      });
    }
  }
  return cells;
}
