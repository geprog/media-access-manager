import type { Archiver } from 'archiver';
import type { PDFFont, PDFPage } from 'pdf-lib';
import type { FitLabelOptions, FittedLabel } from '../utils/pdfLabel';
import type { QRGridSpacing } from '~/utils/qrGrid';
import { ZipArchive } from 'archiver';
import { PageSizes, PDFDocument, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { computeQRGridCells, DEFAULT_QR_GRID_SPACING } from '~/utils/qrGrid';
import { fitLabel } from '../utils/pdfLabel';

/** Points per cm (1 inch = 72 pt, 1 inch = 2.54 cm) */
const CM_TO_POINTS = 72 / 2.54;

/** DPI for PNG generation (print quality) */
const PRINT_DPI = 300;

/** Convert cm to pixels at print DPI */
function cmToPixels(cm: number): number {
  return Math.round((cm * PRINT_DPI) / 2.54);
}

/** Convert cm to PDF points */
function cmToPoints(cm: number): number {
  return cm * CM_TO_POINTS;
}

/** Convert PDF points to pixels at print DPI */
function pointsToPixels(pt: number): number {
  return Math.round((pt * PRINT_DPI) / 72);
}

export async function generateQRCode(url: string, sizePx: number): Promise<Buffer> {
  return QRCode.toBuffer(url, { width: sizePx, margin: 2 });
}

/** Escape text for safe use in SVG/XML */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Add token text below QR code image. Returns new PNG buffer. */
async function addTokenToQRImage(qrPng: Buffer, token: string, qrSizePx: number): Promise<Buffer> {
  const meta = await sharp(qrPng).metadata();
  const qrWidthPx = meta.width ?? qrSizePx;
  const qrHeightPx = meta.height ?? qrSizePx;

  const paddingPx = Math.max(8, Math.floor(qrWidthPx / 50));
  const fontSizePx = Math.max(14, Math.min(32, Math.floor(qrWidthPx / 20)));
  const textHeightPx = fontSizePx + paddingPx * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${qrWidthPx}" height="${textHeightPx}">
<text x="${qrWidthPx / 2}" y="${fontSizePx + paddingPx}" text-anchor="middle" font-family="monospace, Courier, monospace" font-size="${fontSizePx}" fill="#000">${escapeXml(token)}</text>
</svg>`;

  const textPng = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();

  const composite = await sharp(qrPng)
    .extend({ bottom: textHeightPx, background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .composite([{ input: textPng, top: qrHeightPx, left: 0 }])
    .png()
    .toBuffer();

  return composite;
}

export async function createQRZipArchive(
  tokens: Array<{ token: string, name: string }>,
  appUrl: string,
  batchName = '',
  sizeCm = 5,
  showToken = false,
): Promise<Archiver> {
  const sizePx = cmToPixels(sizeCm);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const baseUrl = appUrl.replace(/\/$/, '');
  const prefix = batchName ? `${sanitizeFilename(batchName)}-` : '';
  for (let i = 0; i < tokens.length; i++) {
    const item = tokens[i];
    if (!item)
      continue;
    const fullUrl = `${baseUrl}/${item.token}`;
    let png = await generateQRCode(fullUrl, sizePx);
    if (showToken) {
      png = await addTokenToQRImage(png, item.token, sizePx);
    }
    const name = item.name || String(i + 1);
    archive.append(png, { name: `${prefix}${name}.png` });
  }
  archive.finalize();
  return archive;
}

export type QRPdfLayout = 'one-per-page' | 'grid';

export interface QRPdfGridOptions {
  cols: number
  rows: number
  /** Margins and gaps in cm; defaults to {@link DEFAULT_QR_GRID_SPACING}. */
  spacing?: QRGridSpacing
}

export interface QRPdfOptions {
  showToken?: boolean
  /** Text printed to the right of every QR code, e.g. the media title. */
  label?: string
}

const LABEL_LINE_HEIGHT = 1.2;

/**
 * The label as the font can write it. The standard PDF fonts only cover
 * Latin-1, and pdf-lib throws on anything else, so such characters become `?`.
 */
function encodableText(font: PDFFont, text: string): string {
  const charset = new Set(font.getCharacterSet());
  return [...text].map(char => charset.has(char.codePointAt(0)!) ? char : '?').join('');
}

function fitLabelToBox(font: PDFFont, text: string, width: number, height: number, options: FitLabelOptions): FittedLabel | null {
  return fitLabel(text, width, height, (line, size) => font.widthOfTextAtSize(line, size), { ...options, lineHeight: LABEL_LINE_HEIGHT });
}

function labelWidth(font: PDFFont, label: FittedLabel): number {
  return Math.max(...label.lines.map(line => font.widthOfTextAtSize(line, label.size)));
}

/** Draws the label left-aligned at `x`, its lines centered vertically on `centerY`. */
function drawLabel(page: PDFPage, font: PDFFont, label: FittedLabel, x: number, centerY: number) {
  const lineStep = label.size * LABEL_LINE_HEIGHT;
  const top = centerY + (label.lines.length * lineStep) / 2;
  label.lines.forEach((line, i) => {
    page.drawText(line, {
      x,
      y: top - i * lineStep - lineStep / 2 - font.heightAtSize(label.size, { descender: false }) / 2,
      font,
      size: label.size,
    });
  });
}

export async function createQRPdf(
  tokens: Array<{ token: string, name: string }>,
  appUrl: string,
  batchName: string,
  layout: QRPdfLayout,
  options: ({ sizeCm: number } | { grid: QRPdfGridOptions }) & QRPdfOptions,
): Promise<Buffer> {
  const baseUrl = appUrl.replace(/\/$/, '');
  const pdfDoc = await PDFDocument.create();
  const [pageW, pageH] = PageSizes.A4;
  const showToken = options.showToken ?? false;
  const font = showToken ? await pdfDoc.embedFont(StandardFonts.Courier) : null;
  const tokenGapPt = cmToPoints(0.3);
  const fontSizeOne = 10;
  const fontSizeGrid = 6;
  const labelText = options.label?.trim() ?? '';
  const labelFont = labelText ? await pdfDoc.embedFont(StandardFonts.Helvetica) : null;
  const label = labelFont ? encodableText(labelFont, labelText) : '';
  const labelGapPt = cmToPoints(0.2);

  if (layout === 'one-per-page') {
    if (!('sizeCm' in options)) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request: Invalid options' });
    }
    const sizeCm = options.sizeCm;
    const sizePx = cmToPixels(sizeCm);
    const sizePt = cmToPoints(sizeCm);
    const pageMarginPt = cmToPoints(1.5);
    const fitted = labelFont
      ? fitLabelToBox(labelFont, label, pageW - 2 * pageMarginPt - sizePt - labelGapPt, sizePt, { maxSize: 24, minSize: 6 })
      : null;
    // The QR code and its label are centered on the page as one block.
    const blockW = fitted && labelFont ? sizePt + labelGapPt + labelWidth(labelFont, fitted) : sizePt;
    for (let i = 0; i < tokens.length; i++) {
      const item = tokens[i];
      if (!item)
        continue;
      const fullUrl = `${baseUrl}/${item.token}`;
      const pngBuf = await generateQRCode(fullUrl, sizePx);
      const pngImage = await pdfDoc.embedPng(pngBuf);
      const page = pdfDoc.addPage(PageSizes.A4);
      const x = (pageW - blockW) / 2;
      const y = (pageH - sizePt) / 2;
      page.drawImage(pngImage, { x, y, width: sizePt, height: sizePt });
      if (fitted && labelFont)
        drawLabel(page, labelFont, fitted, x + sizePt + labelGapPt, y + sizePt / 2);
      if (showToken && font) {
        const textW = font.widthOfTextAtSize(item.token, fontSizeOne);
        const textX = x + (sizePt - textW) / 2;
        const textY = y - tokenGapPt - fontSizeOne;
        page.drawText(item.token, {
          x: textX,
          y: textY,
          font,
          size: fontSizeOne,
        });
      }
    }
  }
  else if (layout === 'grid') {
    if (!('grid' in options)) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request: Invalid options' });
    }
    const { cols, rows, spacing = DEFAULT_QR_GRID_SPACING } = options.grid;
    const cells = computeQRGridCells(cols, rows, spacing);
    if (!cells) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request: Margins and gaps leave no room for the grid' });
    }
    const cellW = cmToPoints(cells[0]!.width);
    const cellH = cmToPoints(cells[0]!.height);
    const tokenReservedPt = showToken ? tokenGapPt + fontSizeGrid + cmToPoints(0.15) : 0;
    // A label takes the right part of the cell, so the QR code leaves it room.
    const drawSizePt = Math.min(labelFont ? cellW * 0.55 : cellW, cellH - tokenReservedPt);
    if (drawSizePt <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request: Grid cells are too small' });
    }
    // Same text in every cell, so it is fitted once. The QR code brings its own
    // quiet zone, so only the far edges of the cell get padding.
    const fitted = labelFont
      ? fitLabelToBox(labelFont, label, cellW - drawSizePt - 2 * labelGapPt, cellH - 2 * labelGapPt, { maxSize: 12, minSize: 5 })
      : null;
    const sizePx = pointsToPixels(drawSizePt);
    const itemsPerPage = cells.length;

    let page = pdfDoc.addPage(PageSizes.A4);

    for (let i = 0; i < tokens.length; i++) {
      if (i > 0 && i % itemsPerPage === 0)
        page = pdfDoc.addPage(PageSizes.A4);
      const item = tokens[i];
      if (!item)
        continue;
      const cell = cells[i % itemsPerPage]!;
      // Cells are measured from the top of the page, PDF coordinates from the bottom.
      const cellX = cmToPoints(cell.x);
      const cellY = pageH - cmToPoints(cell.y + cell.height);
      const fullUrl = `${baseUrl}/${item.token}`;
      const pngBuf = await generateQRCode(fullUrl, sizePx);
      const pngImage = await pdfDoc.embedPng(pngBuf);
      // The QR code and the token below it are centered as one block, or sit
      // on the left when a label follows them.
      const x = labelFont ? cellX : cellX + (cellW - drawSizePt) / 2;
      const y = cellY + (cellH - drawSizePt + tokenReservedPt) / 2;
      page.drawImage(pngImage, { x, y, width: drawSizePt, height: drawSizePt });
      if (fitted && labelFont)
        drawLabel(page, labelFont, fitted, x + drawSizePt + labelGapPt, cellY + cellH / 2);
      if (showToken && font) {
        const textW = font.widthOfTextAtSize(item.token, fontSizeGrid);
        const textX = x + (drawSizePt - textW) / 2;
        const textY = y - tokenGapPt - fontSizeGrid;
        page.drawText(item.token, {
          x: textX,
          y: textY,
          font,
          size: fontSizeGrid,
        });
      }
    }
  }
  else {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request: Invalid layout' });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w-]/g, '_');
}
