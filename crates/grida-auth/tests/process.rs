//! GRIDA-SEC-014 — real process writers and crash-released SQLite authority.
#![cfg(unix)]
use grida_auth::ProviderStore;
use std::{
    fs,
    path::PathBuf,
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};

fn child(home: &std::path::Path, operation: &str) -> Child {
    Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "process_worker", "--nocapture"])
        .env("GRIDA_AUTH_TEST_HOME", home)
        .env("GRIDA_AUTH_TEST_OPERATION", operation)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap()
}
fn await_file(path: &std::path::Path) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while !path.exists() {
        assert!(Instant::now() < deadline, "child handshake timed out");
        std::thread::sleep(Duration::from_millis(10));
    }
}
#[test]
fn process_worker() {
    let Some(home) = std::env::var_os("GRIDA_AUTH_TEST_HOME") else {
        return;
    };
    let home = PathBuf::from(home);
    let operation = std::env::var("GRIDA_AUTH_TEST_OPERATION").unwrap();
    let store = ProviderStore::new(home.clone()).unwrap();
    if operation == "hold" {
        store
            .migrate(
                || {
                    fs::write(home.join("acquired"), b"ready").unwrap();
                    loop {
                        std::thread::sleep(Duration::from_secs(1));
                    }
                },
                || Ok(()),
            )
            .unwrap();
    } else {
        fs::write(home.join(format!("started-{operation}")), b"ready").unwrap();
        store.set(&operation, "synthetic-process-key").unwrap();
        fs::write(home.join(format!("finished-{operation}")), b"done").unwrap();
    }
}
#[test]
fn independent_writers_preserve_each_other() {
    let temp = tempfile::tempdir().unwrap();
    let home = fs::canonicalize(temp.path()).unwrap();
    let mut first = child(&home, "first");
    let mut second = child(&home, "second");
    assert!(first.wait().unwrap().success());
    assert!(second.wait().unwrap().success());
    let store = ProviderStore::new(home).unwrap();
    assert_eq!(store.list().unwrap().len(), 2);
}
#[test]
fn killed_holder_releases_lock_without_stealing_or_erasing_it() {
    let temp = tempfile::tempdir().unwrap();
    let home = fs::canonicalize(temp.path()).unwrap();
    let mut holder = child(&home, "hold");
    await_file(&home.join("acquired"));
    let filename = home.join("providers/profile.lock.sqlite");
    use std::os::unix::fs::MetadataExt;
    let inode = fs::metadata(&filename).unwrap().ino();
    let mut waiter = child(&home, "waiter");
    await_file(&home.join("started-waiter"));
    std::thread::sleep(Duration::from_millis(150));
    assert!(!home.join("finished-waiter").exists());
    holder.kill().unwrap();
    holder.wait().unwrap();
    assert!(waiter.wait().unwrap().success());
    let meta = fs::metadata(filename).unwrap();
    assert_eq!(meta.ino(), inode);
    assert_eq!(meta.len(), 0);
    assert_eq!(
        ProviderStore::new(home)
            .unwrap()
            .read("waiter")
            .unwrap()
            .as_deref(),
        Some("synthetic-process-key")
    );
}
