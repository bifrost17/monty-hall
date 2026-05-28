#!/usr/bin/env bash
# Reproducible download + extraction of the OpenAI Codex VS Code extension
# for reverse-engineering analysis. Run from inside codex-re/.
#
# Usage: ./fetch.sh [linux-x64|darwin-arm64|darwin-x64|win32-x64|win32-arm64|universal]
# Default: linux-x64 (smallest single-platform package)
set -euo pipefail

PLATFORM="${1:-linux-x64}"
PUBLISHER="openai"
EXTENSION="chatgpt"
QUERY_JSON='{"filters":[{"criteria":[{"filterType":7,"value":"openai.chatgpt"}]}],"flags":914}'

mkdir -p vsix extracted analysis

echo "[1/4] Querying marketplace for latest version..."
curl -sL -X POST "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery" \
  -H "Accept: application/json;api-version=3.0-preview.1" \
  -H "Content-Type: application/json" \
  -d "${QUERY_JSON}" \
  -o vsix/query.json

if [[ "${PLATFORM}" == "universal" ]]; then
  FILTER='select(.targetPlatform == null)'
else
  FILTER="select(.targetPlatform == \"${PLATFORM}\")"
fi

read -r VERSION URL < <(jq -r "
  .results[0].extensions[0].versions[]
  | ${FILTER}
  | \"\\(.version) \\(.files | map(select(.assetType == \"Microsoft.VisualStudio.Services.VSIXPackage\")) | .[0].source)\"
" vsix/query.json | head -1)

echo "    Version=${VERSION}  Platform=${PLATFORM}"
echo "    URL=${URL}"

OUT="vsix/codex-${PLATFORM}-${VERSION}.vsix"
if [[ ! -f "${OUT}" ]]; then
  echo "[2/4] Downloading ${OUT}..."
  curl -sL -o "${OUT}" "${URL}"
else
  echo "[2/4] Already downloaded: ${OUT}"
fi

DEST="extracted/${PLATFORM}"
rm -rf "${DEST}"
mkdir -p "${DEST}"
echo "[3/4] Extracting to ${DEST}..."
unzip -q "${OUT}" -d "${DEST}"

if command -v npx >/dev/null 2>&1; then
  echo "[4/4] Beautifying extension.js -> analysis/extension.beautified.js"
  npx --yes -p prettier@3 prettier --parser babel \
    "${DEST}/extension/out/extension.js" \
    > analysis/extension.beautified.js 2>/dev/null || true
else
  echo "[4/4] npx not found; skipping prettier pass"
fi

echo "Done. Layout:"
find "${DEST}/extension" -maxdepth 2 -type d | sed "s/^/  /"
echo ""
echo "Bundled binaries:"
find "${DEST}/extension/bin" -type f -exec ls -lh {} \; | sed "s/^/  /"
