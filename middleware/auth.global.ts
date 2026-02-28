export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn } = useUserSession();

  if (!loggedIn.value && !to.path.includes('/login')) {
    return navigateTo('/login');
  }
  if (loggedIn.value && to.path.includes('/login')) {
    return navigateTo('/');
  }
});
