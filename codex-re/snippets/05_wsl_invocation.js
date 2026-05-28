// Source: extension.beautified.js  (verbatim, beautified from out/extension.js)
// Start line: 63481
// Description: Windows-via-WSL invocation builder (X6e function body excerpt)

    s = ar(ZR(t, "linux")),
    a = tl.Uri.joinPath(t, i).fsPath,
    c = ar(a),
    l = tl.workspace.workspaceFolders?.[0]?.uri.fsPath,
    u = l ? ar(l) : void 0,
    d = [
      `PATH=${c}:$PATH`,
      "RUST_LOG=warn",
      `CODEX_INTERNAL_ORIGINATOR_OVERRIDE=${op}`,
    ],
    f = ["-d", o];
  (u && f.push("--cd", u), f.push("--", "/usr/bin/bash", "-lc"));
  let h = ["/usr/bin/env", ...d, s, e];
  h.push(...r);
  let g = Qr(h);
  (f.push(g),
    hce().info("WSL command", {
      safe: { command: `wsl.exe ${f.join(" ")}` },
      sensitive: {},
    }));
  let S = (0, _L.spawn)("wsl.exe", f, {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...n, WSLENV: Wae() },
  });
  if (S.pid == null)
    throw new Error(
      `Failed to spawn codex mcp process inside WSL: wsl ${f.join(" ")}`,
    );
  return S;
}
function Q6e() {
  let t = tl.workspace.getConfiguration("http"),
    e = t.get("proxy"),
    r = t.get("proxyStrictSSL"),
    n = {};
  return (
