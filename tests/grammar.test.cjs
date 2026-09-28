'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const serverRequire = createRequire(path.resolve(__dirname, '../managed-server/server.cjs'));
const Parser = serverRequire('web-tree-sitter');
const wasm = path.resolve(__dirname, '../grammars/gherkin.wasm');
const dialects = serverRequire('@cucumber/gherkin/dist/src/gherkin-languages.json');

test('Gherkin grammar and Zed queries support dialects, rules, tags, outlines and both doc strings', { skip: !fs.existsSync(wasm) && 'Build grammars/gherkin.wasm first (see tests/zed-smoke-test.md)' }, async () => {
  await Parser.init();
  const language = await Parser.Language.load(wasm);
  const parser = new Parser();
  parser.setLanguage(language);
  const queries = {};
  const directory = path.resolve(__dirname, '../languages/gherkin');
  for (const file of fs.readdirSync(directory).filter((name) => name.endsWith('.scm'))) {
    queries[file] = language.query(fs.readFileSync(path.join(directory, file), 'utf8'));
  }

  const english = '@tag.with.dot\nFeature: Cucumbers\n  Rule: Lunch\n    Background:\n      Given a kitchen\n    Scenario Outline: Portions\n      Given <count> cucumbers\n      And a document\n        """json\n        {"name": "Alice"}\n        """\n      And another document\n        ```yaml\n        name: Alice\n        ```\n    Examples:\n      | count |\n      | 3     |\n';
  const tree = parser.parse(english);
  assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
  const names = queries['outline.scm'].captures(tree.rootNode).filter((capture) => capture.name === 'name').map((capture) => capture.node.text);
  assert.deepEqual(names, ['Cucumbers', 'Lunch', 'Portions']);
  const injections = queries['injections.scm'].captures(tree.rootNode);
  assert.deepEqual(injections.filter((capture) => capture.name === 'language').map((capture) => capture.node.text), ['json', 'yaml']);
  const brackets = queries['brackets.scm'].matches(tree.rootNode);
  assert.equal(brackets.length, 2);
  assert.ok(brackets.every((match) => match.captures.map((capture) => capture.name).join(',') === 'open,close'));
  assert.ok(queries['highlights.scm'].captures(tree.rootNode).some((capture) => capture.node.text === '@tag.with.dot'));
  tree.delete();

  for (const source of [
    '# language: pt\nFuncionalidade: Pepinos\n  Cenário: Almoço\n    Dado 3 pepinos\n',
    '# language: fr\nFonctionnalité: Concombres\n  Scénario: Repas\n    Soit 3 concombres\n',
  ]) {
    const localized = parser.parse(source);
    assert.equal(localized.rootNode.hasError, false, localized.rootNode.toString());
    assert.equal(queries['outline.scm'].captures(localized.rootNode).filter((capture) => capture.name === 'item').length, 2);
    assert.ok(queries['highlights.scm'].captures(localized.rootNode).some((capture) => capture.name === 'keyword'));
    localized.delete();
  }
  for (const query of Object.values(queries)) query.delete();
  parser.delete();
});

test('every official dialect recognizes all scenario keyword aliases', { skip: !fs.existsSync(wasm) && 'Build grammars/gherkin.wasm first' }, async () => {
  await Parser.init();
  const language = await Parser.Language.load(wasm);
  const parser = new Parser();
  parser.setLanguage(language);
  for (const [code, dialect] of Object.entries(dialects)) {
    for (const scenario of dialect.scenario) {
      const given = dialect.given.find((keyword) => keyword !== '* ');
      const source = `# language: ${code}\n${dialect.feature[0]}: Feature\n  ${scenario}: Scenario\n    ${given}a step\n`;
      const tree = parser.parse(source);
      assert.equal(tree.rootNode.hasError, false, `${code}: ${scenario}\n${tree.rootNode}`);
      assert.equal(tree.rootNode.descendantsOfType('scenario').length, 1, `${code}: ${scenario}\n${tree.rootNode}`);
      tree.delete();
    }
  }
  parser.delete();
});
