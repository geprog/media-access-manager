export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn } = useUserSession();

  if (!loggedIn.value && !to.path.includes('/auth/login')) {
    return navigateTo('/auth/login');
  }
  if (loggedIn.value && to.path.includes('/auth/login')) {
    return navigateTo('/');
  }
});
