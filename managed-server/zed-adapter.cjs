'use strict';

// Keep Cucumber's language features upstream. Bridge configuration and file
// notifications from Zed's LSP client without forking the language server.
function adaptConnection(connection) {
  let watchFiles = false;
  let configurationChanged;
  let timer;
  const onInitialize = connection.onInitialize.bind(connection);
  connection.onInitialize = (handler) => onInitialize((params) => {
    watchFiles = !!params.capabilities.workspace?.didChangeWatchedFiles?.dynamicRegistration;
    return handler(params);
  });

  const onDidChangeConfiguration = connection.onDidChangeConfiguration.bind(connection);
  connection.onDidChangeConfiguration = (handler) => {
    // Zed sends { cucumber: ... }. Re-request the section through upstream's
    // getSettings path, which also fills defaults for partial settings.
    configurationChanged = () => handler({ settings: undefined });
    return onDidChangeConfiguration(configurationChanged);
  };

  const onDidChangeWatchedFiles = connection.onDidChangeWatchedFiles.bind(connection);
  connection.onDidChangeWatchedFiles = (handler) => onDidChangeWatchedFiles((params) => {
    handler(params);
    clearTimeout(timer);
    timer = setTimeout(() => configurationChanged?.(), 100);
  });

  const onInitialized = connection.onInitialized.bind(connection);
  connection.onInitialized = (handler) => onInitialized(async (params) => {
    handler(params);
    if (watchFiles) {
      try {
        await connection.client.register('workspace/didChangeWatchedFiles', {
          watchers: [{ globPattern: '**/*.{feature,gherkin,cs,go,java,js,jsx,php,py,rb,rs,ts,tsx}', kind: 7 }],
        });
      } catch (error) {
        connection.console.warn(`Cucumber file watching unavailable: ${error.message}`);
      }
    }
  });
  return connection;
}

module.exports = { adaptConnection };
