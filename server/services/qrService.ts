import archiver from 'archiver';
import QRCode from 'qrcode';

export async function generateQRCode(url: string, size = 256): Promise<Buffer> {
  return QRCode.toBuffer(url, { width: size, margin: 2 });
}

export async function createQRZipArchive(
  tokens: Array<{ token: string, name: string }>,
  appUrl: string,
  batchName = '',
  size = 256,
): Promise<archiver.Archiver> {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const baseUrl = appUrl.replace(/\/$/, '');
  const prefix = batchName ? `${sanitizeFilename(batchName)}-` : '';
  for (let i = 0; i < tokens.length; i++) {
    const item = tokens[i];
    if (!item)
      continue;
    const fullUrl = `${baseUrl}/${item.token}`;
    const png = await generateQRCode(fullUrl, size);
    const name = item.name || String(i + 1);
    archive.append(png, { name: `${prefix}${name}.png` });
  }
  archive.finalize();
  return archive;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w-]/g, '_');
}
