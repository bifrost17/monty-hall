# Codex VS Code Extension — Reverse Engineering Findings

**Target:** `openai.chatgpt` (display name "Codex – OpenAI's coding agent")
**Version analysed:** `26.5519.32039` (published 2026-05-22, downloaded 2026-05-28)
**Marketplace:** `https://marketplace.visualstudio.com/items?itemName=openai.chatgpt`
**License of binary distribution:** "SEE LICENSE IN LICENSE.md" → refers to
`https://openai.com/policies/row-terms-of-use` (i.e. OpenAI's Terms of Use,
NOT a permissive OSS license)

All file paths in this document are relative to `extracted/<platform>/extension/`
(produced by `./fetch.sh`).

---

## 1. Distribution layout

The `.vsix` is a normal zip. Per-platform builds are published; the
`linux-x64` package is 119 MB, `universal` (all platform binaries
bundled) is 538 MB.

```
extension/
├── LICENSE.md                          # 50 B — link to openai.com ToS
├── readme.md                           # marketing copy
├── package.json                        # 8 KB — VSCode manifest
├── out/extension.js                    # 1.5 MB minified bundle (the wrapper)
├── webview/
│   ├── index.html                      # entry
│   └── assets/                         # React/Vite SPA, ~hundreds of chunks
├── bin/<arch>/
│   ├── codex                           # 210 MB — Rust agent (THE engine)
│   ├── rg                              # 5.2 MB — ripgrep
│   └── codex-resources/bwrap           # 526 KB — Linux sandbox (Linux only)
├── resources/                          # icons, a Windows crash-events .ps1
└── syntaxes/                           # tmLanguage for `.rules` (Starlark grammar)
```

Notable manifest fields (`extension.vsixmanifest`):

- `PreRelease = true` — published as a pre-release channel
- `ExtensionKind = workspace` — runs on the remote in Remote-SSH/devcontainers
  (necessary because the Rust binary needs workspace files)
- `ExecutesCode = true`
- `EnabledApiProposals = chatSessionsProvider, languageModelProxy` — uses
  unstable VSCode proposed APIs (announced via `package.json`)

`package.json` highlights:

- Activation: `onStartupFinished` + `onUri`
- Commands prefix: `chatgpt.*` (openSidebar, newCodexPanel, addToThread,
  showLspMcpCliArgs, implementTodo, etc.)
- Setting `chatgpt.cliExecutable` — **hidden dev escape hatch**: override the
  path to the codex CLI binary
- Setting `chatgpt.runCodexInWindowsSubsystemForLinux` — on Windows, prefer
  running the binary inside WSL
- Custom editor `chatgpt.conversationEditor` for `openai-codex:/**/*`
- Registers itself as a `chatSessions` provider of type `openai-codex`
- Ships `codex-rules` language (file extension `.rules`) using a **Starlark**
  TextMate grammar — so the configuration / agent rules DSL is Starlark.

---

## 2. The core boundary: open vs closed

| Component | Size | Status |
|---|---|---|
| `bin/<arch>/codex` (Rust agent) | 210 MB | **Open source** — `github.com/openai/codex` (Apache-2.0) |
| `bin/<arch>/rg` (ripgrep) | 5.2 MB | Open source — BurntSushi/ripgrep |
| `bin/<arch>/codex-resources/bwrap` | 526 KB | Open source — containers/bubblewrap |
| `out/extension.js` (TS wrapper) | 1.5 MB minified | **Closed** (per OpenAI ToS) |
| `webview/` (React SPA) | many MB | **Closed** |
| `syntaxes/starlark.tmLanguage.json` | 24 KB | Open source — bazelbuild/vscode-bazel (license file included) |

Confirmation that the bundled `codex` binary is built from the public repo:
`strings bin/linux-x86_64/codex` shows GitHub Actions runner paths such as
`/home/runner/work/codex/codex/.cargo-home/registry/...`, which is the
standard `actions/checkout` layout for the `openai/codex` repository.

**Practical implication:** the agent logic — prompt engineering, tool
definitions, sandbox policy, model selection, streaming, retries,
auth/refresh flow — lives in the open-source Rust crate. RE'ing the binary
is unnecessary; read the source.

---

## 3. Wrapper architecture (closed-source 1.5 MB bundle)

Beautified into 78 k lines via Prettier. The wrapper's job is small:

### 3.1 Locate and spawn the binary

```js
// snippets/01_cli_path_resolution.js — verbatim from extension.beautified.js:63467
function ZR(t, e) {
  let r = Hr("cliExecutable");
  if (r && r.trim().length > 0) return r;            // dev override
  let n = ip(e),                                     // arch dir (linux-x86_64, etc.)
      o = (e ?? process.platform) === "win32" ? "codex.exe" : "codex";
  return tl.Uri.joinPath(t, `${n}/${o}`).fsPath;
}
```

