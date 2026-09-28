# Zed smoke test

Automated tests cover the extension's Rust logic and the actual Cucumber language server. This procedure also checks Zed's WASI host, its npm installer, language registration, and editor interactions.

1. Build the Rust component and grammar using the commands in the README. Install this checkout as a development extension in a disposable Zed profile (`zed --user-data-dir /tmp/zed-cucumber-test`). On macOS, use `ZED_STATELESS=1` to run a separate instance alongside the normal editor.
2. Create a temporary project containing `features/lunch.feature` and `features/steps.ts` below. Do not install any npm packages in that project.
3. Open the project and trust this generated fixture. Check the extension's installation status and use **dev: open language server logs** to inspect the running server.

```gherkin
Feature: Cucumbers
  Scenario: Lunch
    Given I have 3 cucumbers
    Then a missing step
```

```typescript
import { Given, Then } from '@cucumber/cucumber';
Given('I have {int} cucumbers', function (count) {});
Then('I eat {int} cucumbers', function (count) {});
```

| Check | Expected behavior |
| --- | --- |
| First open | Managed 1.7.0 server and service install in the selected profile, and Gherkin syntax colors appear. |
| Diagnostics | Only `a missing step` is undefined. |
| Go to definition on `I have 3 cucumbers` | Opens `features/steps.ts` at the matching definition. |
| Type `Given I ha`, then trigger completion | Offers the existing cucumber step with its parameter placeholder. |
| Quick fix on the missing step | Offers to generate a definition in `features/steps.ts`. |
| Apply that fix and save the step file | The feature's diagnostic clears without editing or reopening the feature. |
| Format an unindented feature/table | Uses two-space indentation and aligns table columns. |
| Open Portuguese `Funcionalidade` / `Cenário` and French `Fonctionnalité` / `Scénario` files with language headers | Keywords and outlines work, and the server recognizes localized steps. |
| Change `lsp.cucumber.settings.glue` to a different directory | Diagnostics and navigation update without a server restart. |
| Restart the isolated profile with `npm_config_offline=true npm_config_registry=http://127.0.0.1:9` | The cached stack starts and provides definitions/diagnostics. Package file modification times remain unchanged. This limits npm networking, not all machine networking. |
| Set `lsp.cucumber.binary.path` and explicit arguments for another stdio server | That command starts without a managed installation. Remove the override after testing. |

Optional: set `languages.Gherkin.semantic_tokens` to `combined` for parameter highlighting and `document_symbols` to `on` for upstream outlines. A `.gherkin` fixture should receive diagnostics too; include the suffix in `settings.features` for completion indexing.

CI runs protocol tests and compiled-grammar tests. It does not drive the editor UI. Record the actual editor version and observed checks separately when doing a manual run.

## Recorded editor validation

On 2026-09-28, the extension was exercised in Zed **1.21.0**, macOS arm64, with Node **26.8.1** and a disposable profile. A separately named copy of the installed Zed app allowed the UI automation to target that instance while the regular editor stayed open.

Observed in the actual editor:

- First-run installation produced server and service packages at 1.7.0 in extension storage, with no npm installation in the fixture project.
- Only the undefined step was underlined. Go to definition opened the matching TypeScript expression.
- The quick fix generated a `Then` definition in the existing file; saving it cleared the feature diagnostic without editing the feature.
- The completion menu offered `I have {int} cucumbers` after typing `I ha`.
- Portuguese `Funcionalidade`, `Cenário`, and `Dado` were highlighted correctly.
- After a restart with npm offline and an unreachable npm registry, definition navigation still worked. The running server inherited both flags, and the managed package versions and modification times were unchanged.
- An explicit Node/script override provided definition navigation while the managed cache was moved aside, without recreating managed `node_modules`.

Formatting, custom parameter types, settings updates, independent worktrees, `.gherkin` diagnostics, and all 143 scenario aliases across 80 dialects are covered by automated tests. Those checks are not claimed as additional manual editor observations. Screenshots and the offline-process record from this run are local artifacts under `target/ide-validation/`.
