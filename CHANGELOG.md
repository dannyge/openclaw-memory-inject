# Changelog

All notable changes to the openclaw-memory-inject plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

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

[0.1.0]: https://github.com/dannyge/openclaw-memory-inject/releases/tag/v0.1.0
