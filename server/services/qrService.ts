import type { Archiver } from 'archiver';
import type { PDFFont, PDFPage } from 'pdf-lib';
import type { FitLabelOptions, FittedLabel } from '../utils/pdfLabel';
import type { Rect, StickerLayout } from '../utils/qrSticker';
import type { LabelPosition, QRGridSpacing } from '~/utils/qrGrid';
import { ZipArchive } from 'archiver';
import { PageSizes, PDFDocument, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { computeQRGridCells, DEFAULT_QR_GRID_SPACING } from '~/utils/qrGrid';
import { fitLabel } from '../utils/pdfLabel';
import { labelSpace, layoutSticker, qrSizeFor } from '../utils/qrSticker';

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
  /** Text printed next to every QR code, e.g. the media title. */
  label?: string
  /** Side of the QR code the label goes on; defaults to the right. */
  labelPosition?: LabelPosition
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

/** Draws the label's lines inside `rect`, from its top down. */
function drawLabel(page: PDFPage, font: PDFFont, label: FittedLabel, rect: NonNullable<StickerLayout['label']>) {
  const lineStep = label.size * LABEL_LINE_HEIGHT;
  const top = rect.y + rect.height;
  const capHeight = font.heightAtSize(label.size, { descender: false });
  label.lines.forEach((line, i) => {
    const width = font.widthOfTextAtSize(line, label.size);
    const x = rect.align === 'left'
      ? rect.x
      : rect.align === 'right' ? rect.x + rect.width - width : rect.x + (rect.width - width) / 2;
    page.drawText(line, {
      x,
      y: top - (i + 0.5) * lineStep - capHeight / 2,
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
  const labelText = options.label?.trim() ?? '';
  const labelFont = labelText ? await pdfDoc.embedFont(StandardFonts.Helvetica) : null;
  const label = labelFont ? encodableText(labelFont, labelText) : '';
  const labelPosition = labelFont ? options.labelPosition ?? 'right' : null;
  const labelGapPt = cmToPoints(0.2);

  // Every token gets the same box per page or cell, holding its code and
  // whichever of token and label are printed with it.
  let boxes: Rect[];
  /** Fixed size of the code, or `null` to fill the grid cell. */
  let qrSizeCm: number | null;
  let fontSize: number;
  let labelSizes: FitLabelOptions;
  if (layout === 'one-per-page') {
    if (!('sizeCm' in options)) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request: Invalid options' });
    }
    const pageMarginPt = cmToPoints(1.5);
    boxes = [{ x: pageMarginPt, y: pageMarginPt, width: pageW - 2 * pageMarginPt, height: pageH - 2 * pageMarginPt }];
    qrSizeCm = options.sizeCm;
    fontSize = 10;
    labelSizes = { maxSize: 24, minSize: 6 };
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
    // Cells are measured from the top of the page, PDF coordinates from the bottom.
    boxes = cells.map(cell => ({
      x: cmToPoints(cell.x),
      y: pageH - cmToPoints(cell.y + cell.height),
      width: cmToPoints(cell.width),
      height: cmToPoints(cell.height),
    }));
    qrSizeCm = null;
    fontSize = 6;
    labelSizes = { maxSize: 12, minSize: 5 };
  }
  else {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request: Invalid layout' });
  }

  const tokenHeightPt = showToken ? tokenGapPt + fontSize + cmToPoints(0.15) : 0;
  const qrSizePt = qrSizeCm
    ? cmToPoints(qrSizeCm)
    : qrSizeFor(boxes[0]!, tokenHeightPt, labelPosition);
  if (qrSizePt <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request: Grid cells are too small' });
  }
  // Same text in every box, so it is fitted once.
  const space = labelPosition ? labelSpace(boxes[0]!, qrSizePt, tokenHeightPt, labelGapPt, labelPosition) : null;
  const fitted = labelFont && space ? fitLabelToBox(labelFont, label, space.width, space.height, labelSizes) : null;
  const labelBlock = fitted && labelFont && labelPosition
    ? {
        position: labelPosition,
        width: Math.max(...fitted.lines.map(line => labelFont.widthOfTextAtSize(line, fitted.size))),
        height: fitted.lines.length * fitted.size * LABEL_LINE_HEIGHT,
      }
    : null;
  const sizePx = qrSizeCm ? cmToPixels(qrSizeCm) : pointsToPixels(qrSizePt);

  let page: PDFPage | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const item = tokens[i];
    if (!item)
      continue;
    if (i % boxes.length === 0)
      page = pdfDoc.addPage(PageSizes.A4);
    const { qr, label: labelRect } = layoutSticker(boxes[i % boxes.length]!, qrSizePt, tokenHeightPt, labelGapPt, labelBlock);
    const fullUrl = `${baseUrl}/${item.token}`;
    const pngImage = await pdfDoc.embedPng(await generateQRCode(fullUrl, sizePx));
    page!.drawImage(pngImage, { x: qr.x, y: qr.y, width: qrSizePt, height: qrSizePt });
    if (fitted && labelFont && labelRect)
      drawLabel(page!, labelFont, fitted, labelRect);
    if (showToken && font) {
      const textW = font.widthOfTextAtSize(item.token, fontSize);
      page!.drawText(item.token, {
        x: qr.x + (qrSizePt - textW) / 2,
        y: qr.y - tokenGapPt - fontSize,
        font,
        size: fontSize,
      });
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w-]/g, '_');
}
