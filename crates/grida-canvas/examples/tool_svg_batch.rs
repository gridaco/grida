//! Batch SVG pack/optimize tester.
//!
//! Walks a directory (recursively) for `.svg` files and runs `svg_pack` and
//! `svg_optimize` on each one, reporting pass/fail with error details.
//!
//! ## Usage
//!
//! ```bash
//! # Test built-in fixtures
//! cargo run --example tool_svg_batch
//!
//! # Test a custom directory (e.g. a large corpus of AI-generated SVGs)
//! cargo run --example tool_svg_batch -- /path/to/svgs
//!
//! # Verbose output: print IR summary for each file
//! cargo run --example tool_svg_batch -- --verbose
//!
//! # Test both a custom dir and built-in fixtures
//! cargo run --example tool_svg_batch -- --verbose /path/to/svgs
//! ```

use std::{
    fs,
    path::{Path, PathBuf},
    time::Instant,
};

use clap::Parser;

use cg::io::io_svg::{svg_optimize, svg_pack};
use cg::svg::SVGPackedScene;

#[derive(Parser, Debug)]
#[command(
    author,
    version,
    about = "Batch-test SVG pack and optimize on a directory of .svg files."
)]
struct Cli {
    /// Directory of SVGs to test. If omitted, uses built-in `assets/svg/`.
    path: Option<PathBuf>,

    /// Print IR summary for each successful pack.
    #[arg(long, short)]
    verbose: bool,

    /// Skip `svg_optimize` test.
    #[arg(long)]
    no_optimize: bool,

    /// Also test `svg_pack` on each file (the main pipeline).
    #[arg(long, default_value_t = true)]
    test_pack: bool,
}

fn main() {
    let cli = Cli::parse();

    let default_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets/svg");
    let dir = cli.path.as_deref().unwrap_or(&default_dir);

    if !dir.is_dir() {
        eprintln!("Error: {} is not a directory", dir.display());
        std::process::exit(1);
    }

    let svg_files = collect_svg_files(dir);
    if svg_files.is_empty() {
        eprintln!("No .svg files found in {}", dir.display());
        std::process::exit(1);
    }

    println!(
        "=== SVG Batch Test: {} files in {} ===\n",
        svg_files.len(),
        dir.display()
    );

    let mut results = Vec::new();

    for path in &svg_files {
        let rel = path.strip_prefix(dir).unwrap_or(path);
        let source = match fs::read_to_string(path) {
            Ok(s) => s,
            Err(err) => {
                let r = FileResult {
                    path: rel.to_path_buf(),
                    read_error: Some(err.to_string()),
                    optimize: None,
                    pack: None,
                };
                print_result(&r, cli.verbose);
                results.push(r);
                continue;
            }
        };

        let optimize = if !cli.no_optimize {
            Some(test_optimize(&source))
        } else {
            None
        };

        let pack = if cli.test_pack {
            Some(test_pack(&source, cli.verbose))
        } else {
            None
        };

        let r = FileResult {
            path: rel.to_path_buf(),
            read_error: None,
            optimize,
            pack,
        };
        print_result(&r, cli.verbose);
        results.push(r);
    }

    // Summary
    println!("\n=== Summary ===");
    let total = results.len();
    let read_errors = results.iter().filter(|r| r.read_error.is_some()).count();
    let optimize_pass = results
        .iter()
        .filter(|r| matches!(&r.optimize, Some(StepResult::Ok { .. })))
        .count();
    let optimize_fail = results
        .iter()
        .filter(|r| matches!(&r.optimize, Some(StepResult::Err { .. })))
        .count();
    let pack_pass = results
        .iter()
        .filter(|r| matches!(&r.pack, Some(StepResult::Ok { .. })))
        .count();
    let pack_fail = results
        .iter()
        .filter(|r| matches!(&r.pack, Some(StepResult::Err { .. })))
        .count();

    println!("  Total files:      {}", total);
    if read_errors > 0 {
        println!("  Read errors:      {}", read_errors);
    }
    println!(
        "  optimize:         {} pass / {} fail",
        optimize_pass, optimize_fail
    );
    println!(
        "  pack:             {} pass / {} fail",
        pack_pass, pack_fail
    );

    if pack_fail > 0 || optimize_fail > 0 {
        println!("\n--- Failures ---");
        for r in &results {
            if let Some(StepResult::Err { error, .. }) = &r.optimize {
                println!("  FAIL optimize  {}  => {}", r.path.display(), error);
            }
            if let Some(StepResult::Err { error, .. }) = &r.pack {
                println!("  FAIL pack      {}  => {}", r.path.display(), error);
            }
        }
        std::process::exit(1);
    } else {
        println!("\nAll tests passed.");
    }
}

