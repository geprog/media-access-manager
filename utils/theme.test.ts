import { converter, parse } from 'culori';
import { describe, expect, it, vi } from 'vitest';
import { buildThemeCss, COLOR_SHADES, generatePalette, resolvePalette } from './theme';

const toOklch = converter('oklch');

function lightnessOf(hex: string): number {
  return toOklch(parse(hex)!).l;
}

describe('generatePalette', () => {
  it('places the brand color at shade 500 unchanged', () => {
    expect(generatePalette('#0f4c81')![500]).toBe('#0f4c81');
  });

  it('normalizes other notations to hex', () => {
    expect(generatePalette('rgb(15 76 129)')![500]).toBe('#0f4c81');
  });

  it('returns every shade', () => {
    const palette = generatePalette('#0f4c81')!;
    expect(Object.keys(palette).map(Number).sort((a, b) => a - b)).toEqual([...COLOR_SHADES]);
    expect(Object.values(palette).every(hex => /^#[0-9a-f]{6}$/.test(hex))).toBe(true);
  });

  it('gets darker with every step', () => {
    const palette = generatePalette('#0f4c81')!;
    const lightness = COLOR_SHADES.map(shade => lightnessOf(palette[shade]));
    expect(lightness).toEqual([...lightness].sort((a, b) => b - a));
  });

  it('stays grey for an achromatic brand color', () => {
    // A pure grey carries no hue, so no shade may invent one.
    const palette = generatePalette('#808080')!;
    expect(COLOR_SHADES.every(shade => /^#(\w\w)\1\1$/.test(palette[shade]))).toBe(true);
  });

  it('keeps the subtle tint of a near-grey brand color', () => {
    // Tailwind's own gray-500, a slightly cool grey.
    const palette = generatePalette('#6b7280')!;
    expect(toOklch(parse(palette[200])!).c).toBeGreaterThan(0);
  });

  it('keeps very light and very dark brand colors monotonic', () => {
    for (const color of ['#ffd100', '#1a1a1a', '#ffffff', '#000000']) {
      const lightness = COLOR_SHADES.map(shade => lightnessOf(generatePalette(color)![shade]));
      expect(lightness, color).toEqual([...lightness].sort((a, b) => b - a));
    }
  });

  it('approximates the Tailwind palette its 500 shade was taken from', () => {
    // Tailwind blue-500; the generated ramp should land close to blue-50…400.
    const palette = generatePalette('oklch(62.3% 0.214 259.815)')!;
    const tailwindBlue = { 50: '#eff6ff', 100: '#dbeafe', 200: '#bedbff', 300: '#8ec5ff', 400: '#51a2ff' };

    for (const [shade, expected] of Object.entries(tailwindBlue))
      expect(Math.abs(lightnessOf(palette[Number(shade) as 50]) - lightnessOf(expected)), shade).toBeLessThan(0.03);
  });

  it('rejects values that are not colors', () => {
    expect(generatePalette('not-a-color')).toBeUndefined();
    expect(generatePalette('')).toBeUndefined();
  });
});

describe('resolvePalette', () => {
  it('passes Tailwind palette names through untouched', () => {
    expect(resolvePalette('blue')![500]).toBe('oklch(62.3% 0.214 259.815)');
    expect(resolvePalette('slate')![50]).toBe('oklch(98.4% 0.003 247.858)');
  });

  it('derives a palette from a CSS color', () => {
    expect(resolvePalette('#e10600')![500]).toBe('#e10600');
  });

  it('does not mistake non-palette exports for palettes', () => {
    // `tailwindcss/colors` also exports `inherit`, `current`, `black`, …
    expect(resolvePalette('inherit')).toBeUndefined();
    expect(resolvePalette('black')![500]).toBe('#000000');
  });
});

describe('buildThemeCss', () => {
  it('is empty when nothing is configured', () => {
    expect(buildThemeCss({})).toBe('');
    expect(buildThemeCss({ colors: { primary: '' }, radius: '  ' })).toBe('');
  });

  it('overrides the shade scale of the configured aliases only', () => {
    const css = buildThemeCss({ colors: { primary: '#0f4c81' } });

    expect(css).toContain('--ui-color-primary-500: #0f4c81;');
    expect(css).toContain('--ui-color-primary-50:');
    expect(css).toContain('--ui-color-primary-950:');
    expect(css).not.toContain('--ui-color-neutral');
    // Nuxt UI derives `--ui-primary` from the scale itself, including dark mode.
    expect(css).not.toContain('--ui-primary:');
  });

  it('stays unlayered so it wins over the Tailwind and Nuxt UI defaults', () => {
    expect(buildThemeCss({ radius: '0.5rem' })).toMatch(/^:root, :host \{/);
  });

  it('emits the spacing, radius and container scales', () => {
    const css = buildThemeCss({ radius: '0.5rem', spacing: '0.3rem', container: '72rem' });

    expect(css).toContain('--ui-radius: 0.5rem;');
    expect(css).toContain('--spacing: 0.3rem;');
    expect(css).toContain('--ui-container: 72rem;');
  });

  it('skips unusable values instead of emitting broken CSS', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const css = buildThemeCss({
      colors: { primary: 'chartreuse-ish' },
      radius: '1rem; } body { display: none } :root {',
    });

    expect(css).toBe('');
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
