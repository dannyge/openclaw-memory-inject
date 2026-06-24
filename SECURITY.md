# Security Policy

## Supported versions

Only the latest released version of `openclaw-memory-inject` receives security
fixes. Upgrade to the newest tag before reporting.

| Version | Supported |
|---------|-----------|
| latest  | ✅        |
| < latest| ❌        |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

This plugin reads files from disk and injects their contents into agent
prompts, so a vulnerability could expose memory files or manipulate agent
context. Please report suspected vulnerabilities privately so they can be
triaged before public disclosure.

Email: **dannyge@users.noreply.github.com**

Include as much of the following as you can:

- A description of the issue and its potential impact
- Steps to reproduce, or a proof of concept
- Affected versions (run `openclaw plugins inspect memory-inject`)
- Your OpenClaw version (`openclaw --version`)

You should receive an acknowledgment within 72 hours. If a vulnerability is
confirmed, we will coordinate a fix and disclosure timeline with you.

## Scope

This policy covers the source in this repository. It does **not** cover:

- Vulnerabilities in OpenClaw itself (report those to the OpenClaw project)
- Issues arising from user-supplied memory file contents
- Misconfiguration (e.g. pointing `memoryDir` at sensitive paths) — see the
  README's `excludeAgents` option for isolating sensitive agents

## Trust model

The plugin runs inside the OpenClaw gateway process with the same filesystem
access as that process. It only reads files under each agent's configured
`memoryDir` (default `memory/`, relative to the agent workspace). It does not
make network requests, write to disk, or execute commands. Any behavior
outside that description is a bug worth reporting here.
