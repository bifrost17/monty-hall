// Source: extension.beautified.js  (verbatim, beautified from out/extension.js)
// Start line: 35817
// Description: Process-tree classifier used by the telemetry/perf monitor

function d7(t) {
  return /\bcodex app-server\b/i.test(t)
    ? "app_server"
    : /--type=renderer\b/i.test(t)
      ? "electron_renderer"
      : /--type=gpu-process\b/i.test(t)
        ? "electron_gpu"
        : /--utility-sub-type=network\.mojom\.NetworkService\b/i.test(t)
          ? "electron_network"
          : /--utility-sub-type=proxy_resolver\.mojom\.ProxyResolverFactory\b/i.test(
                t,
              )
            ? "electron_proxy"
            : /--type=utility\b/i.test(t) || /\bElectron Helper\b/i.test(t)
              ? "electron_utility"
              : /\bmcp(?:\b|[._/-])/i.test(t)
                ? "mcp"
                : /\bgit\b/i.test(t)
                  ? "git"
                  : /\b(?:bash|fish|sh|zsh|pwsh|powershell|cmd(?:\.exe)?)\b/i.test(
                        t,
                      )
                    ? "shell"
                    : "other";
}
var o7,
  i7,
  s7,
  a7,
  c7,
