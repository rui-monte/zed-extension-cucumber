'use strict';

const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const serverRequire = createRequire(path.resolve(__dirname, '../managed-server/server.cjs'));
const { createMessageConnection, StreamMessageReader, StreamMessageWriter } = serverRequire('vscode-jsonrpc/node');

async function startServer(t, root, settings = {}) {
  const launcher = path.resolve(__dirname, '../managed-server/server.cjs');
  // Deliberately run outside the project: file URIs must use initialize.rootUri.
  const child = spawn(process.execPath, [launcher, '--stdio'], {
    cwd: path.dirname(launcher),
    env: { ...process.env, npm_config_offline: 'true', npm_config_registry: 'http://127.0.0.1:9' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (data) => { stderr += data; });
  const connection = createMessageConnection(new StreamMessageReader(child.stdout), new StreamMessageWriter(child.stdin));
  const events = new EventEmitter();
  const diagnostics = new Map();
  const messages = [];
  const registrations = [];
  let indexes = 0;
  let config = settings;
  connection.onRequest('workspace/configuration', ({ items }) => items.map(({ section }) => section === 'cucumber' ? config : null));
  connection.onRequest('client/registerCapability', ({ registrations: incoming }) => { registrations.push(...incoming); events.emit('update'); return null; });
  connection.onRequest('workspace/semanticTokens/refresh', () => null);
  connection.onNotification('window/logMessage', (message) => {
    messages.push(message);
    if (message.message.includes('suggestions for auto complete')) indexes++;
    events.emit('update');
  });
  connection.onNotification('textDocument/publishDiagnostics', ({ uri, diagnostics: items }) => { diagnostics.set(uri, items); events.emit('update'); });
  child.on('exit', () => { connection.dispose(); events.emit('update'); });
  t.after(() => { connection.dispose(); child.kill(); });
  connection.listen();

  async function until(predicate) {
    if (predicate()) return;
    await new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); events.off('update', check); };
      const check = () => {
        if (predicate()) { cleanup(); resolve(); }
        else if (child.exitCode !== null) { cleanup(); reject(new Error(`Server exited: ${stderr}`)); }
      };
      const timer = setTimeout(() => { cleanup(); reject(new Error(`LSP timed out\n${stderr}\n${messages.map((m) => m.message).join('\n')}\n${JSON.stringify([...diagnostics])}`)); }, 15000);
      events.on('update', check);
      check();
    });
  }
  async function request(method, params) {
    let timer;
    try {
      return await Promise.race([
        connection.sendRequest(method, params),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${method} timed out\n${stderr}`)), 15000); }),
      ]);
    } finally { clearTimeout(timer); }
  }
  const initialized = await request('initialize', {
    processId: process.pid,
    rootUri: pathToFileURL(root).href,
    capabilities: {
      workspace: { configuration: true, didChangeConfiguration: { dynamicRegistration: true }, didChangeWatchedFiles: { dynamicRegistration: true }, semanticTokens: { refreshSupport: true } },
      textDocument: { completion: { completionItem: { snippetSupport: true } }, definition: { linkSupport: true }, formatting: {}, codeAction: {}, documentSymbol: {}, semanticTokens: { requests: { full: true }, tokenTypes: [], tokenModifiers: [], formats: ['relative'] } },
    },
    workspaceFolders: [{ uri: pathToFileURL(root).href, name: 'cucumber-fixture' }],
  });
  await connection.sendNotification('initialized', {});
  await until(() => indexes > 0 && registrations.some((r) => r.method === 'workspace/didChangeWatchedFiles'));
  return {
    initialized, messages, registrations, request, until, diagnostics,
    async open(file, text, languageId = 'cucumber') {
      const uri = pathToFileURL(file).href;
      await connection.sendNotification('textDocument/didOpen', { textDocument: { uri, languageId, version: 1, text } });
      return uri;
    },
    async configure(next) {
      config = next;
      const before = indexes;
      await connection.sendNotification('workspace/didChangeConfiguration', { settings: { cucumber: next } });
      await until(() => indexes > before);
    },
    async filesChanged(changes) {
      const before = indexes;
      await connection.sendNotification('workspace/didChangeWatchedFiles', { changes });
      await until(() => indexes > before);
    },
    async change(uri, text, version = 2) {
      const before = indexes;
      await connection.sendNotification('textDocument/didChange', { textDocument: { uri, version }, contentChanges: [{ text }] });
      await until(() => indexes > before);
    },
    async diagnosticItems(uri, predicate = () => true) {
      await until(() => diagnostics.has(uri) && predicate(diagnostics.get(uri)));
      return diagnostics.get(uri);
    },
  };
}

module.exports = { startServer };
