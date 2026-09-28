use std::{collections::BTreeMap, fs};

use serde::Deserialize;
use zed::{LanguageServerId, LanguageServerInstallationStatus, Result};
use zed_extension_api::{self as zed, serde_json};

const MANIFEST: &str = include_str!("../managed-server/package.json");
const LAUNCHER: &str = include_str!("../managed-server/server.cjs");
const ADAPTER: &str = include_str!("../managed-server/zed-adapter.cjs");

#[derive(Deserialize)]
struct Manifest {
    dependencies: BTreeMap<String, String>,
}

trait Packages {
    fn installed_version(&self, package: &str) -> Result<Option<String>>;
    fn complete(&self, package: &str) -> bool;
    fn install(&self, package: &str, version: &str) -> Result<()>;
}

struct Npm<'a>(&'a LanguageServerId);

impl Packages for Npm<'_> {
    fn installed_version(&self, package: &str) -> Result<Option<String>> {
        zed::npm_package_installed_version(package)
    }

    fn complete(&self, package: &str) -> bool {
        let files: &[&str] = match package {
            "@cucumber/language-server" => &["dist/cjs/src/index.js", "dist/cjs/src/node/index.js"],
            "@cucumber/language-service" => &[
                "dist/cjs/src/index.js",
                "dist/cjs/src/tree-sitter-wasm/WasmParserAdapter.js",
                "dist/c_sharp.wasm",
                "dist/go.wasm",
                "dist/java.wasm",
                "dist/php.wasm",
                "dist/python.wasm",
                "dist/ruby.wasm",
                "dist/rust.wasm",
                "dist/tsx.wasm",
            ],
            _ => &[],
        };
        files.iter().all(|file| {
            fs::metadata(format!("node_modules/{package}/{file}")).is_ok_and(|stat| stat.is_file())
        })
    }

    fn install(&self, package: &str, version: &str) -> Result<()> {
        zed::set_language_server_installation_status(
            self.0,
            &LanguageServerInstallationStatus::Downloading,
        );
        write("package.json", MANIFEST)?;
        // Use the portable WASM parsers from the official VS Code extension.
        write(".npmrc", include_str!("../managed-server/.npmrc"))?;
        let directory = format!("node_modules/{package}");
        if !self.complete(package) && fs::metadata(&directory).is_ok() {
            fs::remove_dir_all(&directory)
                .map_err(|error| format!("Cannot repair managed {package}: {error}"))?;
        }
        zed::npm_install_package(package, version)
    }
}

pub fn server(id: &LanguageServerId) -> Result<String> {
    let result: Result<String> = (|| {
        // Zed supplies its actual work directory, including remote hosts and
        // custom profiles. WASI filesystem paths are relative to that directory.
        let directory = std::env::var("PWD")
            .map_err(|error| format!("Cannot locate Cucumber extension storage: {error}"))?;
        ensure_installed(&Npm(id))?;
        write("server.cjs", LAUNCHER)?;
        write("zed-adapter.cjs", ADAPTER)?;
        Ok(format!(
            "{}/server.cjs",
            directory.replace('\\', "/").trim_end_matches('/')
        ))
    })();
    let status = match &result {
        Ok(_) => LanguageServerInstallationStatus::None,
        Err(error) => LanguageServerInstallationStatus::Failed(error.clone()),
    };
    zed::set_language_server_installation_status(id, &status);
    result
}

fn write(path: &str, content: &str) -> Result<()> {
    if fs::read_to_string(path).ok().as_deref() == Some(content) {
        return Ok(());
    }
    fs::write(path, content)
        .map_err(|error| format!("Cannot write managed Cucumber {path}: {error}"))
}

fn ensure_installed(npm: &impl Packages) -> Result<()> {
    let manifest: Manifest = serde_json::from_str(MANIFEST)
        .map_err(|error| format!("Invalid managed Cucumber manifest: {error}"))?;
    for (package, version) in manifest.dependencies {
        let ready = || -> Result<bool> {
            Ok(
                npm.installed_version(&package)?.as_deref() == Some(&version)
                    && npm.complete(&package),
            )
        };
        if !ready()? {
            npm.install(&package, &version)
                .map_err(|error| format!("Cannot install managed {package}@{version}: {error}"))?;
            if !ready()? {
                return Err(format!(
                    "Managed {package}@{version} is incomplete after installation"
                ));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "managed_tests.rs"]
mod tests;
