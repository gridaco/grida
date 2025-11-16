pub mod args;
pub mod compare;
pub mod render;
pub mod report;
pub mod runner;

pub use args::ReftestArgs;

use anyhow::Result;

pub async fn run(args: ReftestArgs) -> Result<()> {
    runner::run_reftest(&args).await
}
