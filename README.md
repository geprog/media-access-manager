# Media Access Manager

Hand out time- and usage-limited access to hosted media – as links or printed
QR codes – without giving anyone the media itself.

An admin picks videos from a media provider (Vimeo today), optionally bundles
them into groups, and generates access tokens: single ones, or batches of
hundreds exported as a QR code ZIP or PDF ready for print. A visitor opens
`https://your-host/{token}`, and as long as the token's date window is open and
its views are not used up, the media plays as an embed. Nothing is downloadable,
no account is needed, and no visitor is tracked.

The whole UI is white-labelable through environment variables – logo, company
name, colors, roundness – so a deployment can carry a customer's corporate
design without a rebuild.

> [!NOTE]
> **Built with AI support.** Large parts of this project – code, tests and
> documentation – were written with the help of AI coding assistants (see
> [AGENTS.md](AGENTS.md) for the guidelines they follow) and reviewed by humans
> before merging. Treat it accordingly: read the code before you run it in
> production, and please report anything that looks off.

## Features

- **Token-based access** – every token carries an optional start date, end date
  and view limit; an invalid token shows a friendly notice instead of the media
- **Media groups** – one token (and one printed QR code) can hand out a whole
  set of media, with the view limit counted _per media_ rather than once for the
  entire group
- **Batch generation** – create many tokens at once and download their QR codes
  as a ZIP of images or a print-ready PDF