### 3.2 Spawn `codex app-server` and pipe stdio

```js
// snippets/03_app_server_spawn.js — extension.beautified.js:63577
this.logger.info("Spawning codex app-server");
e = gce(this.extensionUri, "app-server", ["--analytics-default-enabled"]);
```

The spawn call site (line 63440-ish) configures:

```js
env: {
  ...process.env,
  ...o,
  PATH: c,
  RUST_LOG: "warn",
  CODEX_INTERNAL_ORIGINATOR_OVERRIDE: op,   // op = "codex_vscode"
}
```

So the Rust binary is invoked as `codex app-server --analytics-default-enabled`
and identifies itself to OpenAI's backend as originator `codex_vscode` for
telemetry/quota accounting.

### 3.3 Line-framed JSON over stdio (MCP-shaped)

The wrapper has a `CodexMcpConnection` class (line ~63558) that:

1. Pipes child stdout through `wf` (line framer) → `df` (line processor)
2. Decodes each line via `decodePayload = tKe`
3. Dispatches to `handleIncomingMessage`
4. Watches for `incoming_line_queue_overflow` and tears the process down

Method names found in the bundle (search: `tools/list`, etc.):

```
initialize
notifications/initialized   notifications/cancelled
notifications/message       notifications/progress
tools/list                  tools/call
prompts/list                prompts/get
resources/list              resources/read
resources/subscribe         resources/unsubscribe
roots/list
elicitation/create
```

These are the standard MCP (Model Context Protocol) methods. The Codex
"app-server" appears to speak a superset of MCP (the public `openai/codex`
repo also exposes a plain `codex mcp` subcommand for general MCP-server
duty; `app-server` is the richer mode used by the IDE).

In addition, codex-specific event types flow over the same channel, e.g.
`codex-app-server-fatal-error`, `codex-app-server-restart`,
`app-server-connection-state`.

### 3.4 Windows-via-WSL routing

When `chatgpt.runCodexInWindowsSubsystemForLinux` is true, the wrapper
shells out to `wsl.exe` and re-builds the command line:

```js
// snippets/05_wsl_invocation.js — extension.beautified.js:63481
let f = ["-d", o];                              // -d <distro>
u && f.push("--cd", u);                         // workspace cwd
f.push("--", "/usr/bin/bash", "-lc");
let h = ["/usr/bin/env", ...d, s, e];           // env + linux codex path + subcmd
h.push(...r);
S = (0, _L.spawn)("wsl.exe", f, { stdio: ["pipe","pipe","pipe"], ... });
```

Notable: it builds a single `bash -lc <quoted>` payload and uses `WSLENV`
to forward selected env vars. Sandbox security is the stated reason for
preferring WSL on Windows.

### 3.5 Process tree classifier (telemetry)

```js
// snippets/04_process_classifier.js — extension.beautified.js:35818
function d7(t) {
  return /\bcodex app-server\b/i.test(t) ? "app_server"
       : /--type=renderer\b/i.test(t) ? "electron_renderer"
       : /--type=gpu-process\b/i.test(t) ? "electron_gpu"
       : /\bmcp(?:\b|[._/-])/i.test(t) ? "mcp"
       : /\bgit\b/i.test(t) ? "git"
       : /\b(?:bash|fish|sh|zsh|pwsh|powershell|cmd(?:\.exe)?)\b/i.test(t) ? "shell"
       : "other";
}
```

The wrapper enumerates child processes (using `tasklist`/`ps` depending
on platform — see `QM`/`m7` modules) to attribute memory and CPU to
buckets, presumably reported via the `ces/v1/telemetry/intake` endpoint.

### 3.6 Network endpoints observed

```
https://api.openai.com/auth
https://api.openai.com/profile
https://chat.openai.com/ces/v1/telemetry/intake
https://chatgpt.com/backend-api
https://github.com/openai/skills.git
```

The last is interesting: the extension *clones* `github.com/openai/skills`
(a public repo of pre-built skills/prompts) into local state. Worth a
follow-up read.

### 3.7 Webview channel

`postMessageToWebview(view, msg)` (line 69073) is the single fan-out
point. The webview is React (Vite-bundled, jsx-runtime detected). The
main entry is a 16 KB `assets/index-<hash>.js` that lazy-loads hundreds
of chunks — most are syntax-highlighting grammars (shiki) and one chunk
per UI locale, not actual logic.

---

## 4. Reverse engineering feasibility & difficulty

