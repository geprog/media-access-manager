import { verifyAdminPassword } from '../../services/authService';

export default defineEventHandler(async (event) => {
  const body = await readBody<{ password?: string }>(event);
  const password = body?.password ?? '';
  if (!password) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }
  const valid = await verifyAdminPassword(password);
  if (!valid) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }
  await setUserSession(event, {
    user: { role: 'admin' },
    loggedInAt: Date.now(),
  });
  return { ok: true };
});
