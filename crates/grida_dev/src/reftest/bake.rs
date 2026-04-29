//! `reftest bake` — drive puppeteer to bake Chrome PNGs.
//!
//! `BAKE_ERRORS.log` is written by the underlying mjs script next
//! to the baseline when a fixture errors. We delete it before each
//! run so its presence afterwards unambiguously means "the latest
//! run had errors." `--retry-failed` reads the prior log,
//! regenerates only those fixtures in a single batched node
//! invocation, and exits non-zero if any are still broken.

use anyhow::{bail, Context, Result};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::reftest::args::BakeArgs;

pub(crate) async fn run(args: BakeArgs) -> Result<()> {
    let suite_dir = canonicalize_suite(&args.suite_dir)?;
    let scripts_dir = scripts_dir();
    let mjs = scripts_dir.join("reftest_bake_chrome.mjs");
    if !mjs.exists() {
        bail!(
            "bake script not found at {}; run from the grida repo root",
            mjs.display()
        );
    }
    ensure_puppeteer_installed(&scripts_dir)?;

    let baseline = suite_dir.join("chrome-baseline");
    let errors_log = baseline.join("BAKE_ERRORS.log");

    // `--retry-failed` re-bakes only the fixtures from the prior
    // run's error log, in a single batched node invocation (the
    // script accepts `--paths-from <file>` for exactly this).
    // Avoiding per-fixture process spawn saves the puppeteer launch
    // cost (~1-2s of Chromium startup per invocation) which dominates
    // when you have a handful of bakes to retry.
    if args.retry_failed {
        let to_retry = read_failed_paths(&errors_log)?;
        if to_retry.is_empty() {
            println!(
                "nothing to retry: {} is empty or absent",
                errors_log.display()
            );
            return Ok(());
        }
        println!("retrying {} previously-failed fixtures", to_retry.len());
        let paths_file = baseline.join(".retry-paths.txt");
        fs::create_dir_all(&baseline).ok();
        fs::write(&paths_file, to_retry.join("\n"))
            .with_context(|| format!("failed to write {}", paths_file.display()))?;
        // Wipe the log; only re-created by the script if anything still fails.
        let _ = fs::remove_file(&errors_log);
        let status = invoke_bake_script(
            &mjs,
            &suite_dir,
            BakeFilter::PathsFrom(&paths_file),
            args.concurrency,
            /* force */ true,
        )?;
        let _ = fs::remove_file(&paths_file);
        if !status.success() {
            bail!("bake script exited with status {}", status);
        }
        if errors_log.exists() {
            let still = read_failed_paths(&errors_log)?;
            bail!(
                "{} fixtures still failed after retry; see {}",
                still.len(),
                errors_log.display()
            );
        }
        println!("ok: all {} fixtures re-baked successfully", to_retry.len());
        Ok(())
    } else {
        // Standard bake — let the script handle filtering + concurrency.
        // Clear any stale error log so post-run inspection is unambiguous.
        let _ = fs::remove_file(&errors_log);
        let status = invoke_bake_script(
            &mjs,
            &suite_dir,
            BakeFilter::Substring(args.filter.as_deref()),
            args.concurrency,
            args.force,
        )?;
        if !status.success() {
            bail!("bake script exited with status {}", status);
        }
        if errors_log.exists() {
            let count = read_failed_paths(&errors_log).map(|v| v.len()).unwrap_or(0);
            bail!(
                "{count} fixture(s) failed to bake; see {} (re-run with --retry-failed to retry just those)",
                errors_log.display()
            );
        }
        Ok(())
    }
}

/// Either a substring filter (matches every rel-path containing it)
/// or a path to a newline-delimited list of exact suite-relative
/// paths. The mjs script honors both.
enum BakeFilter<'a> {
    Substring(Option<&'a str>),
    PathsFrom(&'a Path),
}

fn invoke_bake_script(
    mjs: &Path,
    suite_dir: &Path,
    filter: BakeFilter<'_>,
    concurrency: u32,
    force: bool,
) -> Result<std::process::ExitStatus> {
    let mut cmd = Command::new("node");
    cmd.arg(mjs)
        .arg("--suite")
        .arg(suite_dir)
        .arg("--concurrency")
        .arg(concurrency.to_string());
    match filter {
        BakeFilter::Substring(Some(f)) => {
            cmd.arg("--filter").arg(f);
        }
        BakeFilter::Substring(None) => {}
        BakeFilter::PathsFrom(p) => {
            cmd.arg("--paths-from").arg(p);
        }
    }
    if force {
        cmd.arg("--force");
    }
    cmd.status()
        .with_context(|| "failed to spawn `node`; install Node.js to bake Chrome PNGs")
}

fn ensure_puppeteer_installed(scripts_dir: &Path) -> Result<()> {
    let pp = scripts_dir.join("node_modules").join("puppeteer");
    if pp.exists() {
        return Ok(());
    }
    bail!(
        "puppeteer is not installed.\n  Run once:  cd {} && npm install puppeteer\n  Then retry: cargo run -p grida_dev -- reftest bake [...]",
        scripts_dir.display()
    );
}

fn canonicalize_suite(p: &Path) -> Result<PathBuf> {
    if !p.is_dir() {
        bail!("suite directory does not exist: {}", p.display());
    }
    p.canonicalize()
        .with_context(|| format!("failed to canonicalize {}", p.display()))
}

fn scripts_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("scripts")
}

/// Each line of `BAKE_ERRORS.log` is `<rel-path>\t<error>`. We only
/// need the rel path for retry.
fn read_failed_paths(log: &Path) -> Result<Vec<String>> {
    if !log.exists() {
        return Ok(Vec::new());
    }
    let body =
        fs::read_to_string(log).with_context(|| format!("failed to read {}", log.display()))?;
    Ok(body
        .lines()
        .filter_map(|l| l.split_once('\t').map(|(p, _)| p.to_string()))
        .filter(|s| !s.is_empty())
        .collect())
}
