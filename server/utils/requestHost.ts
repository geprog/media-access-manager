import type { H3Event } from 'h3';

/**
 * Hostname the admin is reaching this app on, without port, honouring
 * `x-forwarded-host` so a deployment behind a reverse proxy reports the public
 * domain rather than the internal one.
 */
export function getAppHost(event: H3Event): string | undefined {
  try {
    return getRequestURL(event, { xForwardedHost: true }).hostname || undefined;
  }
  catch {
    return undefined;
  }
}
