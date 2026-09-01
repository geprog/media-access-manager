# Theming

The Media Access Manager is white-labelable. A deployment adapts it to a
customer's corporate design purely through environment variables – no rebuild,
no code changes, no admin UI.

All settings are optional; anything left empty keeps the default.

## Settings

| Variable                           | Example          | Effect                                                         |
| ---------------------------------- | ---------------- | -------------------------------------------------------------- |
| `NUXT_PUBLIC_THEME_TITLE`          | `Acme Media`     | Company name in the header and the browser tab                 |
| `NUXT_PUBLIC_THEME_LOGO`           | `/logo.svg`      | Logo next to the name                                          |
| `NUXT_PUBLIC_THEME_LOGO_DARK`      | `/logo-dark.svg` | Logo variant used in dark mode                                 |
| `NUXT_PUBLIC_THEME_LOGO_HEIGHT`    | `2.5rem`         | Rendered logo height (default `2rem`), width follows the ratio |
| `NUXT_PUBLIC_THEME_FAVICON`        | `/favicon.svg`   | Browser tab icon                                               |
| `NUXT_PUBLIC_THEME_COLORS_PRIMARY` | `#0f4c81`        | Brand color: buttons, links, focus rings                       |
| `NUXT_PUBLIC_THEME_COLORS_NEUTRAL` | `slate`          | Greys: text, surfaces, borders                                 |
| `NUXT_PUBLIC_THEME_COLORS_ERROR`   | `#c0392b`        | Also `_SECONDARY`, `_SUCCESS`, `_INFO`, `_WARNING`             |
| `NUXT_PUBLIC_THEME_RADIUS`         | `0.75rem`        | Roundness of buttons, inputs, cards, dialogs                   |
| `NUXT_PUBLIC_THEME_SPACING`        | `0.3rem`         | Density: scales every padding, margin and gap                  |
| `NUXT_PUBLIC_THEME_CONTAINER`      | `72rem`          | Maximum content width                                          |

Logos and favicons are URLs. Either drop the files into `public/` and reference
them as `/logo.svg`, or point at an absolute URL on the customer's CDN.

> **Quote hex colors in `.env` files.** An unquoted `#` starts a comment there, so
> `NUXT_PUBLIC_THEME_COLORS_PRIMARY=#0f4c81` arrives as an empty value and the
> setting is silently ignored. Write `="#0f4c81"` instead. Shell exports and
> Docker/Kubernetes environment blocks are unaffected.

## Publisher and credit

Two more pairs of settings name the people behind a deployment. They are not
`NUXT_PUBLIC_THEME_*` variables, because they are not part of the look.

The **publisher** is whoever is responsible for the media handed out here – the
company whose links and QR codes visitors receive, not a media provider like
Vimeo. A URL publishes it twice: as a globe icon next to the brand in the
header, and in the footer.

The **credit** names whoever built the deployment. Together the footer reads
_Published by Acme GmbH · Powered by Media Access Manager_.

| Variable                      | Example                  | Effect                                       |
| ----------------------------- | ------------------------ | -------------------------------------------- |
| `NUXT_PUBLIC_PUBLISHER_URL`   | `https://acme.example`   | Publisher link, in the header and the footer |
| `NUXT_PUBLIC_PUBLISHER_NAME`  | `Acme GmbH`              | Label of those links, defaults to the title  |
| `NUXT_PUBLIC_POWERED_BY_NAME` | `Acme Studio`            | Who is credited. Empty drops the credit      |
| `NUXT_PUBLIC_POWERED_BY_URL`  | `https://studio.example` | Where the credit links. Empty leaves it text |

The credit defaults to the upstream project, so an untouched deployment reads
_Powered by Media Access Manager_. An agency running the app for a customer
usually points it at itself.

## Colors

Every color accepts two kinds of value:

- **A CSS color** – `#0f4c81`, `rgb(15 76 129)`, `oklch(45% 0.09 250)`. A full
  11-shade scale is derived from it, following the lightness and chroma curve of
  the Tailwind CSS palettes. The value itself is used verbatim as shade 500, so
  buttons and links render in the exact brand color.
- **A Tailwind palette name** – `blue`, `slate`, `emerald`, `stone`, … Useful
  for `neutral`, where a customer rarely has a specified grey but usually a warm
  or cool preference.

### Picking a primary color

Use the color the customer puts on buttons, not the lightest tint of their
palette. Because the value becomes shade 500, the rest of the scale is built
around it:

- **Mid-tone colors work best** (roughly the brightness of a saturated blue,
  red or green). The scale then has room in both directions.
- **Very light colors** (yellow, gold, pastels) give buttons too little contrast
  against the white label text on them. Prefer a darkened variant of the brand
  color for `primary` and let the logo carry the light original – for a gold
  brand, `#b8912a` instead of `#e4ba39`.
- **Near-black colors** compress shades 600–950 into almost the same color, and
  dark mode – which uses shade 400 – ends up low contrast. Prefer the customer's
  accent color and set `NUXT_PUBLIC_THEME_COLORS_NEUTRAL` to a matching grey
  (`stone` for warm, `slate` for cool brands).

Colors that cannot be parsed are ignored with a warning in the browser console;
the default palette stays in place.

## Shape and density

`RADIUS` and `SPACING` are the two knobs that carry most of a corporate design's
"feel":

- `RADIUS` sets the base corner radius (default `0.25rem`). Every component
  scales off it, so `0` gives a strictly square design and `0.75rem` a soft one.
- `SPACING` sets the base spacing unit (default `0.25rem`). Every padding,
  margin and gap in the app is a multiple of it, so lowering it to `0.2rem`
  tightens the whole UI and raising it to `0.3rem` makes it airier.

Both take a plain CSS length (`0`, `4px`, `0.75rem`, `2%`). Anything else is
ignored with a warning.

## How it works

`plugins/theme.ts` renders the configuration into a single unlayered
`:root` rule of CSS custom properties, built by `utils/theme.ts`.

It only overrides the `--ui-color-<alias>-<shade>` scales. Nuxt UI derives
everything else from those – the light and dark mode primary, surfaces, borders,
text tones – so the theme stays consistent without enumerating every variable.
The rule is intentionally not inside a cascade layer: Tailwind and Nuxt UI
declare their defaults in `@layer theme`, and unlayered declarations win over
any layer no matter in which order the stylesheets load.

## Example: a customer deployment

```env
NUXT_PUBLIC_THEME_TITLE=Acme Media
NUXT_PUBLIC_THEME_LOGO=/acme-logo.svg
NUXT_PUBLIC_THEME_FAVICON=/acme-favicon.svg
NUXT_PUBLIC_PUBLISHER_URL=https://acme.example
NUXT_PUBLIC_THEME_COLORS_PRIMARY="#0f4c81"
NUXT_PUBLIC_THEME_COLORS_NEUTRAL=slate
NUXT_PUBLIC_THEME_RADIUS=0.5rem
```
