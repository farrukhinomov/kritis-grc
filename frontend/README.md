# Frontend (React SPA)

The single-page app of the GRC platform: Vite, React 19, TypeScript (strict), Ant Design 6, React Router, TanStack Query, i18next (German default, English) and Motion.

## Setup

Requires Node 24 and [pnpm](https://pnpm.io/).

```bash
pnpm install
cp .env.example .env.local     # VITE_API_MOCKING=enabled serves the API from mock data
pnpm dev                       # http://localhost:5173
```

With mocking disabled, `/api` is proxied to Django at `http://localhost:8000`, the same single-origin setup as production.

## Commands

| Task                                  | Command                                |
| ------------------------------------- | -------------------------------------- |
| Dev server                            | `pnpm dev`                             |
| Tests                                 | `pnpm test` (watch: `pnpm test:watch`) |
| Tests with coverage (≥ 80 % enforced) | `pnpm test:coverage`                   |
| Type-check                            | `pnpm typecheck`                       |
| Lint (zero warnings)                  | `pnpm lint`                            |
| Format / check                        | `pnpm format` / `pnpm format:check`    |
| Production build                      | `pnpm build`                           |

## Layout

```
src/
  app/          providers, query client, routes (one lazy chunk per page), layout
  features/     one folder per area, mirroring the backend modules
  shared/
    api/        HTTP client (same-origin, Problem Details → ApiError)
    i18n/       German source texts, English mirror (missing keys fail the type check)
    theme/      design tokens (the only place colors may be written)
    ui/         shared components
  mocks/        MSW handlers shared by the prototype and the tests
  test/         test setup and render helpers
```

## Rules enforced by tooling

- No raw colors outside `src/shared/theme/` (ESLint).
- Every text through i18n; English must have every German key (TypeScript).
- Accessibility lint rules at the strict level (`jsx-a11y`).
- Tests fail on any request without a mock.
