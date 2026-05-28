// Source: extension.beautified.js  (verbatim, beautified from out/extension.js)
// Start line: 63440
// Description: Spawn helper gce()

function gce(t, e, r) {
  let n = process.platform === "win32",
    o = Q6e();
  if (ir())
    return (hce().info("Spawning codex process inside WSL"), X6e(t, e, r, o));
  let i = ip(),
    s = ZR(t),
    a = n ? ";" : ":",
    c = process.env.PATH + a + tl.Uri.joinPath(t, i).fsPath,
    l = [e, ...r],
    u = (0, _L.spawn)(s, l, {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        ...o,
        PATH: c,
        RUST_LOG: "warn",
        CODEX_INTERNAL_ORIGINATOR_OVERRIDE: op,
      },
    });
  if (u.pid == null)
    throw new sp(`Failed to spawn codex mcp process at ${s}`, {
      signal: null,
      exitCode: null,
    });
  return u;
}
