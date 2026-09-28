'use strict';

const { createRequire } = require('node:module');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { CucumberLanguageServer } = require('@cucumber/language-server');
const { NodeFiles } = require('@cucumber/language-server/node');
const { WasmParserAdapter } = require('@cucumber/language-service/wasm');
const { getGherkinDiagnostics } = require('@cucumber/language-service');
const { adaptConnection } = require('./zed-adapter.cjs');

// Resolve protocol dependencies from the pinned server, independently of the
// user's project and npm's choice of nested versus hoisted dependencies.
const serverRequire = createRequire(require.resolve('@cucumber/language-server'));
const { createConnection, ProposedFeatures, TextDocuments } = serverRequire('vscode-languageserver/node');
const { TextDocument } = serverRequire('vscode-languageserver-textdocument');
const glob = serverRequire('fast-glob');

const connection = adaptConnection(createConnection(ProposedFeatures.all));
const documents = new TextDocuments(TextDocument);
let expressions = [];

// This extension also recognizes .gherkin; upstream only publishes diagnostics
// for .feature. Use its same diagnostic implementation for the existing alias.
function publishAliasDiagnostics(document) {
  if (document.uri.endsWith('.gherkin')) {
    return connection.sendDiagnostics({ uri: document.uri, diagnostics: getGherkinDiagnostics(document.getText(), expressions) });
  }
}
documents.onDidChangeContent(({ document }) => publishAliasDiagnostics(document));
documents.onDidClose(({ document }) => {
  if (document.uri.endsWith('.gherkin')) connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
});

class WorkspaceFiles extends NodeFiles {
  constructor(rootUri) {
    super(rootUri);
    this.root = fileURLToPath(rootUri);
  }

  async findUris(pattern) {
    // Upstream NodeFiles resolves relative results against process.cwd(). Use
    // the actual worktree root, including paths containing spaces, instead.
    const paths = await glob(pattern, { cwd: this.root, absolute: true, caseSensitiveMatch: false, onlyFiles: true });
    return paths.map((file) => pathToFileURL(file).href);
  }

  async readFile(uri) {
    return documents.get(uri)?.getText() ?? super.readFile(uri);
  }

  relativePath(uri) {
    return path.relative(this.root, fileURLToPath(uri));
  }
}

// The official CLI assumes a nested language-service installation. npm normally
// hoists it; resolve its actual location to find the bundled WASM grammars.
const wasmDirectory = path.resolve(path.dirname(require.resolve('@cucumber/language-service')), '../..');
new CucumberLanguageServer(connection, documents, new WasmParserAdapter(wasmDirectory),
  (rootUri) => new WorkspaceFiles(rootUri), (_registry, indexedExpressions) => {
    expressions = indexedExpressions;
    for (const document of documents.all()) publishAliasDiagnostics(document);
  });
connection.listen();
