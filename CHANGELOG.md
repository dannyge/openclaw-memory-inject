# Changelog

All notable changes to the openclaw-memory-inject plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-06-24

### Fixed

- **Critical: file contents were never actually injected.** `buildContextBlock`
  emitted a per-file header and an opening code fence, but never wrote the
  file body nor closed the fence. The plugin logged "injected N memory file(s)"
  while producing an empty block. `MemoryFileEntry` now carries `content`
  populated by `loadMemoryFiles`, and `buildContextBlock` emits the body inside
  a closed ```markdown fence. Added regression tests that assert the real file
  body appears in the injected context.
- `test/` was excluded from type-checking (`tsconfig.json` `exclude`), hiding a
  broken `clearMemoryDir` helper (missing imports, dead code). Introduced
  `tsconfig.test.json` and folded it into `npm run typecheck`; removed the dead
  helper.

### Added

- npm publishing support: package renamed to scoped `@dannyge/openclaw-memory-inject`
  (the `openclaw.plugin.json` `id` stays `memory-inject` for config backwards
  compatibility). `publishConfig.access: public`, `prepublishOnly`/`prepack`
  build gates, and a complete `files` allowlist (dist, manifest, both READMEs,
  CHANGELOG, LICENSE).
- GitHub Actions release workflow (`.github/workflows/release.yml`): pushing a
  `v*` tag builds, tests, verifies the tag matches `package.json`, publishes to
  npm, and creates a GitHub Release. Requires an `NPM_TOKEN` repo secret.
- README badges (EN + ZH): CI status, npm version, license, Node version.
- Version-consistency check (`scripts/check-version.mjs`, `npm run version-check`):
  asserts `package.json` and `openclaw.plugin.json` versions match. Wired into CI.
- Open-source governance files: `CONTRIBUTING.md`, `SECURITY.md`, PR template,
  `CODEOWNERS`.
- CI: replaced the redundant `lint` job with a `package-check` job that runs
  `npm publish --dry-run` to validate the tarball.

### Changed

- **Raised minimum Node.js from 20 to 22.19**, aligned with OpenClaw's own
  runtime requirement (OpenClaw requires Node 22.19+, Node 24 recommended).
  Node 20 is EOL (Apr 2026) and unsupported by OpenClaw. CI matrix updated
  `[20, 22]` → `[22, 24]`; added `.npmrc` with `engine-strict=true` so local/CI
  installs hard-fail on unsupported Node versions.
- CI: bumped GitHub Actions to Node 24 runtime — `actions/checkout` v4→v5,
  `actions/setup-node` v4→v5, `softprops/action-gh-release` v2→v3 (clears the
  Node 20 runner deprecation warning).
- README (EN + ZH): added "Verifying after install" section with 3-step end-to-end verification (prepare memory files, trigger fresh session, check gateway log), multi-agent verification, and a "Verifying the config in effect" subsection
- README (EN + ZH): added "Log format reference" section with a level table, anatomy of the success log line, and instructions for enabling debug-level output
- README (EN + ZH): restructured "Troubleshooting" into 4 specific scenarios: "no memory files found", "hook not firing", "`injected 0 memory file(s)` is expected", and "errors in the log"

## [0.1.0] - 2026-06-23

### Added

- Plugin entry that registers `session_start` and `before_prompt_build` hooks with the OpenClaw runtime
- Memory loader: scans `<workspaceDir>/memory/` for files matching a configurable regex (default `^\d{4}-\d{2}-\d{2}(-.+)?\.md$`), filters by mtime within the `daysToLoad` window, sorts newest-first, truncates to `maxFiles` and a soft `maxTokens` budget
- Per-session de-duplication cache: marks each new session in `session_start`, injects at most once via `before_prompt_build`, with bounded LRU-like eviction at 4096 entries
- Config validation with defensive parsing: invalid types and values fall back to documented defaults, ranges are clamped, and non-compiling regex patterns are replaced with the default
- Configuration keys: `enabled`, `memoryDir`, `daysToLoad`, `maxFiles`, `maxTokens`, `filenamePattern`, `excludeAgents`, `contextLabel`
- Multi-agent support: per-call resolution of `ctx.workspaceDir` so the plugin works for every agent under `~/.openclaw/agents/<agentId>/workspace/`
- Fail-open behavior: missing memory directory, unreadable files, and load errors are swallowed and logged; the plugin never blocks the agent turn
- Test suite: 24 tests across 5 suites using `node:test` and `node:assert/strict` with zero runtime dependencies
- TypeScript strict mode, with `tsc` passing with no warnings
- Manifest file (`openclaw.plugin.json`) with full `configSchema` for dashboard config UI rendering
- MIT license

[Unreleased]: https://github.com/dannyge/openclaw-memory-inject/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/dannyge/openclaw-memory-inject/releases/tag/v0.2.0
[0.1.0]: https://github.com/dannyge/openclaw-memory-inject/releases/tag/v0.1.0
