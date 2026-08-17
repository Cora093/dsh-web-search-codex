# Repository Guidelines

## Project Structure & Module Organization

Host-side TypeScript lives in `src/`. `src/index.ts` registers the DSH plugin, `provider.ts` implements the Codex search protocol, and `host-settings.ts` owns settings and credential operations. Browser code is isolated under `src/client/`; keep shared wire types and constants in `src/shared.ts` so the client bundle never imports host-only modules. Tests live in `tests/` and mirror behavior rather than source-file layout. `dsh.bundle.patch` selects the `codex` provider. `lib/` is generated output and must not be edited manually.

## Build, Test, and Development Commands

- `pnpm install`: install the locked development dependencies.
- `pnpm run typecheck`: run strict TypeScript checks without emitting files.
- `pnpm test`: run the complete Vitest suite once before committing.
- `pnpm run test:coverage`: inspect V8 coverage when changing shared or security-sensitive logic.
- `pnpm run build`: recreate `lib/` with declarations and host/client bundles.
- `pnpm pack`: build and produce the local installation tarball.

For a local smoke test, install the tarball with `dsh plugin --profile web add C:\absolute\path\dsh-web-search-codex-<version>.tgz`, then start DSH with `dsh --profile web --port 3080`.

## Coding Style & Naming Conventions

Use strict ESM TypeScript, two-space indentation, single quotes, no semicolons, and explicit `.ts`/`.tsx` import extensions. Use `PascalCase` for React components and types, `camelCase` for functions and variables, and uppercase snake case for exported constants. Keep browser styling in colocated CSS modules. No formatter or linter is configured, so match surrounding code and run `git diff --check`.

## Testing Guidelines

Vitest test files use `*.spec.ts` or `*.spec.tsx`. Add focused tests at the narrowest real behavior boundary: provider protocol, host settings, client controller, or rendered card. Prefer one comprehensive case over repeated assertions across layers. Security changes must cover credential redaction, redirect rejection, and trusted-host behavior where applicable.

## Commit & Pull Request Guidelines

Use `<type>(<scope>):<中文描述>`, for example `fix(settings):修复凭据状态`. Pull requests should explain user-visible behavior, list verification commands, link relevant issues, and include a desktop screenshot for UI changes. Never include API keys, Authorization headers, credential values, or unsanitized logs.
