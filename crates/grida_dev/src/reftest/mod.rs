//! Reftest harness — one CLI surface for everything you do with
//! the SVG reftest corpus.
//!
//! Subcommands
//! -----------
//! - [`run`](runner) — render each fixture, score against
//!   `expected.png` (and against the baked `chrome.png` when
//!   present), write `report.json`.
//! - [`bake`](bake) — drive puppeteer to pre-render Chrome PNGs into
//!   `<suite>/chrome-baseline/`. One-time, deterministic per Chrome
//!   version.
//! - [`view`](view) — serve the dashboard against a result dir.
//! - [`inspect`](inspect) — print everything the system knows about
//!   one fixture (oracle flags, scores, image paths, SVG source).
//! - [`summary`](summary) — print the headline parity numbers from
//!   a `report.json`. `--json` for orchestration.

pub(crate) mod args;
pub(crate) mod bake;
pub(crate) mod compare;
pub(crate) mod config;
pub(crate) mod inspect;
pub(crate) mod oracles;
pub(crate) mod render;
pub(crate) mod report;
pub(crate) mod runner;
pub(crate) mod summary;
pub(crate) mod view;

pub(crate) use args::ReftestArgs;

use anyhow::Result;

pub(crate) async fn run(args: ReftestArgs) -> Result<()> {
    match args.command {
        args::ReftestCmd::Run(a) => runner::run(a).await,
        args::ReftestCmd::Bake(a) => bake::run(a).await,
        args::ReftestCmd::View(a) => view::run(a).await,
        args::ReftestCmd::Inspect(a) => inspect::run(a),
        args::ReftestCmd::Summary(a) => summary::run(a),
    }
}
