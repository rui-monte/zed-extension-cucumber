use zed_extension_api::{serde_json, Result};

pub fn custom_path(path: &str, root: &str, env: &[(String, String)]) -> Result<String> {
    if path.trim().is_empty() {
        return Err("`lsp.cucumber.binary.path` must not be empty".into());
    }
    let path = path.replace('\\', "/");
    if let Some(suffix) = path.strip_prefix("~/") {
        let home = env
            .iter()
            .find(|(key, value)| (key == "HOME" || key == "USERPROFILE") && !value.is_empty())
            .map(|(_, value)| value.replace('\\', "/"))
            .ok_or("Cannot expand `~` in the Cucumber binary path: no home directory")?;
        return Ok(format!("{}/{suffix}", home.trim_end_matches('/')));
    }
    if path.starts_with('/') || path.as_bytes().get(1..3) == Some(b":/") || !path.contains('/') {
        return Ok(path);
    }
    Ok(format!(
        "{}/{path}",
        root.replace('\\', "/").trim_end_matches('/')
    ))
}

pub fn workspace_configuration(settings: Option<serde_json::Value>) -> Result<serde_json::Value> {
    let settings = settings
        .filter(|value| !value.is_null())
        .unwrap_or_else(|| serde_json::json!({}));
    if !settings.is_object() {
        return Err(
            "`lsp.cucumber.settings` must be an object containing Cucumber settings".into(),
        );
    }
    Ok(serde_json::json!({ "cucumber": settings }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn resolves_custom_binaries_without_probing_project_files() {
        let env = vec![("HOME".into(), "/Users/test person".into())];
        assert_eq!(
            custom_path("~/bin/cucumber", "/project", &env).unwrap(),
            "/Users/test person/bin/cucumber"
        );
        assert_eq!(
            custom_path(
                "./node_modules/.bin/cucumber-language-server",
                "/project/",
                &env
            )
            .unwrap(),
            "/project/./node_modules/.bin/cucumber-language-server"
        );
        assert_eq!(
            custom_path("cucumber-language-server", "/project", &env).unwrap(),
            "cucumber-language-server"
        );
        assert_eq!(
            custom_path(r"C:\tools\cucumber.cmd", "/project", &env).unwrap(),
            "C:/tools/cucumber.cmd"
        );
        assert!(custom_path(" ", "/project", &env).is_err());
        assert!(custom_path("~/bin/cucumber", "/project", &[]).is_err());
    }

    #[test]
    fn preserves_upstream_settings_and_defaults() {
        let settings = json!({"glue": ["steps/**/*.ts"], "parameterTypes": [{"name": "actor", "regexp": "[A-Z]+"}], "snippetTemplates": {"javascript": "custom template"}});
        assert_eq!(
            workspace_configuration(Some(settings.clone())).unwrap(),
            json!({"cucumber": settings})
        );
        assert_eq!(
            workspace_configuration(None).unwrap(),
            json!({"cucumber": {}})
        );
        assert_eq!(
            workspace_configuration(Some(json!(null))).unwrap(),
            json!({"cucumber": {}})
        );
        assert!(workspace_configuration(Some(json!([]))).is_err());
    }
}
