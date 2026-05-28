# Codex VS Code Extension — Reverse Engineering Notes

Initial reverse-engineering pass on the **OpenAI Codex** VS Code extension
(`openai.chatgpt`, version 26.5519.32039, published 2026-05-22).

Goal: understand the extension's architecture, the boundary between what is
already open-source and what is shipped only as closed binaries, and judge
how much further RE work is feasible / worthwhile.

## Files

- `fetch.sh` — reproducible download + extract script
- `findings.md` — detailed findings (architecture, what's open vs closed,
  difficulty assessment, legal notes)
- `snippets/` — small annotated excerpts from the beautified bundle
- `analysis/` (gitignored) — beautified `extension.js`
- `vsix/`, `extracted/` (gitignored) — raw artifacts; recreate with `fetch.sh`

## Quick start

```
cd codex-re
./fetch.sh linux-x64   # ~120 MB download
less findings.md
```

## TL;DR

The Codex VS Code extension is a thin shell:

- ~1.5 MB minified TypeScript bundle (`out/extension.js`) — closed source
- ~210 MB stripped Rust binary (`bin/<platform>/codex`) — **already
  open-source as Apache-2.0** in `github.com/openai/codex`
- Bundled `ripgrep` and (Linux only) `bwrap` for sandboxing
- Closed-source React/Vite webview SPA in `webview/`

The TS wrapper spawns `codex app-server --analytics-default-enabled` and
talks to it via line-framed JSON over stdio using MCP-style methods
(`initialize`, `tools/list`, `tools/call`, `prompts/*`, `resources/*`,
`roots/list`, `elicitation/create`, `notifications/*`). Everything
interesting — model calls, sandboxing, tool execution, auth — happens in
the Rust binary, whose source is public.

So "reverse engineering Codex" in 2026 mostly reduces to **reading the
Rust source on GitHub**. RE of the closed TS wrapper and webview is
tractable but the payoff is small: it is glue code (command registration,
webview lifecycle, IPC framing, WSL routing).

See `findings.md` for the full write-up.
