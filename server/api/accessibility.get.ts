import { verifyAllMediaAccessibility } from '../services/mediaService';
import { getAppHost } from '../utils/requestHost';

export default defineEventHandler((event) => {
  return verifyAllMediaAccessibility({ host: getAppHost(event) });
});
