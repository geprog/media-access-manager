import { clampChroma, converter, formatHex, parse } from 'culori';
import tailwindColors from 'tailwindcss/colors';

/** The eleven shades every Nuxt UI color alias is built from. */
export const COLOR_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/** Nuxt UI color aliases a deployment may re-map to its own brand colors. */
export const COLOR_ALIASES = ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral'] as const;

export type ColorShade = (typeof COLOR_SHADES)[number];
export type ColorAlias = (typeof COLOR_ALIASES)[number];
export type Palette = Record<ColorShade, string>;

export interface ThemeConfig {
  colors?: Partial<Record<ColorAlias, string>>
  /** Corner radius base, scales every `rounded-*` utility. */
  radius?: string
  /** Spacing base, scales every padding/margin/gap utility. */
  spacing?: string
  /** Max width of centered page containers. */
  container?: string
}

const toOklch = converter('oklch');

/**
 * Lightness and chroma per shade, averaged from the Tailwind CSS v4 palettes.
 * Chroma is a fraction of the brand color's own chroma, so feeding a Tailwind
 * 500 shade back in reproduces that palette closely.
 */
const SHADE_CURVE: Record<ColorShade, { lightness: number, chroma: number }> = {
  50: { lightness: 0.971, chroma: 0.07 },
  100: { lightness: 0.936, chroma: 0.16 },
  200: { lightness: 0.885, chroma: 0.30 },
  300: { lightness: 0.810, chroma: 0.55 },
  400: { lightness: 0.710, chroma: 0.82 },
  500: { lightness: 0.637, chroma: 1.00 },
  600: { lightness: 0.563, chroma: 0.98 },
  700: { lightness: 0.492, chroma: 0.86 },
  800: { lightness: 0.432, chroma: 0.72 },
  900: { lightness: 0.383, chroma: 0.58 },
  950: { lightness: 0.268, chroma: 0.38 },
};

/** The shade the configured brand color is placed at verbatim. */
const ANCHOR_SHADE = 500;

/** Plain CSS lengths only – the values end up unescaped in a `<style>` tag. */
const CSS_LENGTH = /^(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|ch|vw|vh|%)?$/;

/**
 * Builds a full Tailwind-shaped palette around `color`, which is placed at
 * shade 500 unchanged so buttons and links render in the exact brand color.
 *
 * Returns `undefined` for values CSS could not parse as a color.
 */
export function generatePalette(color: string): Palette | undefined {
  const parsed = parse(color);
  if (!parsed)
    return undefined;

  const base = toOklch(parsed);
  const anchor = SHADE_CURVE[ANCHOR_SHADE].lightness;
  const palette = {} as Palette;

  for (const shade of COLOR_SHADES) {
    if (shade === ANCHOR_SHADE) {
      palette[shade] = formatHex(parsed);
      continue;
    }

    const { lightness, chroma } = SHADE_CURVE[shade];
    // Stretch the reference curve so it meets the brand color at the anchor:
    // lighter shades fade towards white, darker ones scale down towards black.
    const l = lightness >= anchor
      ? 1 - (1 - lightness) * (1 - base.l) / (1 - anchor)
      : base.l * (lightness / anchor);

    // Hue is undefined for greys; keeping the chroma at 0 makes the hue moot.
    palette[shade] = formatHex(clampChroma(
      { mode: 'oklch', l, c: base.c * chroma, h: base.h ?? 0 },
      'oklch',
      'rgb',
    ));
  }

  return palette;
}

/**
 * Resolves a configured color, which is either the name of a Tailwind palette
 * (`blue`, `slate`, …) or any CSS color to derive a brand palette from.
 */
export function resolvePalette(color: string): Palette | undefined {
  const named = (tailwindColors as Record<string, unknown>)[color];
  if (named && typeof named === 'object') {
    const shades = named as Record<number, string | undefined>;
    if (COLOR_SHADES.every(shade => typeof shades[shade] === 'string'))
      return Object.fromEntries(COLOR_SHADES.map(shade => [shade, shades[shade]])) as Palette;
  }

  return generatePalette(color);
}

/**
 * Renders the deployment's theme as CSS custom properties.
 *
 * The rule is deliberately unlayered: Tailwind and Nuxt UI declare their
 * defaults inside `@layer theme`, and unlayered declarations win over any
 * layer regardless of the order the stylesheets end up in.
 *
 * Only the `--ui-color-*` scales are overridden – Nuxt UI derives everything
 * else (`--ui-primary`, its dark mode counterpart, surfaces, borders) from
 * them on its own.
 */
export function buildThemeCss(theme: ThemeConfig): string {
  const declarations: string[] = [];

  for (const alias of COLOR_ALIASES) {
    const color = theme.colors?.[alias]?.trim();
    if (!color)
      continue;

    const palette = resolvePalette(color);
    if (!palette) {
      console.warn(`[theme] Ignoring "${alias}": "${color}" is not a CSS color or Tailwind palette name.`);
      continue;
    }

    for (const shade of COLOR_SHADES)
      declarations.push(`--ui-color-${alias}-${shade}: ${palette[shade]};`);
  }

  const lengths = [
    ['--ui-radius', theme.radius],
    ['--spacing', theme.spacing],
    ['--ui-container', theme.container],
  ] as const;

  for (const [variable, configured] of lengths) {
    const length = configured?.trim();
    if (!length)
      continue;

    if (!CSS_LENGTH.test(length)) {
      console.warn(`[theme] Ignoring "${variable}": "${length}" is not a plain CSS length.`);
      continue;
    }

    declarations.push(`${variable}: ${length};`);
  }

  if (!declarations.length)
    return '';

  return `:root, :host {\n  ${declarations.join('\n  ')}\n}\n`;
}
