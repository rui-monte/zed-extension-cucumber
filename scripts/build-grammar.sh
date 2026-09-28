#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${WASI_SDK_PATH:?Set WASI_SDK_PATH to an installed WASI SDK}"
mkdir -p grammars
# Avoid a dynamic libc dependency: Tree-sitter supplies the scanner allocator.
"$WASI_SDK_PATH/bin/clang" -fPIC -shared -Os -nostdlib \
  -Wl,--no-entry -Wl,--allow-undefined -Wl,--export=tree_sitter_gherkin \
  -o grammars/gherkin.wasm -I grammar/src grammar/src/parser.c grammar/src/scanner.c
