import { describe, expect, it } from 'vitest';
import { diagnoseVimeoAccessibility } from './vimeoAccessibility';

function video(view: string, embed: string, embedHtml: string | null = '<iframe></iframe>') {
  return { privacy: { view, embed }, embedHtml };
}

const WORKING = {
  video: video('disable', 'whitelist'),
  domains: ['peac-video.com'],
  embedFetched: true,
  apiChecked: true,
};

describe('diagnoseVimeoAccessibility', () => {
  it('warns which domains a whitelisted video plays on when the host is unknown', () => {
    const report = diagnoseVimeoAccessibility(WORKING);
    expect(report.status).toBe('warning');
    expect(report.issues).toEqual([
      { code: 'vimeo_embed_whitelist_domains', severity: 'warning', details: { domains: 'peac-video.com' } },
    ]);
  });

  it('passes silently when the app host is on the whitelist', () => {
    const report = diagnoseVimeoAccessibility({ ...WORKING, host: 'peac-video.com' });
    expect(report).toEqual({ status: 'ok', issues: [] });
  });

  it('matches the whitelist regardless of casing', () => {
    const report = diagnoseVimeoAccessibility({ ...WORKING, host: 'PEAC-Video.COM' });
    expect(report).toEqual({ status: 'ok', issues: [] });
  });

  it('names both sides when the app host is not on the whitelist', () => {
    const report = diagnoseVimeoAccessibility({
      ...WORKING,
      domains: ['peac-video.com', 'localhost'],
      host: 'staging.example.com',
    });
    expect(report.status).toBe('warning');
    expect(report.issues).toEqual([
      {
        code: 'vimeo_embed_whitelist_host_mismatch',
        severity: 'warning',
        details: { domains: 'peac-video.com, localhost', host: 'staging.example.com' },
      },
    ]);
  });

  it('does not treat a subdomain as covered by the parent domain', () => {
    const report = diagnoseVimeoAccessibility({ ...WORKING, host: 'www.peac-video.com' });
    expect(report.issues.map(i => i.code)).toEqual(['vimeo_embed_whitelist_host_mismatch']);
  });

  it('passes a video that is embeddable anywhere', () => {
    const report = diagnoseVimeoAccessibility({ ...WORKING, video: video('anybody', 'public'), domains: [] });
    expect(report).toEqual({ status: 'ok', issues: [] });
  });

  it('reports a password-protected video as not playable', () => {
    const report = diagnoseVimeoAccessibility({
      video: video('password', 'private', null),
      domains: [],
      embedFetched: false,
      apiChecked: true,
    });
    expect(report.status).toBe('error');
    expect(report.issues.map(i => i.code)).toEqual([
      'vimeo_password_protected',
      'vimeo_embed_disabled',
    ]);
  });

  it('flags a whitelist without any domain as not playable', () => {
    const report = diagnoseVimeoAccessibility({ ...WORKING, domains: [], embedFetched: false });
    expect(report.status).toBe('error');
    expect(report.issues.map(i => i.code)).toContain('vimeo_embed_whitelist_empty');
  });

  it('explains that unlisted videos need a hash the app does not store', () => {
    const report = diagnoseVimeoAccessibility({
      video: video('unlisted', 'public'),
      domains: [],
      embedFetched: false,
      apiChecked: true,
    });
    expect(report.status).toBe('error');
    expect(report.issues.map(i => i.code)).toEqual(['vimeo_unlisted_needs_hash']);
  });

  it('reports a video missing from the connected account', () => {
    const report = diagnoseVimeoAccessibility({
      video: null,
      domains: [],
      embedFetched: false,
      apiChecked: true,
    });
    expect(report).toEqual({
      status: 'error',
      issues: [{ code: 'vimeo_video_not_found', severity: 'error' }],
    });
  });

  it('falls back to a generic failure when the settings look fine but no embed came back', () => {
    const report = diagnoseVimeoAccessibility({
      video: video('anybody', 'public'),
      domains: [],
      embedFetched: false,
      apiChecked: true,
    });
    expect(report.status).toBe('error');
    expect(report.issues.map(i => i.code)).toEqual(['vimeo_embed_unavailable']);
  });

  it('stays unknown without an API token when the embed cannot be fetched', () => {
    const report = diagnoseVimeoAccessibility({
      video: null,
      domains: [],
      embedFetched: false,
      apiChecked: false,
    });
    expect(report.status).toBe('unknown');
    expect(report.issues.map(i => i.code)).toEqual(['vimeo_no_api_token']);
  });

  it('only warns without an API token when the embed could be fetched', () => {
    const report = diagnoseVimeoAccessibility({
      video: null,
      domains: [],
      embedFetched: true,
      apiChecked: false,
    });
    expect(report.status).toBe('warning');
    expect(report.issues.map(i => i.code)).toEqual(['vimeo_no_api_token']);
  });
});
