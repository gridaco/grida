//! `grida_editor` — the windowed reference-editor shell (feature
//! `shell`; see `crates/grida_editor/docs/shell.md`).
//!
//! Usage: `grida_editor [file.grida] [--open <path>] [--listen <port>]
//! [--join <addr>]` — opens the given document (or a built-in demo
//! scene), optionally hosting (`--listen`, the sync authority) or
//! joining (`--join`) a two-instance session. All logic lives in
//! `grida_editor::shell`; this file only parses argv.

fn main() {
    let mut options = grida_editor::shell::ShellOptions::default();
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--open" => match args.next() {
                Some(path) => options.open = Some(path),
                None => usage("--open requires a path"),
            },
            "--listen" => match args.next().and_then(|p| p.parse().ok()) {
                Some(port) => options.listen = Some(port),
                None => usage("--listen requires a port number"),
            },
            "--join" => match args.next() {
                Some(addr) => options.join = Some(addr),
                None => usage("--join requires an address (host:port)"),
            },
            path if !path.starts_with('-') && options.open.is_none() => {
                options.open = Some(path.to_string());
            }
            other => usage(&format!("unknown argument {other:?}")),
        }
    }
    if let Err(e) = grida_editor::shell::run_with(options) {
        eprintln!("grida_editor: {e}");
        std::process::exit(1);
    }
}

fn usage(problem: &str) -> ! {
    eprintln!(
        "grida_editor: {problem}\nusage: grida_editor [file.grida] [--open <path>] [--listen <port>] [--join <addr>]"
    );
    std::process::exit(2);
}
