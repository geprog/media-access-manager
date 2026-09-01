# Agent Guidelines

This document provides guidelines for AI agents and developers working on this project.

## Project Context

- **Read `docs/concept.md`** – understand the architecture before making changes: media provider abstraction (oEmbed, Vimeo), token model (dates, usage limits, batches), admin flow, public access flow, and white-label theming
- Follow the file structure and implementation order described in the concept document

## Package Manager & Node Version

- **Use pnpm** for all package management (install, add, run, etc.)
- **Use Node.js 26** – run `nvm use 26` before working on the project
- **pnpm workspace** – when in a workspace, use `-w` for root-level dependencies; respect `pnpm-workspace.yaml` (trustPolicy, strictPeerDependencies, etc.)

## Dependencies

- **Always pin dependencies** – avoid ranges like `^` or `~` in `package.json`; use exact versions (e.g., `"1.2.3"` instead of `"^1.2.3"`)

## Libraries & Reuse

- **Prefer existing libraries** – before implementing a function, search [npmjs.org](https://npmjs.org) for a suitable, well-maintained library
- Evaluate: maintenance status, recent updates, download counts, and community activity before choosing a dependency

## UI Components

- **Use Nuxt UI** for UI components – leverage the built-in components rather than rolling custom ones

## i18n

- **Use translation keys** for all user-facing strings – no hardcoded text in UI; use `$t()` or `useI18n()` so the app stays localizable and white-label friendly

## Security

- **Never commit secrets** – no hardcoded passwords, API keys, or tokens; use environment variables and `runtimeConfig` only

## Code Quality

- **Run checks before finishing** – execute `pnpm lint`, `pnpm typecheck`, and `pnpm spelling` to ensure changes pass

## Testing

### Unit Tests

- **Use Vitest** for unit tests
- **Test-driven behavior** – write or update tests first, then implement the behavior to make them pass
- Focus on testing logic and behavior, not implementation details

### E2E Tests

- **Use Playwright** for end-to-end tests
- **Mock external data providers** – never hit real external APIs or services in E2E tests; use mocks, fixtures, or test doubles
