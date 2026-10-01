// GRIDA-SEC-010 / GRIDA-SEC-013 / GRIDA-SEC-014 — static admission precedes host authority.
use grida_cli::{Command, Failure, output, parse, runtime};
use std::io::{self, Write};
use std::process::ExitCode;
fn run() -> io::Result<u8> {
    let argv: Vec<_> = std::env::args_os().skip(1).collect();
    let json = argv.iter().any(|v| v == "--json");
    let argv: Result<Vec<_>, _> = argv.into_iter().map(|v| v.into_string()).collect();
    let invocation = argv
        .map_err(|_| Failure::usage())
        .and_then(|argv| parse(&argv));
    let invocation = match invocation {
        Ok(v) => v,
        Err(e) => {
            return output::failure(e, json, &mut io::stdout().lock(), &mut io::stderr().lock());
        }
    };
    if matches!(
        invocation.command,
        Command::Help(_) | Command::Version | Command::Docs(_)
    ) {
        return output::dispatch(
            invocation,
            &mut io::stdout().lock(),
            &mut io::stderr().lock(),
        );
    }
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;
    let result = runtime.block_on(runtime::run(invocation));
    let mut stdout = io::stdout().lock();
    let mut stderr = io::stderr().lock();
    let exit = match result {
        Ok(value) => output::result(&value, json, &mut stdout)?,
        Err(error) => output::domain_failure(error, json, &mut stdout, &mut stderr)?,
    };
    stdout.flush()?;
    stderr.flush()?;
    Ok(exit)
}
fn main() -> ExitCode {
    ExitCode::from(run().unwrap_or(1))
}
