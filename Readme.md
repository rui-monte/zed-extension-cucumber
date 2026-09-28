# Cucumber/Gherkin for Zed

Gherkin editing powered by the same official Cucumber language server and WASM parsers as [Cucumber for VS Code](https://github.com/cucumber/vscode). The extension installs its server automatically; your projects do not need a language-server dependency.

## Features

- Step completion from Cucumber Expressions, regular expressions, and existing feature files.
- Go to step definition, undefined-step and syntax diagnostics, and quick fixes that generate step definitions.
- Gherkin formatting with two-space indentation and aligned tables.
- Localized keywords, feature/rule/scenario outlines, tags, scenario parameters, and doc strings with embedded language highlighting.
- Triple-quote and backtick doc-string pairs.
- Step definitions refresh when supported source files are created, saved, or deleted, including changes outside Zed.
- `.feature` and `.gherkin` file associations.

The upstream server supports JavaScript/TypeScript, Java, Python, Ruby, C#, PHP, Rust, and Go step definitions. Generation needs at least one existing step definition so Cucumber can determine the target language and file.

## Configuration

Defaults match the official server: feature files under `features`, `tests`, `src/test`, and `*specs*`, with conventional step-definition locations for each supported language. For another layout, put this in `.zed/settings.json`:

```json
{
  "lsp": {
    "cucumber": {
      "settings": {
        "features": ["features/**/*.{feature,gherkin}"],
        "glue": ["features/**/*.ts", "src/steps/**/*.ts"],
        "parameterTypes": [
          { "name": "actor", "regexp": "[A-Z][a-z]+" }
        ]
      }
    }
  },
  "languages": {
    "Gherkin": {
      "semantic_tokens": "combined"
    }
  }
}
```

Paths are relative to the project root. In a monorepo, include each package, for example `packages/*/features/**/*.feature` and `packages/*/features/**/*.ts`. Add `.gherkin` to `features` if you use that suffix; upstream defaults only discover `.feature` files.

`features`, `glue`, `parameterTypes`, and `snippetTemplates` are passed to Cucumber. Omitted settings retain upstream defaults. Parameter types declared in glue files are discovered automatically. Changes to these settings reindex the project without restarting the server.

Zed's optional `semantic_tokens: "combined"` enables Cucumber's parameter highlighting over the native syntax colors. To use Cucumber's document symbols instead of the native outline, also set `document_symbols: "on"` for Gherkin. Restart the language server after changing semantic-token settings.

For localization, start a feature with a language directive:

```gherkin
# language: pt
Funcionalidade: Pepinos
  Cenário: Almoço
    Dado que tenho 3 pepinos
```

## Managed and custom servers

This release pins `@cucumber/language-server` and `@cucumber/language-service` to **1.7.0**, matching the official VS Code extension's stack. The parsers use WASM, so no native Tree-sitter build or Node ABI workaround is necessary. Local validation passed on Node 22.23.3, 24.21.0, and 26.8.1; CI is configured for Node 22 and 24.

The packages live in Zed's extension storage. Startup checks the pinned versions and parser assets and reuses a complete installation offline, without querying npm for a newer release. A missing, damaged, or mismatched package is installed again; installation errors are reported instead of silently running an incompatible server.

The committed npm lockfile makes development and CI installs reproducible. Zed's npm API installs exact direct package versions but does not honor a package lockfile; transitive dependencies follow those packages' upstream constraints.

The managed launcher fixes three integration details: npm-hoisted WASM asset paths, Zed's nested configuration notifications, and file-change reindexing. It also resolves files relative to the actual project URI, even when the process working directory differs.

To use a separately installed server, set an explicit executable:

```json
{
  "lsp": {
    "cucumber": {
      "binary": {
        "path": "cucumber-language-server",
        "arguments": ["--stdio"]
      }
    }
  }
}
```

The path can be absolute, relative to the worktree, use `~/`, or name an executable on the worktree's PATH. `binary.env` can supply environment overrides. To launch a JavaScript file directly, use the Node executable as `path` and supply the script and `--stdio` as `arguments`.

An explicit custom server bypasses managed installation and the managed adapter. Its compatibility, asset resolution, and notification behavior are the user's responsibility. Unlike earlier versions of this extension, an ambient `cucumber-language-server` on PATH does not override the pinned stack automatically.

## Development

Install stable Rust with the `wasm32-wasip2` target and a maintained Node release. Then:

```sh
cargo fmt -- --check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo build --locked --release --target wasm32-wasip2
npm ci --prefix managed-server --ignore-scripts --omit=optional --no-audit --no-fund
node scripts/generate-dialects.cjs --check
WASI_SDK_PATH=/path/to/wasi-sdk bash scripts/build-grammar.sh
npm test --prefix managed-server
```

The tests exercise a real Cucumber server over stdio, with npm networking disabled during startup, and validate the compiled grammar and Zed queries. They cover completions, diagnostics, navigation, generated snippets, formatting, semantic tokens, partial settings, custom parameter types, file updates, independent project roots, `.gherkin` diagnostics, and localized scenarios. Without the compiled grammar, only the grammar tests are skipped; CI builds it first.

In Zed, run **Extensions: Install Dev Extension** and select this checkout. Zed builds the Rust component and its pinned grammar. See [the editor smoke-test procedure](tests/zed-smoke-test.md) for runtime validation and [grammar/README.md](grammar/README.md) for the localized grammar and its upstream attribution.

This is a Zed integration, not an official Cucumber extension. Feature-file icons follow Zed's selected icon theme; VS Code-specific UI and test-runner integrations are not included.
