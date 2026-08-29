import type { AccessibilityIssue, AccessibilityReport } from '../services/providers/types';

export interface VimeoAccessibilityInput {
  /** `null` when the video could not be read from the Vimeo API. */
  video: {
    privacy: { view: string, embed: string }
    embedHtml: string | null
  } | null
  /** Whitelisted domains; only meaningful while `privacy.embed` is `whitelist`. */
  domains: string[]
  /** Whether the oEmbed call the public viewer page relies on returned an embed. */
  embedFetched: boolean
  /** `false` when no API token is configured, so privacy could not be read. */
  apiChecked: boolean
  /** Hostname this app is served from, without port; `undefined` when unknown. */
  host?: string
}

/**
 * Turns what we could observe about a Vimeo video into an admin-facing verdict.
 *
 * A successful oEmbed call is not proof of playback: Vimeo serves embed code
 * for domain-restricted videos to anyone, and only the browser is turned away
 * on a non-whitelisted domain. Domain limits are therefore surfaced unless this
 * app's own host is on the whitelist, in which case playback really does work.
 */
export function diagnoseVimeoAccessibility(input: VimeoAccessibilityInput): AccessibilityReport {
  const { video, domains, embedFetched, apiChecked, host } = input;
  const issues: AccessibilityIssue[] = [];

  if (!apiChecked) {
    issues.push({ code: 'vimeo_no_api_token', severity: 'warning' });
  }
  else if (!video) {
    issues.push({ code: 'vimeo_video_not_found', severity: 'error' });
  }
  else {
    const { view, embed } = video.privacy;
    if (view === 'password') {
      issues.push({ code: 'vimeo_password_protected', severity: 'error' });
    }
    // Unlisted videos are reachable only through their private link hash, which
    // media rows do not carry, so oEmbed answers 404 for them.
    if (view === 'unlisted' && !embedFetched) {
      issues.push({ code: 'vimeo_unlisted_needs_hash', severity: 'error' });
    }
    if (embed === 'private') {
      issues.push({ code: 'vimeo_embed_disabled', severity: 'error' });
    }
    else if (embed === 'whitelist') {
      const issue = describeWhitelist(domains, host);
      if (issue) {
        issues.push(issue);
      }
    }
  }

  const hasError = issues.some(issue => issue.severity === 'error');
  if (!embedFetched && !hasError && apiChecked) {
    issues.push({ code: 'vimeo_embed_unavailable', severity: 'error' });
  }

  return { status: deriveStatus(issues, embedFetched, apiChecked), issues };
}

/**
 * Vimeo matches whitelist entries exactly, so `example.com` does not cover
 * `www.example.com`. Comparing loosely here would wrongly report a video as
 * playable, so only an exact, case-insensitive match clears the warning.
 */
function describeWhitelist(domains: string[], host?: string): AccessibilityIssue | null {
  if (domains.length === 0) {
    return { code: 'vimeo_embed_whitelist_empty', severity: 'error' };
  }
  const allowed = domains.map(domain => domain.trim().toLowerCase());
  if (host && allowed.includes(host.trim().toLowerCase())) {
    return null;
  }
  const details = { domains: domains.join(', ') };
  return host
    ? { code: 'vimeo_embed_whitelist_host_mismatch', severity: 'warning', details: { ...details, host } }
    : { code: 'vimeo_embed_whitelist_domains', severity: 'warning', details };
}

function deriveStatus(
  issues: AccessibilityIssue[],
  embedFetched: boolean,
  apiChecked: boolean,
): AccessibilityReport['status'] {
  if (issues.some(issue => issue.severity === 'error')) {
    return 'error';
  }
  if (!embedFetched) {
    return apiChecked ? 'error' : 'unknown';
  }
  return issues.length > 0 ? 'warning' : 'ok';
}
