export default defineEventHandler(async (event) => {
  if (event.path.startsWith('/api/auth/login'))
    return;
  if (event.path.startsWith('/api/_auth/'))
    return;
  if (event.path.startsWith('/api/access/'))
    return;
  if (event.path.startsWith('/api/')) {
    await requireUserSession(event);
  }
});
