import { listMediaGroups } from '../../services/mediaGroupService';

export default defineEventHandler(() => {
  return listMediaGroups();
});
