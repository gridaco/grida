//! `reftest view` — serve the dashboard against a result directory.
//!
//! Symlinks the dashboard HTML and the suite's `tests/` (so the
//! card's source-SVG fallback works), then runs `python3 -m
//! http.server` in the foreground. Cleans up symlinks on Ctrl-C.

use anyhow::{bail, Context, Result};
use std::path::Path;
use std::process::Command;

use crate::reftest::args::ViewArgs;

pub(crate) async fn run(args: ViewArgs) -> Result<()> {
    let result_dir = args.result_dir;
    if !result_dir.is_dir() {
        bail!("result dir does not exist: {}", result_dir.display());
    }
    if !result_dir.join("report.json").is_file() {
        bail!(
            "no report.json in {} — run `reftest run` first",
            result_dir.display()
        );
    }

    let scripts_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("scripts");
    let dashboard = scripts_dir.join("reftest_dashboard.html");
    if !dashboard.is_file() {
        bail!("dashboard HTML missing: {}", dashboard.display());
    }

    // Try a couple of well-known suite paths for the source-SVG
    // fallback tile. Resolved relative to the repo root inferred
    // from CARGO_MANIFEST_DIR.
    let repo_root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .unwrap_or(Path::new("."));
    let suite_tests = repo_root.join("fixtures/local/resvg-test-suite/tests");

    let dashboard_link = result_dir.join("index.html");
    let tests_link = result_dir.join("tests");
    symlink_force(&dashboard, &dashboard_link)?;
    if suite_tests.is_dir() {
        symlink_force(&suite_tests, &tests_link)?;
    } else {
        eprintln!(
            "warning: suite tests dir not found at {} — source-SVG tile will be empty",
            suite_tests.display()
        );
    }

    println!(
        "→ http://localhost:{}/  (result dir: {})",
        args.port,
        result_dir.display()
    );
    let status = Command::new("python3")
        .arg("-m")
        .arg("http.server")
        .arg(args.port.to_string())
        .arg("--directory")
        .arg(&result_dir)
        .status()
        .with_context(|| "failed to spawn `python3 -m http.server`")?;

    // Best-effort cleanup. http.server is foreground; reaching here
    // means the user Ctrl-C'd or the port was in use.
    let _ = std::fs::remove_file(&dashboard_link);
    let _ = std::fs::remove_file(&tests_link);

    if !status.success() {
        bail!("python3 http.server exited with status {}", status);
    }
    Ok(())
}

#[cfg(unix)]
fn symlink_force(src: &Path, dst: &Path) -> Result<()> {
    use std::os::unix::fs::symlink;
    let _ = std::fs::remove_file(dst);
    symlink(src, dst)
        .with_context(|| format!("failed to symlink {} -> {}", dst.display(), src.display()))
}

#[cfg(windows)]
fn symlink_force(src: &Path, dst: &Path) -> Result<()> {
    use std::os::windows::fs::{symlink_dir, symlink_file};
    let _ = std::fs::remove_file(dst);
    let r = if src.is_dir() {
        symlink_dir(src, dst)
    } else {
        symlink_file(src, dst)
    };
    r.with_context(|| format!("failed to symlink {} -> {}", dst.display(), src.display()))
}
