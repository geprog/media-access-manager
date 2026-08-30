/**
 * A `mailto:` URL with a pre-filled subject and body, or an empty string when
 * no address is configured — the caller then has nothing to link to.
 */
export function buildMailtoLink(
  email: string,
  fields: { subject?: string, body?: string } = {},
): string {
  const address = email.trim();
  if (!address) {
    return '';
  }
  const query = new URLSearchParams();
  if (fields.subject) {
    query.set('subject', fields.subject);
  }
  if (fields.body) {
    query.set('body', fields.body);
  }
  // `URLSearchParams` writes spaces as `+`, which mail clients drop into the
  // subject line verbatim instead of reading them as spaces.
  const search = query.toString().replace(/\+/g, '%20');
  return search ? `mailto:${address}?${search}` : `mailto:${address}`;
}
