import { getViewableContent } from '../../services/mediaService';
import { validateAndConsumeToken } from '../../services/tokenService';

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token');
  if (!token) {
    return { valid: false, message: 'invalid' };
  }
  const tokenRow = await validateAndConsumeToken(token);
  if (!tokenRow) {
    return { valid: false, message: 'invalid' };
  }
  const embed = await getViewableContent(tokenRow.mediaId);
  if (!embed) {
    return { valid: false, message: 'invalid' };
  }
  return { valid: true, embed };
});
