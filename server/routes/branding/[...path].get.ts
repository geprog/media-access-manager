import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import process from 'node:process';
import { BRANDING_URL_PREFIX, resolveBrandingAssets, resolveBrandingRoot } from '../../utils/brandingAssets';

/**
 * Serves the logo and favicon of a white-label deployment from a directory that
 * is read at request time.
 *
 * `public/` cannot do this: the build freezes a manifest of everything in it
 * into the server bundle, and only what the manifest lists is served. A file
 * mounted into the running container afterwards is invisible to that handler
 * and the request falls through to the app's HTML, while a file mounted *over*
 * one that was built in is sent with the original's `Content-Length` and
 * `ETag`. Looking the file up on every request is what makes a mount work.
 *
 * Served are only the files `NUXT_PUBLIC_THEME_LOGO`,
 * `NUXT_PUBLIC_THEME_LOGO_DARK` and `NUXT_PUBLIC_THEME_FAVICON` name. The
 * requested path is compared against those settings and never turned into a
 * file name, so the mount may hold anything else without any of it being
 * reachable.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const root = resolveBrandingRoot(config.brandingDir, process.cwd());
  // The router has already cut off the query string and matched `[...path]`,
  // and it leaves the escaping of the remainder untouched – so prepending the
  // prefix reproduces exactly the URL a theme setting was parsed into.
  // `event.path` would still carry the query string, and `getRequestURL()`
  // would rebuild the URL from the client's `Host` header, which decides
  // nothing here and can throw (see `server/utils/requestHost.ts`).
  const requested = BRANDING_URL_PREFIX + (getRouterParam(event, 'path') ?? '');
  const asset = root && resolveBrandingAssets(root, config.public.theme).get(requested);
  if (!asset) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' });
  }

  const stats = await stat(asset.path).catch(() => undefined);
  if (!stats?.isFile()) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' });
  }

  // Revalidate rather than cache: an operator swapping the logo in the mounted
  // directory is picked up on the next request, while an unchanged file still
  // costs no bandwidth.
  const etag = `W/"${stats.size}-${stats.mtimeMs}"`;
  setHeader(event, 'Cache-Control', 'public, max-age=0, must-revalidate');
  setHeader(event, 'ETag', etag);
  setHeader(event, 'Last-Modified', stats.mtime.toUTCString());
  if (getHeader(event, 'if-none-match') === etag) {
    setResponseStatus(event, 304);
    return null;
  }

  setHeader(event, 'Content-Type', asset.contentType);
  setHeader(event, 'Content-Length', stats.size);
  return sendStream(event, createReadStream(asset.path));
});
