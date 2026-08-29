import { buildThemeCss } from '~/utils/theme';

/**
 * Applies the deployment's white-label theme: branding in the document head and
 * the brand colors, roundness and spacing as CSS custom properties.
 *
 * Runs as a plugin rather than from `app.config.ts` because the values come
 * from `runtimeConfig`, which is only known once the server starts.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const { theme } = useRuntimeConfig().public;
  const css = buildThemeCss(theme);

  useHead({
    title: theme.title,
    titleTemplate: title => (title && title !== theme.title ? `${title} · ${theme.title}` : theme.title),
    link: theme.favicon ? [{ rel: 'icon', href: theme.favicon }] : [],
  });

  if (!css)
    return;

  if (import.meta.client && !nuxtApp.payload.serverRendered) {
    // Without SSR the head is only flushed after the first paint, which would
    // show the default palette for a frame. Put the theme in the DOM right away.
    const style = document.createElement('style');
    style.innerHTML = css;
    document.head.appendChild(style);
    return;
  }

  useHead({ style: [{ innerHTML: css }] });
});