### 4.1 Rust agent (`bin/<arch>/codex`)

- **Difficulty:** Trivial — read the source at `github.com/openai/codex`.
- **Confidence the binary == source:** Very high; build-path strings
  match the public repo's CI builds.
- **Legitimate uses:** Studying agent design, sandbox policy, prompt
  templates, model fall-back logic, MCP server semantics.

### 4.2 TS wrapper (`out/extension.js`)

- **Difficulty:** Low–medium. Minified but neither obfuscated nor
  packed. `prettier --parser babel` produces 78 k lines of readable
  ES; identifier renaming (`u`, `JR`, `gce`) is the only friction.
  webpack/esbuild module IDs survive in the source.
- **Effort to a full annotated rebuild:** maybe ~2–4 weeks for one
  engineer, but largely pointless — it is glue code (command
  registration, IPC framing, webview lifecycle, WSL routing).
- **Available open analogues:** the public `openai/codex` repo
  contains the CLI's TUI client; the protocol shape can be cross-
  checked against that. The MCP protocol is a public spec.

### 4.3 React webview (`webview/`)

- **Difficulty:** Medium. The bundle splits hundreds of chunks. No
  source maps are shipped. Strings are not encrypted but identifiers
  are mangled. React component trees are reconstructable.
- **Effort:** weeks. The UX shell (chat composer, diff viewer,
  settings panes, MCP / Skills configuration UIs) is the bulk of
  novel work and the part most worth studying for UX patterns.

### 4.4 What is *not* present

- No JS-level obfuscator (no `_0x` hex names, no string-array
  encoders, no anti-debug). It is a stock esbuild minify pass.
- No native code anti-debug in the codex binary beyond standard
  Rust stripping; symbols are gone but source is public so this is
  moot.
- No license check inside the binary that I can see; auth is via
  the OpenAI account flow at `api.openai.com/auth`.

### 4.5 Overall difficulty rating

| Goal | Difficulty | Recommended path |
|---|---|---|
| Understand the agent (prompts, tools, sandbox) | **Easy** | Read `openai/codex` Rust source |
| Understand the IDE glue | Low | Run `./fetch.sh` + the snippets here |
| Understand the chat UI | Medium | Beautify webview chunks, map to React tree |
| Build a 100 % open replacement | High | All three layers + ChatGPT-account auth flow |

---

## 5. Legal / policy considerations

- The bundled binaries (`codex`, `rg`, `bwrap`) and the Starlark
  grammar are each under open licenses (Apache-2.0, MIT/Unlicense,
  LGPL-2.1, Apache-2.0 respectively). Their `LICENSE` and `NOTICE`
  files are present in the upstream projects.
- The closed parts (TS wrapper + webview) ship under the OpenAI
  Terms of Use referenced from `LICENSE.md`. Those terms prohibit
  redistribution and reverse engineering of OpenAI's services.
- The marketplace download itself is governed by the
  **Visual Studio Marketplace Terms of Use** (separate from
  OpenAI's). The MS terms allow personal download for the
  purpose of using the extension; downstream redistribution of
  the `.vsix` is not permitted.
- Interoperability RE — e.g. understanding the JSON-RPC shape so
  you can build an alternative front-end against the open-source
  `codex` CLI — is on solid footing because the *server* side is
  Apache-2.0. Decompiling the closed wrapper just to copy logic
  is on much weaker footing.
- This document therefore stops at static analysis (file
  inventory, strings, beautified minified JS) and does not modify
  or redistribute any binaries.

---

## 6. Open questions worth follow-up

1. What exactly does `--analytics-default-enabled` do server-side?
   Search the open-source `codex-rs/app-server` crate.
2. Full method list of the `app-server` JSON-RPC beyond stock MCP —
   the wrapper presumably calls custom Codex methods for
   thread/session management, file diff streaming, etc. Capture
   the actual stdio with `strace -f -e write` or by setting
   `chatgpt.cliExecutable` to a stdio-tee wrapper.
3. The `openai/skills` repo content and how the wrapper merges
   project-level `.rules` files with the cloned skills.
4. The `chatSessionsProvider` and `languageModelProxy` proposed
   VSCode APIs — what surface does the wrapper register, and how
   does it feed VSCode's built-in chat panel?

---

## 7. Reproducing this analysis

```
cd codex-re
./fetch.sh linux-x64           # downloads + extracts + beautifies
ls extracted/linux-x64/extension/
less analysis/extension.beautified.js
```

For a fully passive capture of the wire protocol, set
`chatgpt.cliExecutable` to a script that `tee`s stdio while exec'ing
the real binary, then launch the extension in a clean profile.

---

*Document version: initial pass, 2026-05-28.*
