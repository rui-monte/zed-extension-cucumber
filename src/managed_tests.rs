use super::*;
use std::cell::{Cell, RefCell};

#[derive(Default)]
struct FakePackages {
    versions: RefCell<BTreeMap<String, String>>,
    incomplete: RefCell<Vec<String>>,
    installs: RefCell<Vec<String>>,
    offline: Cell<bool>,
    broken_install: Cell<bool>,
}

impl Packages for FakePackages {
    fn installed_version(&self, package: &str) -> Result<Option<String>> {
        Ok(self.versions.borrow().get(package).cloned())
    }
    fn complete(&self, package: &str) -> bool {
        !self
            .incomplete
            .borrow()
            .iter()
            .any(|value| value == package)
    }
    fn install(&self, package: &str, version: &str) -> Result<()> {
        self.installs
            .borrow_mut()
            .push(format!("{package}@{version}"));
        if self.offline.get() {
            return Err("offline".into());
        }
        if !self.broken_install.get() {
            self.versions
                .borrow_mut()
                .insert(package.into(), version.into());
            self.incomplete
                .borrow_mut()
                .retain(|value| value != package);
        }
        Ok(())
    }
}

#[test]
fn installs_the_pinned_stack_and_reuses_it_offline() {
    let npm = FakePackages::default();
    ensure_installed(&npm).unwrap();
    assert_eq!(
        *npm.installs.borrow(),
        [
            "@cucumber/language-server@1.7.0",
            "@cucumber/language-service@1.7.0"
        ]
    );
    npm.installs.borrow_mut().clear();
    npm.offline.set(true);
    ensure_installed(&npm).unwrap();
    assert!(npm.installs.borrow().is_empty());
}

#[test]
fn repairs_missing_parser_assets_and_retries_failed_installs() {
    let npm = FakePackages::default();
    ensure_installed(&npm).unwrap();
    npm.installs.borrow_mut().clear();
    npm.incomplete
        .borrow_mut()
        .push("@cucumber/language-service".into());
    npm.offline.set(true);
    assert!(ensure_installed(&npm).unwrap_err().contains("offline"));
    npm.offline.set(false);
    ensure_installed(&npm).unwrap();
    assert!(npm.incomplete.borrow().is_empty());
    assert_eq!(npm.installs.borrow().len(), 2);
}

#[test]
fn refuses_a_stale_or_incomplete_stack() {
    let npm = FakePackages::default();
    npm.versions
        .borrow_mut()
        .insert("@cucumber/language-server".into(), "0.0.1".into());
    npm.offline.set(true);
    assert!(ensure_installed(&npm).is_err());
    npm.offline.set(false);
    npm.broken_install.set(true);
    assert!(ensure_installed(&npm)
        .unwrap_err()
        .contains("incomplete after installation"));
}
