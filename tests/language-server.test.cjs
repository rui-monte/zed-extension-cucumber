'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { startServer } = require('./lsp-client.cjs');

async function fixture(t, files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zed cucumber '));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(root, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text);
  }
  return root;
}

const steps = "import { Given, Then } from '@cucumber/cucumber';\nGiven('I have {int} cucumbers', function (count) {});\nThen('I eat {int} cucumbers', function (count) {});\n";
const feature = 'Feature: Cucumbers\n  Scenario: Lunch\n    Given I have 3 cucumbers\n    Then a missing step\n';

test('official server provides diagnostics, definitions, snippets, completion, formatting and semantic tokens', async (t) => {
  const root = await fixture(t, { 'features/lunch.feature': feature, 'features/steps.ts': steps });
  const client = await startServer(t, root);
  assert.equal(client.initialized.serverInfo.version, '1.7.0');
  const uri = await client.open(path.join(root, 'features/lunch.feature'), feature);
  const diagnostics = await client.diagnosticItems(uri, (items) => items.length === 1);
  assert.match(diagnostics[0].message, /Undefined step/);
  assert.equal(diagnostics[0].range.start.line, 3);

  const definitions = await client.request('textDocument/definition', { textDocument: { uri }, position: { line: 2, character: 18 } });
  assert.equal(definitions[0].targetUri, pathToFileURL(path.join(root, 'features/steps.ts')).href);
  const actions = await client.request('textDocument/codeAction', { textDocument: { uri }, range: diagnostics[0].range, context: { diagnostics } });
  assert.ok(actions.length > 0);
  assert.match(JSON.stringify(actions), /a missing step/);
  assert.match(JSON.stringify(actions), /steps.ts/);

  const completion = await client.request('textDocument/completion', { textDocument: { uri }, position: { line: 2, character: 16 } });
  assert.ok(completion.some((item) => item.label.includes('cucumbers')));
  const symbols = await client.request('textDocument/documentSymbol', { textDocument: { uri } });
  assert.match(JSON.stringify(symbols), /Lunch/);
  const tokens = await client.request('textDocument/semanticTokens/full', { textDocument: { uri } });
  assert.ok(tokens.data.length > 0);

  const messy = 'Feature: Table\nScenario: Alignment\nGiven I have 3 cucumbers\n|name|count|\n|a|2|\n|long|10|\n';
  const formattingUri = await client.open(path.join(root, 'features/format.feature'), messy);
  const edits = await client.request('textDocument/formatting', { textDocument: { uri: formattingUri }, options: { tabSize: 2, insertSpaces: true } });
  assert.ok(edits.length > 0);
  assert.match(edits.map((edit) => edit.newText).join(''), /  Scenario: Alignment/);
  assert.match(edits.map((edit) => edit.newText).join(''), /\| long \|\s+10 \|/);
});

test('settings updates apply defaults and custom parameter types without restarting', async (t) => {
  const root = await fixture(t, { 'features/lunch.feature': feature, 'custom/steps.ts': steps });
  const client = await startServer(t, root);
  const uri = await client.open(path.join(root, 'features/lunch.feature'), feature);
  await client.diagnosticItems(uri, (items) => items.length === 2);
  await client.configure({ glue: ['custom/**/*.ts'] });
  await client.diagnosticItems(uri, (items) => items.length === 1);
  assert.ok(!client.messages.some((message) => /Failed to reindex/.test(message.message)));

  await fs.writeFile(path.join(root, 'custom/steps.ts'), "import { Given } from '@cucumber/cucumber';\nGiven('{actor} has cucumbers', function (actor) {});\n");
  await client.configure({ glue: ['custom/**/*.ts'], parameterTypes: [{ name: 'actor', regexp: '[A-Z][a-z]+' }] });
  await client.change(uri, 'Feature: Actors\n  Scenario: Lunch\n    Given Alice has cucumbers\n');
  await client.diagnosticItems(uri, (items) => items.length === 0);
});

test('saved step definitions are reindexed on create, change and delete', async (t) => {
  const root = await fixture(t, { 'features/lunch.feature': feature });
  const client = await startServer(t, root);
  const uri = await client.open(path.join(root, 'features/lunch.feature'), feature);
  await client.diagnosticItems(uri, (items) => items.length === 2);
  const file = path.join(root, 'features/steps.ts');
  const fileUri = pathToFileURL(file).href;
  await fs.writeFile(file, steps);
  await client.filesChanged([{ uri: fileUri, type: 1 }]);
  await client.diagnosticItems(uri, (items) => items.length === 1);
  await fs.writeFile(file, `${steps}Then('a missing step', function () {});\n`);
  await client.filesChanged([{ uri: fileUri, type: 2 }]);
  await client.diagnosticItems(uri, (items) => items.length === 0);
  await fs.unlink(file);
  await client.filesChanged([{ uri: fileUri, type: 3 }]);
  await client.diagnosticItems(uri, (items) => items.length === 2);
});

test('localized Gherkin and independent worktree configurations use the official parser', async (t) => {
  const portuguese = '# language: pt\nFuncionalidade: Pepinos\n  Cenário: Almoço\n    Dado I have 3 cucumbers\n';
  const root = await fixture(t, { 'specs/lunch.feature': portuguese, 'glue/steps.ts': steps });
  const client = await startServer(t, root, { features: ['specs/**/*.feature'], glue: ['glue/**/*.ts'] });
  const uri = await client.open(path.join(root, 'specs/lunch.feature'), portuguese);
  await client.diagnosticItems(uri, (items) => items.length === 0);
  const definitions = await client.request('textDocument/definition', { textDocument: { uri }, position: { line: 3, character: 18 } });
  assert.equal(definitions[0].targetUri, pathToFileURL(path.join(root, 'glue/steps.ts')).href);
  const secondRoot = await fixture(t, { 'features/lunch.feature': feature });
  const second = await startServer(t, secondRoot);
  const secondUri = await second.open(path.join(secondRoot, 'features/lunch.feature'), feature);
  await second.diagnosticItems(secondUri, (items) => items.length === 2);
  assert.equal((await client.diagnosticItems(uri)).length, 0);
});

test('.gherkin files receive diagnostics and recover after step definitions change', async (t) => {
  const root = await fixture(t, { 'features/lunch.gherkin': feature, 'features/steps.ts': steps });
  const client = await startServer(t, root, { features: ['features/**/*.gherkin'] });
  const uri = await client.open(path.join(root, 'features/lunch.gherkin'), feature);
  await client.diagnosticItems(uri, (items) => items.length === 1);
  const file = path.join(root, 'features/steps.ts');
  await fs.writeFile(file, `${steps}Then('a missing step', function () {});\n`);
  await client.filesChanged([{ uri: pathToFileURL(file).href, type: 2 }]);
  await client.diagnosticItems(uri, (items) => items.length === 0);
});
