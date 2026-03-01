import { createQRZipArchive } from '../../../services/qrService';
import { findBatchById, listTokensByBatchId } from '../../../services/tokenService';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
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
  const archive = await createQRZipArchive(tokensWithName, appUrl, batchName);
  const zipName = batchName
    ? `qr-${batchName.replace(/[^\w-]/g, '_')}-${id}.zip`
    : `batch-${id}-qr.zip`;
  setHeader(event, 'Content-Type', 'application/zip');
  setHeader(event, 'Content-Disposition', `attachment; filename="${zipName}"`);
  return sendStream(event, archive);
});
