import archiver from 'archiver';
import { PageSizes, PDFDocument } from 'pdf-lib';
import QRCode from 'qrcode';

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

export async function createQRZipArchive(
  tokens: Array<{ token: string, name: string }>,
  appUrl: string,
  batchName = '',
  sizeCm = 5,
): Promise<archiver.Archiver> {
  const sizePx = cmToPixels(sizeCm);
  const archive = archiver('zip', { zlib: { level: 9 } });
  const baseUrl = appUrl.replace(/\/$/, '');
  const prefix = batchName ? `${sanitizeFilename(batchName)}-` : '';
  for (let i = 0; i < tokens.length; i++) {
    const item = tokens[i];
    if (!item)
      continue;
    const fullUrl = `${baseUrl}/${item.token}`;
    const png = await generateQRCode(fullUrl, sizePx);
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

export async function createQRPdf(
  tokens: Array<{ token: string, name: string }>,
  appUrl: string,
  batchName: string,
  layout: QRPdfLayout,
  options: { sizeCm: number } | { grid: QRPdfGridOptions },
): Promise<Buffer> {
  const baseUrl = appUrl.replace(/\/$/, '');
  const pdfDoc = await PDFDocument.create();
  const [pageW, pageH] = PageSizes.A4;
  const marginPt = cmToPoints(1.5);
  const gapPt = cmToPoints(0.5);

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
    }
  }
  else if (layout === 'grid') {
    if (!('grid' in options)) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request: Invalid options' });
    }
    const { cols, rows } = options.grid;
    const cellW = (pageW - 2 * marginPt - (cols - 1) * gapPt) / cols;
    const cellH = (pageH - 2 * marginPt - (rows - 1) * gapPt) / rows;
    const drawSizePt = Math.min(cellW, cellH);
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
