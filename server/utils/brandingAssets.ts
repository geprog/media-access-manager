import { extname, isAbsolute, relative, resolve } from 'node:path';

/**
 * URL prefix the branding route publishes files at – the directory of
 * `server/routes/branding/[...path].get.ts`. A theme setting pointing below it
 * names a file this app serves; anything else is somebody else's URL.
 */
export const BRANDING_URL_PREFIX = '/branding/';

/**
 * Origin the theme settings are parsed against. Never leaves this module: it
 * only gives the URL parser something to resolve a path against, so a setting
 * carrying an origin of its own can be told apart from one that does not.
 */
const PARSE_ORIGIN = 'http://branding.invalid';

/**
 * Content types the branding route answers with, and with that the file types a
 * theme setting may name. Every one of those settings ends up in an `<img>` or
 * a `<link rel="icon">`, so images are the complete set.
 */
const contentTypes: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

/** The theme settings that may name a file in the branding directory. */
export interface BrandingTheme {
  logo?: string
  logoDark?: string
  favicon?: string
}

export interface BrandingAsset {
  /** Absolute file the asset is read from. */
  path: string
  contentType: string
}

/**
 * Absolute directory the branding assets are read from, or `undefined` when a
 * deployment configured none. A relative value resolves against the working
 * directory, which is `/app` in the container image – so the default `branding`
 * needs nothing but a volume mounted at `/app/branding`.
 */
export function resolveBrandingRoot(dir: string, cwd: string): string | undefined {
  const trimmed = dir.trim();
  if (!trimmed)
    return undefined;
  return isAbsolute(trimmed) ? trimmed : resolve(cwd, trimmed);
}

/**
 * The files a deployment declared through `NUXT_PUBLIC_THEME_LOGO`,
 * `NUXT_PUBLIC_THEME_LOGO_DARK` and `NUXT_PUBLIC_THEME_FAVICON`, keyed by the
 * URL each one is published at.
 *
 * This is the complete set the route serves: a requested path is compared to
 * these keys and never turned into a file name, so a file sitting in `root`
 * without a setting naming it stays unreachable.
 *
 * Purely textual – the caller still has to find out whether the file exists.
 */
export function resolveBrandingAssets(root: string, theme: BrandingTheme): Map<string, BrandingAsset> {
  const assets = new Map<string, BrandingAsset>();
  // Extend this list when the theme gains another branded file.
  for (const declared of [theme.logo, theme.logoDark, theme.favicon]) {
    const entry = declared ? resolveDeclaredAsset(root, declared) : undefined;
    if (entry)
      assets.set(entry.url, entry.asset);
  }
  return assets;
}

/**
 * Reads one theme setting as a URL of this app below `BRANDING_URL_PREFIX`, and
 * pairs that URL with the file it names. `undefined` for a value this route has
 * no business serving: an empty setting, another origin, a path in `public/`,
 * or a file type that is not a branding image.
 */
function resolveDeclaredAsset(root: string, declared: string): { url: string, asset: BrandingAsset } | undefined {
  let url: URL;
  try {
    url = new URL(declared, PARSE_ORIGIN);
  }
  catch {
    // Not a URL at all, so it names nothing – here or anywhere.
    return undefined;
  }

  // An origin of its own means a CDN serves the file and this app never sees a
  // request for it. Parsing first also resolves `.` and `..`, drops query and
  // fragment and escapes what has to be escaped, so both the prefix test and
  // the key below see the path a browser will really ask for.
  if (url.origin !== PARSE_ORIGIN || !url.pathname.startsWith(BRANDING_URL_PREFIX))
    return undefined;

  let name: string;
  try {
    name = decodeURIComponent(url.pathname.slice(BRANDING_URL_PREFIX.length));
  }
  catch {
    // A malformed escape like `%ZZ` names no file either.
    return undefined;
  }
  if (!name || name.includes('\0'))
    return undefined;

  const contentType = contentTypes[extname(name).toLowerCase()];
  if (!contentType)
    return undefined;

  const path = resolve(root, name);
  // Not dead code, even though the value comes from a deployment rather than
  // from a request: the URL parser resolves `../`, but it leaves `%2e%2e%2f`
  // alone – that is a single segment to it and only becomes `../` once
  // decoded. A mistyped or templated setting can therefore still point outside
  // the directory, and publish that file to every anonymous visitor. A sibling
  // directory that merely starts with the same characters is outside it too.
  const inside = relative(root, path);
  if (!inside || inside.startsWith('..') || isAbsolute(inside))
    return undefined;

  return { url: url.pathname, asset: { path, contentType } };
}
