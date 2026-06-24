# @dannyge/openclaw-memory-inject

[![CI](https://github.com/dannyge/openclaw-memory-inject/actions/workflows/ci.yml/badge.svg)](https://github.com/dannyge/openclaw-memory-inject/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@dannyge/openclaw-memory-inject)](https://www.npmjs.com/package/@dannyge/openclaw-memory-inject)
[![license](https://img.shields.io/npm/l/@dannyge/openclaw-memory-inject)](./LICENSE)
[![node](https://img.shields.io/node/v/@dannyge/openclaw-memory-inject)](https://www.npmjs.com/package/@dannyge/openclaw-memory-inject)

> **[English](README.md)** | **[中文](README.zh.md)**

Auto-inject recent memory files into new sessions so OpenClaw agents maintain
continuity across Discord threads and `/new` resets.

## What it does

OpenClaw's built-in `startupContext` feature only fires when a user explicitly
types `/new` or `/reset` with an empty message. It does **not** fire when a new
session is created through a Discord thread — which is how many agents receive
most of their conversations. This means agents lose all memory continuity on
every new thread.

The same "memory doesn't carry across sessions" gap has been raised in the
OpenClaw community multiple times:

- [#11618](https://github.com/openclaw/openclaw/issues/11618) — "Hook to inject
  relevant memory on session start" (closed/completed). This issue ultimately
  led OpenClaw 2026.6 to add the `session_start` and `before_prompt_build`
  plugin hooks, which this plugin is built on top of.
- [#32905](https://github.com/openclaw/openclaw/issues/32905) — "session-memory
  hook saves context but never recalls" (closed/not_planned). Describes the
  gap where `session-memory` only saves but never auto-restores context in new
  sessions — the exact gap this plugin fills.

**memory-inject** closes that gap. It watches for new sessions via the
`session_start` hook, then injects your most recent `memory/*.md` files into
the system prompt on the first turn via the `before_prompt_build` hook. The
result: every agent — regardless of how its session was created — starts with a
fresh snapshot of recent memory.

The plugin is designed to be lightweight and defensive. It reads a small,
bounded set of files from disk once per session and caches the decision
in-process so it never re-reads or re-injects on subsequent turns. If the
memory directory is missing or full of unreadable files, the plugin silently
backs off — it never blocks an agent turn.

## How it works

memory-inject registers two hooks with the OpenClaw runtime:

1. **`session_start`** — When a session begins, the plugin records the session
   key in an in-memory `SessionCache`. This is the trigger: every new session
   gets marked as eligible for injection.

2. **`before_prompt_build`** — On the first turn of a marked session, the
   plugin scans the agent's `memory/` directory, selects recent files matching
   the configured pattern, reads them, and returns a `prependContext` block.
   After injection, the cache is updated so no further injections happen for
   that session.

The two-hook strategy is necessary because `session_start` tells us a session
is new, but only `before_prompt_build` can actually modify the prompt. By
bridging them with an in-process cache, we get exactly-once injection per
session.

## Features

- **Multi-agent** — Automatically detects each agent's workspace directory and
  loads that agent's memory files independently
- **Fail-open** — Never blocks an agent turn; all disk errors are swallowed
  and logged
- **Configurable** — 8 settings control what gets injected, how much, and for
  which agents
- **Filename regex matching** — Default pattern matches `YYYY-MM-DD.md` and
  `YYYY-MM-DD-slug.md`; override with any valid regex
- **Token-budget truncation** — Soft cap on total injected content, estimated
  as `chars / 4`; oldest files are dropped first
- **mtime-based sorting** — Files are sorted newest-first by modification time
- **Zero runtime dependencies** — Only `node:*` built-in modules; `devDependencies`
  are TypeScript and the test runner
- **MIT licensed**

## Installation

Requires OpenClaw 2026.6+ (the version where `session_start` and
`before_prompt_build` hooks became available).

### From npm (recommended)

```bash
openclaw plugins install @dannyge/openclaw-memory-inject
```

### From GitHub

```bash
openclaw plugins install dannyge/openclaw-memory-inject
```

### From a local clone (development)

```bash
git clone https://github.com/dannyge/openclaw-memory-inject.git
cd openclaw-memory-inject
npm install && npm run build
openclaw plugins install --link /path/to/openclaw-memory-inject
```

Using `--link` tells OpenClaw to load the plugin directly from your local clone
so you can iterate without reinstalling. Edits to `src/` plus `npm run build`
are picked up on the next gateway restart.

### Verify the install

After installation, confirm the plugin is registered:

```bash
openclaw plugins list | grep -i memory-inject
```

Expected output:

```
| Memory Inject | memory-inject | openclaw | enabled  | ~/Projects/openclaw-memory-inject/dist/index.js | 0.1.0 |
```

The plugin loads its hooks at gateway startup, so **a restart is required**
for a fresh install. Continue with
[Verifying after install](#verifying-after-install) for the end-to-end
verification workflow.

## Configuration

All settings go under the plugin's config key in your OpenClaw gateway config.
The plugin is fully functional with zero configuration — every field has a
sensible default.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | `boolean` | `true` | Master switch. Set to `false` to disable injection without unloading the plugin. |
| `memoryDir` | `string` | `"memory"` | Directory relative to the agent's workspace directory. |
| `daysToLoad` | `number` | `2` | How many recent days of memory files to consider (1–365). Default 2 = today + yesterday. |
| `maxFiles` | `number` | `4` | Maximum files to inject per session (1–100). Newest files by mtime are kept. |
| `maxTokens` | `number` | `4000` | Soft token cap on total injected content (100–128000). Oldest files are dropped first when exceeded. |
| `filenamePattern` | `string` | `"^\\d{4}-\\d{2}-\\d{2}(-.+)?\\.md$"` | ECMAScript regex matched against file basenames. |
| `excludeAgents` | `string[]` | `[]` | Agent IDs that should never receive injection (e.g. sensitive workloads). |
| `contextLabel` | `string` | `"Recent memory (auto-injected by memory-inject plugin)"` | Header line for the injected context block. Set to `""` to omit. |

Example JSON configuration:

```json
{
  "plugins": {
    "memory-inject": {
      "enabled": true,
      "memoryDir": "memory",
      "daysToLoad": 3,
      "maxFiles": 6,
      "maxTokens": 8000,
      "filenamePattern": "^\\d{4}-\\d{2}-\\d{2}(-.+)?\\.md$",
      "excludeAgents": ["sensitive-agent"],
      "contextLabel": "Memory context (auto-injected)"
    }
  }
}
```

The authoritative source for config field names and defaults is
`openclaw.plugin.json` → `configSchema`.

## Usage examples

### Minimal — use all defaults

No config needed. The plugin loads with defaults: scans `memory/` in each
agent's workspace, matches `YYYY-MM-DD.md` and `YYYY-MM-DD-slug.md`, loads up
to 4 files from the last 2 days, capped at ~4000 tokens.

### Advanced — wider window, more files

```json
{
  "plugins": {
    "memory-inject": {
      "daysToLoad": 7,
      "maxFiles": 10,
      "maxTokens": 16000
    }
  }
}
```

Load up to 10 memory files from the past week, with a 16000-token budget.

### Exclude specific agents

```json
{
  "plugins": {
    "memory-inject": {
      "excludeAgents": ["kbadmin", "sensitive"]
    }
  }
}
```

Agents `kbadmin` and `sensitive` won't receive any memory injection, while all
other agents use the default configuration.

### Custom filename pattern

```json
{
  "plugins": {
    "memory-inject": {
      "filenamePattern": "^session-\\d{8}(-.+)?\\.md$"
    }
  }
}
```

Match files like `session-20260623.md` or `session-20260623-debugging.md`
instead of the default date-based pattern.

## How memory files are matched

By default, the plugin looks for files matching the regular expression
`^\d{4}-\d{2}-\d{2}(-.+)?\.md$`. This catches:

- `2026-06-23.md`
- `2026-06-23-debug-session.md`
- `2026-06-22.md`

It scans `<workspaceDir>/memory/` (the directory is configurable via
`memoryDir`). Files are sorted by modification time, newest first. The
`daysToLoad` window is based on the local system clock — files older than
`now - (daysToLoad * 24h)` are excluded before the `maxFiles` and `maxTokens`
limits apply.

Logical dates are parsed from the `YYYY-MM-DD` prefix in each filename and
included in the injected context block as annotations.

## Multi-agent behavior

The plugin auto-detects `ctx.workspaceDir` from the OpenClaw runtime context,
which means it reads the correct `memory/` directory for whichever agent is
handling the current turn. No per-agent configuration is needed.

Configuration is global — all agents share the same settings unless you use
`excludeAgents` to opt specific agents out entirely. This is intentional:
memory-inject is designed to be a set-and-forget plugin that works uniformly
across your agent fleet.

## Performance and token cost

- **Disk reads**: At most `maxFiles` file reads per session (default: 4), each
  capped at the remaining token budget × 4 characters (hard ceiling 512 KB per
  file). All reads happen once, on the first turn of a new session.
- **Token estimation**: Content size is estimated as `totalChars / 4`. This is
  a conservative approximation that works well for English-heavy prose and
  reasonably for CJK-mixed content.
- **Injection frequency**: Exactly once per session. The `SessionCache`
  prevents re-injection on subsequent turns within the same session.
- **Memory overhead**: A small in-process map of session keys (one entry per
  active session). Entries are garbage-collected when sessions end.

## Verifying after install

The most reliable way to confirm the plugin works end-to-end is to look at
the gateway log for the `[memory-inject]` injection message. The plugin
prints exactly one line per successful injection.

### 1. Make sure your workspace has matching memory files

The plugin scans `<workspaceDir>/<memoryDir>/` for files matching
`filenamePattern` (default `^\d{4}-\d{2}-\d{2}(-.+)?\.md$`). For a quick
test on agent `ops`, create one or two files:

```bash
cd ~/.openclaw/agents/ops/workspace/memory
NOW=$(date +%Y-%m-%d)
YDAY=$(date -v-1d +%Y-%m-%d)
echo "# Test memory" > ${NOW}.md
echo "# Yesterday note" > ${YDAY}.md
```

The `memory/` directory is **per-agent** (each of your agents has its own
under `~/.openclaw/agents/<agentId>/workspace/memory/`). Pick whichever
agent you can easily trigger a new session on — usually the one you talk
to most.

### 2. Trigger a fresh session

A "fresh session" is anything that has not seen this session before. Easy
triggers:

- Send a message to a Discord thread where the agent has never replied
  (a brand-new thread works for every agent)
- Issue `/new` or `/reset` in the agent's main session
- Restart the gateway (cache resets, every active session is treated as new)

Cron jobs are also valid triggers — they create isolated sessions.

### 3. Check the gateway log

Tail the gateway log and search for `[memory-inject]`:

```bash
# macOS
tail -F ~/Library/Logs/openclaw/gateway.log | grep --line-buffered memory-inject

# or one-shot search
grep "\[memory-inject\]" ~/Library/Logs/openclaw/gateway.log | tail -5
```

**Success** looks like this:

```
[plugins] [memory-inject] injected 1 memory file(s) (~399 tokens) into agent:ops:discord:channel:1478705016792551466
```

If you see this line, the plugin is working. If not, see
[Log format reference](#log-format-reference) below for the full set of
possible log lines and what they mean.

### Multi-agent verification

To confirm the plugin works for **every** agent you care about, repeat
step 2 for each one. The fastest way is to send a single message to each
agent's main Discord channel (or thread) and then grep the log:

```bash
grep "\[memory-inject\]" ~/Library/Logs/openclaw/gateway.log \
  | awk -F'into ' '{print $2}' \
  | sort -u
```

Expected: one line per agent, each with a distinct `agent:<id>:...`
sessionKey.

### Verifying the config in effect

To double-check the values the plugin is actually using:

```bash
openclaw config get plugins.entries.memory-inject.config
```

Defaults are:

```json
{
  "enabled": true,
  "memoryDir": "memory",
  "daysToLoad": 2,
  "maxFiles": 4,
  "maxTokens": 4000,
  "filenamePattern": "^\\d{4}-\\d{2}-\\d{2}(-.+)?\\.md$",
  "excludeAgents": [],
  "contextLabel": "Recent memory (auto-injected by memory-inject plugin)"
}
```

## Log format reference

The plugin emits log lines through `api.logger` (OpenClaw prefixes them
with `[plugins]` and writes them to the gateway log). All lines are tagged
with the literal string `[memory-inject]` for easy grepping.

| Level | Format | When |
|-------|--------|------|
| `info` | `[memory-inject] injected N memory file(s) (~T tokens) into <sessionKey>` | Successful injection, exactly once per session |
| `warn` | `[memory-inject] session_start without sessionKey or sessionId; skipping` | `session_start` fired with no identifier (very rare — should not happen on a healthy gateway) |
| `error` | `[memory-inject] failed to load memory: <error message>` | Disk read failure (permission error, file vanished, etc.) — fail-open, session continues without injection |

### Anatomy of the success line

```
[plugins] [memory-inject] injected 1 memory file(s) (~399 tokens) into agent:kbadmin:discord:channel:1478685251898445906
└──────┘ └──────────────┘ └────── ┘         └─────┘  └─────────────┘ └──────────────────────┘
   │            │             │                │             │                    │
 OpenClaw   plugin tag   count        estimated tokens    sessionKey — uniquely
 log prefix            of files      = totalChars / 4     identifies the session
```

- **count of files**: actual files loaded after `maxFiles` and `maxTokens`
  filtering. May be less than what `daysToLoad` allows.
- **estimated tokens**: characters / 4, conservative. Real token counts
  can vary by ±30% depending on content (CJK text compresses better, code
  worse).
- **sessionKey**: the OpenClaw session identifier. For Discord it includes
  `agent:<id>:discord:channel:<channelId>`; for cron jobs it's
  `agent:<id>:cron:<jobId>:run:<runId>`. Use this to correlate the
  injection with the session transcript.

### Enabling debug-level output

The plugin only logs at `info`, `warn`, and `error`. To see OpenClaw's
plugin loading diagnostics (which include this plugin), raise the gateway
log level:

```bash
openclaw config set diagnostics.logLevel debug
```

Then restart the gateway. Look for entries mentioning `memory-inject` at
startup — they confirm the plugin's hooks were registered. Restore the
original log level when you're done.

## Troubleshooting

### No memory files are being injected

1. **Check the log for the success line.** Run
   `grep "\[memory-inject\]" ~/Library/Logs/openclaw/gateway.log`. If the
   line is absent, the hook may not be firing — see the next section.
2. **Check that files match the pattern.** The default requires
   `YYYY-MM-DD.md` or `YYYY-MM-DD-slug.md`. Files like `notes.md` or
   `2026-06-23.txt` will not be matched. See
   [How memory files are matched](#how-memory-files-are-matched).
3. **Verify file mtime is within the window.** `daysToLoad=2` means files
   modified in the last 48 hours. A file from 3 days ago will be skipped
   even if its filename says today.
4. **Confirm `enabled` is `true`** in
   `openclaw config get plugins.entries.memory-inject.config`.
5. **Check the `excludeAgents` list.** If the agent you're testing is
   listed there, the plugin will silently skip it. (This is intentional —
   there is no warning for excluded agents.)

### Hook not firing on new sessions

1. **Check OpenClaw version:** `openclaw --version`. You need 2026.6 or
   later. The `session_start` and `before_prompt_build` hooks were added
   in that version.
2. **Verify the plugin loaded:** `openclaw plugins list | grep memory-inject`
   should show status `enabled`. If the row is missing, the install
   failed — try `openclaw plugins inspect memory-inject` for details.
3. **Verify the gateway reloaded after install.** Hooks only register at
   startup. If you installed mid-run without restarting, the plugin will
   be listed as enabled but its hooks will not fire.
4. **Try a different session trigger.** If `/new` doesn't fire the hook,
   try a fresh Discord thread — sometimes the main session has been
   resumed so long that `session_start` hasn't fired recently. The plugin
   is designed for new sessions specifically, not session resumption.

### `injected 0 memory file(s)` is expected

If your log shows `injected 0 memory file(s)`, the hook is firing
correctly — it just found no matching files. This is not an error; it
means your workspace `memory/` directory either doesn't exist, is empty,
or has no files matching the pattern within the `daysToLoad` window.

If you want injection to happen for the file you have, double-check the
filename pattern and mtime.

### Errors in the log

If you see `[memory-inject] failed to load memory: ...`:

- **Permission denied**: the gateway process cannot read your memory
  files. Check file permissions and that the agent's workspace is owned
  by the user running the gateway.
- **File too large**: a file exceeds `maxTokens * 4` characters after
  preprocessing. Either lower the file's content, raise `maxTokens`, or
  set `maxFiles` to skip it.
- **EISDIR / Not a file**: the `memory/` path points to a file, not a
  directory. Check `memoryDir` config.

The plugin **fails open** on every error — a failed load will not block
the agent's turn. The session continues without injected memory.

## Development

```bash
git clone https://github.com/dannyge/openclaw-memory-inject.git
cd openclaw-memory-inject
npm install
```

Build:

```bash
npm run build
```

Test:

```bash
npm test
```

Tests use Node.js built-in `node:test` and `node:assert`. No test framework
dependencies are required. The project has zero runtime dependencies — only
`typescript`, `tsx`, and `@types/node` as dev dependencies.

Type-check without emitting:

```bash
npm run typecheck
```

Key source files:

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry point: registers `session_start` and `before_prompt_build` hooks |
| `src/inject.ts` | Hook wiring: session cache management and context injection |
| `src/memory-loader.ts` | Disk scanning, file filtering, content reading |
| `src/config.ts` | Configuration resolution with validation and defaults |
| `src/types.ts` | Shared TypeScript interfaces |
| `src/session-cache.ts` | In-process cache for session tracking |

## License

MIT — see the `LICENSE` file or `package.json`.

## Contributing

Issues and pull requests are welcome at
[https://github.com/dannyge/openclaw-memory-inject/issues](https://github.com/dannyge/openclaw-memory-inject/issues).

Author: [dannyge](https://github.com/dannyge)
