export default defineEventHandler(async (event) => {
  if (event.path.startsWith('/api/auth/login'))
    return;
  if (event.path.startsWith('/api/_auth/'))
    return;
  if (event.path.startsWith('/api/access/'))
    return;
  // Buying access again is for visitors holding an expired link, not admins.
  if (event.path.startsWith('/api/purchase/'))
    return;
  // Mollie announces payment updates here; the handler trusts nothing but what
  // it reads back from Mollie itself.
  if (event.path === '/api/payments/webhook')
    return;
  if (event.path.startsWith('/api/')) {
    await requireUserSession(event);
  }
});
