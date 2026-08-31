import { getProviderSetupInstructionKeys } from '../../../services/mediaService';

export default defineEventHandler((event) => {
  const providerId = getRouterParam(event, 'providerId');
  if (!providerId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  return { providerId, instructionKeys: getProviderSetupInstructionKeys(providerId) };
});
