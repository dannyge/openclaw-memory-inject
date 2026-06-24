# Contributing to openclaw-memory-inject

Thanks for your interest in improving this plugin! This guide covers how to
set up a dev environment and submit changes.

## Development setup

```bash
git clone https://github.com/dannyge/openclaw-memory-inject.git
cd openclaw-memory-inject
npm install
```

Requirements: Node.js 20+ (the `engines` field in `package.json` enforces this).

## Common tasks

| Command | What it does |
|---------|-------------|
| `npm run build` | Compile TypeScript in `src/` → `dist/` |
| `npm test` | Run the test suite (`node:test`, no framework deps) |
| `npm run test:watch` | Re-run tests on file change |
| `npm run typecheck` | Type-check `src/` **and** `test/` without emitting |
| `npm run version-check` | Ensure `package.json` and `openclaw.plugin.json` versions match |
| `npm run clean` | Remove `dist/` and `*.tsbuildinfo` |

## Before opening a pull request

1. **Add or update tests** for any behavior change. The test suite is the only
   thing standing between a clean release and a broken one — every PR should
   leave it greener than it found it.
2. **Run the full check locally:**

   ```bash
   npm run typecheck && npm test && npm run build && npm run version-check
   ```

3. **Update `CHANGELOG.md`** under the `[Unreleased]` section, following the
   [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format already in
   use. Group your change under `Added`, `Changed`, `Fixed`, or `Removed`.
4. **Keep versions in sync.** If you bump `package.json`'s version, also bump
   `openclaw.plugin.json`. `npm run version-check` will fail CI if they drift.

## Code style

- TypeScript `strict` mode is on. New code must pass `npm run typecheck`.
- The project has **zero runtime dependencies** by design — only `node:*`
  built-in modules are allowed in `src/`. Please don't introduce a runtime dep
  without discussing it first.
- Match the existing comment density and naming conventions you see in `src/`.

## Linting policy

This project does not use ESLint. TypeScript's `strict` mode plus
`noUnusedLocals` / `noUnusedParameters` cover the static-analysis needs for a
codebase of this size. If the source grows substantially, an ESLint setup can
be revisited.

## Release flow

Releases are automated via GitHub Actions (`.github/workflows/release.yml`):

1. The maintainer bumps the version (in both `package.json` and
   `openclaw.plugin.json`) and updates `CHANGELOG.md`.
2. A git tag `vX.Y.Z` is pushed.
3. The release workflow builds, tests, publishes to npm, and creates a GitHub
   Release.

Contributors do not need to run `npm publish` themselves.

## License

By contributing, you agree that your contributions will be licensed under the
MIT License (see `LICENSE`).
