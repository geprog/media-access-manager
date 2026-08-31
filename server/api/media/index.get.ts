import { getMediaFromDb } from '../../services/mediaService';

export default defineEventHandler(() => {
  return getMediaFromDb();
});
