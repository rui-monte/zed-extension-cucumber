mod managed;
mod server;

use zed::settings::LspSettings;
use zed_extension_api::{self as zed, serde_json, Result};

struct CucumberExtension;

impl zed::Extension for CucumberExtension {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        id: &zed::LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        let settings = LspSettings::for_worktree(id.as_ref(), worktree)?;
        let mut env = worktree.shell_env();
        if let Some(binary) = settings.binary {
            if let Some(overrides) = binary.env {
                for (key, value) in overrides {
                    env.retain(|(existing, _)| existing != &key);
                    env.push((key, value));
                }
            }
            if let Some(path) = binary.path {
                let command = server::custom_path(&path, &worktree.root_path(), &env)?;
                return Ok(zed::Command {
                    command: worktree.which(&command).unwrap_or(command),
                    args: binary.arguments.unwrap_or_else(|| vec!["--stdio".into()]),
                    env,
                });
            }
            if binary.arguments.is_some() {
                return Err(
                    "Set `lsp.cucumber.binary.path` when overriding server arguments".into(),
                );
            }
        }
        let script = managed::server(id)?;
        Ok(zed::Command {
            command: zed::node_binary_path()?,
            args: vec![script, "--stdio".into()],
            env,
        })
    }

    fn language_server_workspace_configuration(
        &mut self,
        id: &zed::LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<Option<serde_json::Value>> {
        let settings = LspSettings::for_worktree(id.as_ref(), worktree)?;
        server::workspace_configuration(settings.settings).map(Some)
    }
}

zed::register_extension!(CucumberExtension);
