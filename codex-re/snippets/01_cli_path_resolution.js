// Source: extension.beautified.js  (verbatim, beautified from out/extension.js)
// Start line: 63467
// Description: Resolve codex CLI binary path (honours chatgpt.cliExecutable override)

function ZR(t, e) {
  let r = Hr("cliExecutable");
  if (r && r.trim().length > 0) return r;
  let n = ip(e),
    o = (e ?? process.platform) === "win32" ? "codex.exe" : "codex";
  return tl.Uri.joinPath(t, `${n}/${o}`).fsPath;
}
