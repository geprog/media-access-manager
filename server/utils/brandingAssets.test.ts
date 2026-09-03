import { describe, expect, it } from 'vitest';
import { BRANDING_URL_PREFIX, resolveBrandingAssets, resolveBrandingRoot } from './brandingAssets';

describe('brandingAssets', () => {
  describe('resolveBrandingRoot', () => {
    it('keeps an absolute directory', () => {
      expect(resolveBrandingRoot('/app/branding', '/app')).toBe('/app/branding');
    });

    it('resolves a relative directory against the working directory', () => {
      expect(resolveBrandingRoot('branding', '/app')).toBe('/app/branding');
    });

    it('returns undefined when nothing is configured', () => {
      expect(resolveBrandingRoot('', '/app')).toBeUndefined();
      expect(resolveBrandingRoot('   ', '/app')).toBeUndefined();
    });
  });

  describe('resolveBrandingAssets', () => {
    const root = '/app/branding';

    it('publishes every declared file at the URL it was configured with', () => {
      const assets = resolveBrandingAssets(root, {
        logo: '/branding/logo.svg',
        logoDark: '/branding/logo-dark.svg',
        favicon: '/branding/favicon.ico',
      });
      expect([...assets]).toEqual([
        ['/branding/logo.svg', { path: '/app/branding/logo.svg', contentType: 'image/svg+xml' }],
        ['/branding/logo-dark.svg', { path: '/app/branding/logo-dark.svg', contentType: 'image/svg+xml' }],
        ['/branding/favicon.ico', { path: '/app/branding/favicon.ico', contentType: 'image/x-icon' }],
      ]);
    });

    it('publishes nothing the theme does not name', () => {
      const assets = resolveBrandingAssets(root, { logo: '/branding/logo.svg' });
      expect(assets.size).toBe(1);
      // Both lie in the same directory, but no setting names them.
      expect(assets.get('/branding/draft.png')).toBeUndefined();
      expect(assets.get('/branding/favicon.ico')).toBeUndefined();
    });

    it('publishes nothing when the theme declares nothing', () => {
      expect(resolveBrandingAssets(root, {}).size).toBe(0);
      expect(resolveBrandingAssets(root, { logo: '', logoDark: '   ', favicon: '' }).size).toBe(0);
    });

    it('publishes a file in a subdirectory', () => {
      expect(resolveBrandingAssets(root, { logo: '/branding/acme/logo.png' }).get('/branding/acme/logo.png'))
        .toEqual({ path: '/app/branding/acme/logo.png', contentType: 'image/png' });
    });

    it('matches the extension case-insensitively', () => {
      expect(resolveBrandingAssets(root, { logo: '/branding/LOGO.PNG' }).get('/branding/LOGO.PNG')?.contentType)
        .toBe('image/png');
    });

    it('publishes one entry when two settings name the same file', () => {
      expect(resolveBrandingAssets(root, {
        logo: '/branding/logo.svg',
        logoDark: '/branding/logo.svg',
      }).size).toBe(1);
    });

    it('publishes an escaped URL for a name with a space', () => {
      // Escaped or not, a browser asks for the escaped form – and the file on
      // disk carries the decoded name either way.
      for (const logo of ['/branding/peac logo.png', '/branding/peac%20logo.png']) {
        expect(resolveBrandingAssets(root, { logo }).get('/branding/peac%20logo.png'))
          .toEqual({ path: '/app/branding/peac logo.png', contentType: 'image/png' });
      }
    });

    it('escapes a non-ASCII name the way a browser asks for it', () => {
      expect(resolveBrandingAssets(root, { logo: '/branding/logo-ü.png' }).get('/branding/logo-%C3%BC.png'))
        .toEqual({ path: '/app/branding/logo-ü.png', contentType: 'image/png' });
    });

    it('ignores a query string and a fragment', () => {
      // A cache-busting `?v=2` is not part of the path a request arrives with.
      expect(resolveBrandingAssets(root, { logo: '/branding/logo.svg?v=2' }).get('/branding/logo.svg'))
        .toEqual({ path: '/app/branding/logo.svg', contentType: 'image/svg+xml' });
      expect(resolveBrandingAssets(root, { favicon: '/branding/favicon.ico#x' }).get('/branding/favicon.ico'))
        .toBeDefined();
    });

    it('normalizes a relative segment that stays in the directory', () => {
      expect(resolveBrandingAssets(root, { logo: '/branding/acme/../logo.svg' }).get('/branding/logo.svg'))
        .toEqual({ path: '/app/branding/logo.svg', contentType: 'image/svg+xml' });
    });

    it('ignores a setting another origin serves', () => {
      expect(resolveBrandingAssets(root, { logo: 'https://cdn.example/logo.svg' }).size).toBe(0);
      expect(resolveBrandingAssets(root, { logo: '//cdn.example/logo.svg' }).size).toBe(0);
      expect(resolveBrandingAssets(root, { logo: 'data:image/svg+xml,<svg/>' }).size).toBe(0);
    });

    it('ignores a setting outside the branding URL', () => {
      // A file in `public/`, a value relative to whatever page is open, and
      // prefixes that only look like the route.
      expect(resolveBrandingAssets(root, { logo: '/logo.svg' }).size).toBe(0);
      expect(resolveBrandingAssets(root, { logo: 'logo.svg' }).size).toBe(0);
      expect(resolveBrandingAssets(root, { logo: '/BRANDING/logo.svg' }).size).toBe(0);
      expect(resolveBrandingAssets(root, { logo: '/branding-private/logo.svg' }).size).toBe(0);
      expect(resolveBrandingAssets(root, { logo: '/branding/' }).size).toBe(0);
      expect(resolveBrandingAssets(root, { logo: '/branding/../logo.svg' }).size).toBe(0);
      expect(resolveBrandingAssets(root, { logo: '/app/data/mam.db.png' }).size).toBe(0);
    });

    it('ignores a file type that is not a branding image', () => {
      expect(resolveBrandingAssets(root, { logo: '/branding/mam.db' }).size).toBe(0);
      expect(resolveBrandingAssets(root, { logo: '/branding/logo' }).size).toBe(0);
    });

    it('ignores an escaped separator that leaves the directory', () => {
      // `%2e%2e%2f` is a single URL segment, so the parser does not resolve it
      // away – decoded it would still point outside the directory.
      // cspell:disable – the escapes read as words to the spell checker
      expect(resolveBrandingAssets(root, { logo: '/branding/%2e%2e%2fdata%2fmam.db.png' }).size).toBe(0);
      expect(resolveBrandingAssets(root, { logo: '/branding/%2e%2e%2fbranding-private%2flogo.png' }).size).toBe(0);
      // cspell:enable
    });

    it('ignores a malformed escape', () => {
      expect(resolveBrandingAssets(root, { logo: '/branding/lo%ZZgo.png' }).size).toBe(0);
    });

    it('ignores a NUL byte', () => {
      expect(resolveBrandingAssets(root, { logo: '/branding/logo%00.png' }).size).toBe(0);
    });

    it('answers the URL the route builds from a request', () => {
      // Exactly what `server/routes/branding/[...path].get.ts` looks up for
      // `GET /branding/logo.svg`, and for a request naming another file.
      const assets = resolveBrandingAssets(root, { logo: '/branding/logo.svg' });
      expect(assets.get(`${BRANDING_URL_PREFIX}logo.svg`)).toBeDefined();
      expect(assets.get(`${BRANDING_URL_PREFIX}other.svg`)).toBeUndefined();
    });
  });
});