- **Provider abstraction** – media sources implement a small interface and
  return [oEmbed](https://oembed.com/) responses; Vimeo ships with the app,
  further providers plug in
- **Playback pre-flight check** – the admin UI verifies whether a token holder
  could actually watch a media (privacy settings, domain whitelists) and shows
  a provider-specific checklist when it could not
- **White-label theming** – brand color, logo, favicon, title, radius and
  density from environment variables, see [docs/theming.md](docs/theming.md)
- **Single admin password** – no user accounts, no user management
- **Localized** – English and German, all strings via i18n keys
- **No tracking** – no analytics, no device identifiers, no visitor accounts

## How it works

**Admin**

1. Log in with the global admin password.
2. Add media – the app lists what is available at the provider – and optionally
   arrange media into groups.
3. Create a token or a batch of tokens for a media or a group, with a date
   window and/or a view limit.
4. Download the QR codes and print, mail or hand them out.

**Visitor**

- _Single-media token_: opening `/{token}` validates it, spends one view and
  renders the player.
- _Group token_: `/{token}` lists the group's media with each entry's remaining
  views – browsing costs nothing. Picking one opens `/{token}/{mediaId}`, which
  spends a view on that media alone. Media that are used up stay visible, marked
  as such, so the visitor sees what they had and can ask for more.
- If access has ended, the page explains why and – when
  `NUXT_PUBLIC_SUPPORT_EMAIL` is configured – offers a mail link to request a
  new one.

For the full picture of the data model and the flows, read
[docs/concept.md](docs/concept.md).

## Tech stack

[Nuxt 4](https://nuxt.com) (SPA, `ssr: false`) with [Nuxt UI](https://ui.nuxt.com)
and Tailwind CSS, [Drizzle ORM](https://orm.drizzle.team) on SQLite
(`better-sqlite3`), [nuxt-auth-utils](https://github.com/atinux/nuxt-auth-utils)
for the admin session, `@nuxtjs/i18n` for translations, Vitest for unit tests and
Playwright for end-to-end tests. Package manager is **pnpm**, Node **24+**.

## Getting started

```bash
nvm use 24
pnpm install
cp .env.example .env   # then edit it, see Configuration
pnpm dev
```

The app runs at <http://localhost:3000>. Log in at `/auth/login` with the
password from `NUXT_ADMIN_PASSWORD`.

The SQLite database is created at `data/mam.db` on first use and migrations are
applied automatically when the server first touches it – no manual setup step.

## Configuration

All settings are environment variables (Nuxt `runtimeConfig`). Copy
[.env.example](.env.example) as a starting point.

| Variable                    | Required          | Description                                                                       |
| --------------------------- | ----------------- | --------------------------------------------------------------------------------- |
| `NUXT_ADMIN_PASSWORD`       | **in production** | The single password protecting the admin UI. `pnpm dev` falls back to `password`. |
| `NUXT_SESSION_PASSWORD`     | **in production** | Secret sealing the admin session cookie, at least 32 characters.                  |
| `NUXT_VIMEO_API_TOKEN`      | for Vimeo         | Vimeo API token used to list your videos and check their privacy settings.        |
| `NUXT_PUBLIC_SUPPORT_EMAIL` | no                | Address offered to visitors whose access has ended. Empty means no mail link.     |
| `NUXT_PUBLIC_THEME_*`       | no                | White-label theme, see [docs/theming.md](docs/theming.md).                        |
| `PORT`                      | no                | Port to listen on, defaults to `3000`.                                            |

> [!IMPORTANT]
> `NUXT_ADMIN_PASSWORD` and `NUXT_SESSION_PASSWORD` only have defaults in
> development (the `$development` block in `nuxt.config.ts`), so no published
> image carries a password someone else knows. A production deployment must set
> both – until it does, the app refuses every login.

Set values in `.env` or leave the line out entirely: an empty value counts as a
value and overrides the development default, which is why both are commented
out in `.env.example`.

> [!TIP]
> Quote hex colors in `.env` files – an unquoted `#` starts a comment there, so
> `NUXT_PUBLIC_THEME_COLORS_PRIMARY=#0f4c81` arrives empty.

### Vimeo setup

Without an API token the app still plays media through public oEmbed, but it
cannot list your library or diagnose playback problems. Create a token with
read access to your videos at
[developer.vimeo.com](https://developer.vimeo.com/apps). For videos restricted
to specific domains, add the host this app is served from to the whitelist – the
accessibility check in the admin UI tells you exactly what is missing.

## Deployment

Container images are published to the GitHub Container Registry on every push to
`main` (tag `next`) and for every git tag:

```bash
docker run -d \
  -p 3000:3000 \
  -v mam-data:/app/data \
  -e NUXT_ADMIN_PASSWORD=... \
  -e NUXT_SESSION_PASSWORD=... \
  -e NUXT_VIMEO_API_TOKEN=... \
  ghcr.io/geprog/media-access-manager:next
```

`/app/data` holds the SQLite database and is the only writable path – mount a
volume there or the data is gone with the container.

To build it yourself:

```bash
pnpm build            # produces .output/
docker build -t media-access-manager .
```

## Scripts

| Command                   | What it does                                 |
| ------------------------- | -------------------------------------------- |
| `pnpm dev`                | Development server with hot reload           |
| `pnpm build`              | Production build into `.output/`             |
| `pnpm preview`            | Serve the production build locally           |
| `pnpm lint`               | ESLint (`--fix` to apply fixes)              |
| `pnpm typecheck`          | `vue-tsc` over the whole project             |
| `pnpm spelling`           | cspell over all files                        |
| `pnpm test`               | Vitest unit tests (`pnpm test run` for CI)   |
| `pnpm test:e2e`           | Playwright end-to-end tests                  |
| `pnpm playwright:install` | Install Playwright browsers and dependencies |
| `pnpm db:generate`        | Generate a migration from schema changes     |
| `pnpm db:migrate`         | Apply migrations manually                    |

## Testing

Unit tests live next to the code they cover (`*.test.ts`) and focus on the
logic: token validation, access windows, theme derivation, accessibility
diagnosis. End-to-end tests in [e2e/tests/](e2e/tests/) drive the real app with
Playwright and never call external providers – provider responses are mocked.
The suite runs on a single worker because every spec shares one server and one
database, cleaning up after itself by name.

CI runs lint, typecheck, spelling, unit tests and E2E tests on every pull
request.

## Project structure

```text
components/        Vue components (admin tables/forms, public player)
composables/       Shared reactive helpers
docs/              concept.md (architecture & data model), theming.md
e2e/               Playwright specs and helpers
i18n/locales/      en.json, de.json
pages/             Admin pages plus the public /{token} routes
plugins/           Theme injection
server/api/        REST endpoints (auth, media, groups, tokens, batches, access)
server/db/         Drizzle schema and migrations
server/services/   Auth, media, groups, tokens, QR, providers/
server/utils/      Validation and diagnosis helpers (unit tested)
utils/             Client-side helpers (theme, tokens, mailto)
```

## Contributing

Issues and pull requests are welcome at
<https://github.com/geprog/media-access-manager>. Before opening one, please run
`pnpm lint`, `pnpm typecheck` and `pnpm spelling`; [AGENTS.md](AGENTS.md)
describes the conventions this project follows – they apply to humans and AI
assistants alike.

## License

[MIT](LICENSE) © GEPROG GmbH
