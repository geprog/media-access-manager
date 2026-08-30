import { describe, expect, it } from 'vitest';
import { buildMailtoLink } from './mailto';

describe('buildMailtoLink', () => {
  it('returns a bare mailto link without fields', () => {
    expect(buildMailtoLink('support@example.com')).toBe('mailto:support@example.com');
  });

  it('encodes spaces as %20 so mail clients do not show plus signs', () => {
    expect(buildMailtoLink('support@example.com', { subject: 'Request for further access' }))
      .toBe('mailto:support@example.com?subject=Request%20for%20further%20access');
  });

  it('encodes line breaks in the body', () => {
    const link = buildMailtoLink('support@example.com', { body: 'Hello,\n\nplease help.' });
    expect(link.startsWith('mailto:support@example.com?body=')).toBe(true);
    expect(new URL(link).searchParams.get('body')).toBe('Hello,\n\nplease help.');
  });

  it('combines subject and body', () => {
    expect(buildMailtoLink('support@example.com', { subject: 'Access', body: 'Please' }))
      .toBe('mailto:support@example.com?subject=Access&body=Please');
  });

  it('trims the address and drops empty fields', () => {
    expect(buildMailtoLink('  support@example.com  ', { subject: '', body: undefined }))
      .toBe('mailto:support@example.com');
  });

  it('returns an empty string when no address is configured', () => {
    expect(buildMailtoLink('', { subject: 'Access' })).toBe('');
    expect(buildMailtoLink('   ')).toBe('');
  });
});
