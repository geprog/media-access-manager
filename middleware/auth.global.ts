export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn } = useUserSession();

  // Public pages (e.g. the token access page) are reachable by anyone holding
  // the link, so they must never be sent through the admin login.
  if (to.meta.public)
    return;

  if (!loggedIn.value && !to.path.includes('/auth/login')) {
    return navigateTo('/auth/login');
  }
  if (loggedIn.value && to.path.includes('/auth/login')) {
    return navigateTo('/');
  }
});