struct FileResult {
    path: PathBuf,
    read_error: Option<String>,
    optimize: Option<StepResult>,
    pack: Option<StepResult>,
}

enum StepResult {
    Ok {
        _elapsed_ms: f64,
        info: String,
    },
    Err {
        _elapsed_ms: f64,
        error: String,
    },
}

fn test_optimize(source: &str) -> StepResult {
    let start = Instant::now();
    match svg_optimize(source) {
        Ok(optimized) => {
            let elapsed = start.elapsed().as_secs_f64() * 1000.0;
            StepResult::Ok {
                _elapsed_ms: elapsed,
                info: format!("{} bytes", optimized.len()),
            }
        }
        Err(err) => {
            let elapsed = start.elapsed().as_secs_f64() * 1000.0;
            StepResult::Err {
                _elapsed_ms: elapsed,
                error: err,
            }
        }
    }
}

fn test_pack(source: &str, verbose: bool) -> StepResult {
    let start = Instant::now();
    match svg_pack(source) {
        Ok(json) => {
            let elapsed = start.elapsed().as_secs_f64() * 1000.0;
            // Parse back to get stats
            let info = match serde_json::from_str::<SVGPackedScene>(&json) {
                Ok(scene) => {
                    let stats = count_ir_nodes(&scene);
                    if verbose {
                        format!(
                            "{}x{} | {} groups, {} paths, {} texts | {:.1}ms",
                            scene.svg.width, scene.svg.height,
                            stats.groups, stats.paths, stats.texts,
                            elapsed,
                        )
                    } else {
                        format!(
                            "{}x{} nodes={} {:.1}ms",
                            scene.svg.width,
                            scene.svg.height,
                            stats.total,
                            elapsed,
                        )
                    }
                }
                Err(err) => format!("packed but failed to deserialize: {}", err),
            };
            StepResult::Ok {
                _elapsed_ms: elapsed,
                info,
            }
        }
        Err(err) => {
            let elapsed = start.elapsed().as_secs_f64() * 1000.0;
            StepResult::Err {
                _elapsed_ms: elapsed,
                error: err,
            }
        }
    }
}

fn print_result(r: &FileResult, verbose: bool) {
    if let Some(ref err) = r.read_error {
        println!("  READ_ERR  {}  => {}", r.path.display(), err);
        return;
    }

    let optimize_str = match &r.optimize {
        Some(StepResult::Ok { info, .. }) => {
            if verbose {
                format!("OK ({})", info)
            } else {
                "OK".to_string()
            }
        }
        Some(StepResult::Err { error, .. }) => format!("FAIL: {}", error),
        None => "-".to_string(),
    };

    let pack_str = match &r.pack {
        Some(StepResult::Ok { info, .. }) => format!("OK ({})", info),
        Some(StepResult::Err { error, .. }) => format!("FAIL: {}", error),
        None => "-".to_string(),
    };

    let status = match (&r.optimize, &r.pack) {
        (Some(StepResult::Err { .. }), _) | (_, Some(StepResult::Err { .. })) => "FAIL",
        _ => "PASS",
    };

    println!(
        "  {} {}  optimize={}  pack={}",
        status,
        r.path.display(),
        optimize_str,
        pack_str
    );
}

fn collect_svg_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    collect_svg_files_recursive(dir, &mut files);
    files.sort();
    files
}

fn collect_svg_files_recursive(dir: &Path, files: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_svg_files_recursive(&path, files);
        } else if path.extension().is_some_and(|ext| ext == "svg") {
            files.push(path);
        }
    }
}

use cg::cg::svg::{IRSVGChildNode, IRSVGInitialContainerNode};

struct IRNodeStats {
    groups: usize,
    paths: usize,
    texts: usize,
    images: usize,
    total: usize,
}

fn count_ir_nodes(scene: &SVGPackedScene) -> IRNodeStats {
    let mut stats = IRNodeStats {
        groups: 0,
        paths: 0,
        texts: 0,
        images: 0,
        total: 0,
    };
    count_children(&scene.svg, &mut stats);
    stats
}

fn count_children(container: &IRSVGInitialContainerNode, stats: &mut IRNodeStats) {
    for child in &container.children {
        count_child(child, stats);
    }
}

fn count_child(node: &IRSVGChildNode, stats: &mut IRNodeStats) {
    stats.total += 1;
    match node {
        IRSVGChildNode::Group(g) => {
            stats.groups += 1;
            for child in &g.children {
                count_child(child, stats);
            }
        }
        IRSVGChildNode::Path(_) => stats.paths += 1,
        IRSVGChildNode::Text(_) => stats.texts += 1,
        IRSVGChildNode::Image(_) => stats.images += 1,
    }
}
