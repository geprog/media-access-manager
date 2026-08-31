import type { Archiver } from 'archiver';
import { ZipArchive } from 'archiver';
import { PageSizes, PDFDocument, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';
import sharp from 'sharp';

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
}

export interface QRPdfOptions {
  showToken?: boolean
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
  const marginPt = cmToPoints(1.5);
  const gapPt = cmToPoints(0.5);
  const showToken = options.showToken ?? false;
  const font = showToken ? await pdfDoc.embedFont(StandardFonts.Courier) : null;
  const tokenGapPt = cmToPoints(0.3);
  const fontSizeOne = 10;
  const fontSizeGrid = 6;

  if (layout === 'one-per-page') {
    if (!('sizeCm' in options)) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request: Invalid options' });
    }
    const sizeCm = options.sizeCm;
    const sizePx = cmToPixels(sizeCm);
    const sizePt = cmToPoints(sizeCm);
    for (let i = 0; i < tokens.length; i++) {
      const item = tokens[i];
      if (!item)
        continue;
      const fullUrl = `${baseUrl}/${item.token}`;
      const pngBuf = await generateQRCode(fullUrl, sizePx);
      const pngImage = await pdfDoc.embedPng(pngBuf);
      const page = pdfDoc.addPage(PageSizes.A4);
      const x = (pageW - sizePt) / 2;
      const y = (pageH - sizePt) / 2;
      page.drawImage(pngImage, { x, y, width: sizePt, height: sizePt });
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
    const { cols, rows } = options.grid;
    const cellW = (pageW - 2 * marginPt - (cols - 1) * gapPt) / cols;
    const cellH = (pageH - 2 * marginPt - (rows - 1) * gapPt) / rows;
    const tokenReservedPt = showToken ? tokenGapPt + fontSizeGrid + cmToPoints(0.15) : 0;
    const drawSizePt = Math.min(cellW, cellH - tokenReservedPt);
    const sizePx = pointsToPixels(drawSizePt);
    const itemsPerPage = cols * rows;

    let page = pdfDoc.addPage(PageSizes.A4);

    for (let i = 0; i < tokens.length; i++) {
      if (i > 0 && i % itemsPerPage === 0)
        page = pdfDoc.addPage(PageSizes.A4);
      const item = tokens[i];
      if (!item)
        continue;
      const idxOnPage = i % itemsPerPage;
      const col = idxOnPage % cols;
      const row = Math.floor(idxOnPage / cols);
      const fullUrl = `${baseUrl}/${item.token}`;
      const pngBuf = await generateQRCode(fullUrl, sizePx);
      const pngImage = await pdfDoc.embedPng(pngBuf);
      const offsetX = (cellW - drawSizePt) / 2;
      const offsetY = (cellH - drawSizePt) / 2;
      const x = marginPt + col * (cellW + gapPt) + offsetX;
      const y = pageH - marginPt - (row + 1) * (cellH + gapPt) + offsetY;
      page.drawImage(pngImage, { x, y, width: drawSizePt, height: drawSizePt });
      if (showToken && font) {
        const textW = font.widthOfTextAtSize(item.token, fontSizeGrid);
        const cellCenterX = marginPt + col * (cellW + gapPt) + cellW / 2;
        const textX = cellCenterX - textW / 2;
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
