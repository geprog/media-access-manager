import type { QRPdfLayout } from '../../../services/qrService';
import { createQRPdf } from '../../../services/qrService';
import { findBatchById, listTokensByBatchId } from '../../../services/tokenService';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const query = getQuery(event);
  const layout = (query.layout as QRPdfLayout) || 'one-per-page';
  const sizeCm = Math.min(15, Math.max(2, Number(query.sizeCm) || 5));
  const cols = Math.min(6, Math.max(1, Math.floor(Number(query.cols) || 3)));
  const rows = Math.min(8, Math.max(1, Math.floor(Number(query.rows) || 4)));

  if (layout !== 'one-per-page' && layout !== 'grid') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid layout. Use one-per-page or grid.' });
  }

  const [batch, tokenRows] = await Promise.all([
    findBatchById(id),
    listTokensByBatchId(id),
  ]);
  if (tokenRows.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' });
  }

  const appUrl = getRequestURL(event).origin;
  const tokensWithName = tokenRows.map(t => ({ token: t.token, name: t.name }));
  const batchName = batch?.name ?? '';
  const options = layout === 'one-per-page'
    ? { sizeCm }
    : { grid: { cols, rows } };
  const pdf = await createQRPdf(tokensWithName, appUrl, batchName, layout, options);

  const layoutSuffix = layout === 'grid' ? '-grid' : '';
  const baseName = batchName
    ? batchName.replace(/[^\w-]/g, '_')
    : `batch-${id}`;
  const fileName = `qr-${baseName}${layoutSuffix}.pdf`;

  setHeader(event, 'Content-Type', 'application/pdf');
  setHeader(event, 'Content-Disposition', `attachment; filename="${fileName}"`);
  return pdf;
});
