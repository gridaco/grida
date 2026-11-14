// GRIDA-SEC-010 / GRIDA-SEC-013 / GRIDA-SEC-014 — static admission precedes host authority.
use grida_cli::{Command, Failure, Invocation, agent, output, parse, runtime};
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
    if matches!(invocation.command, Command::Fx) {
        return output::failure(
            Failure::launcher_required(),
            json,
            &mut io::stdout().lock(),
            &mut io::stderr().lock(),
        );
    }
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
    let invocation = match invocation {
        Invocation {
            command: Command::Agent(command),
            ..
        } => {
            return agent_exit(runtime, agent::dispatch(command));
        }
        Invocation {
            command: Command::AgentExternal(command),
            ..
        } => {
            return agent_exit(runtime, agent::dispatch_external(command));
        }
        invocation => invocation,
    };
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

fn agent_exit(
    runtime: tokio::runtime::Runtime,
    action: impl std::future::Future<Output = grida_cli::error::Result<u8>>,
) -> io::Result<u8> {
    let result = runtime.block_on(action);
    runtime.shutdown_timeout(std::time::Duration::from_millis(250));
    match result {
        Ok(exit) => Ok(exit),
        Err(error) => output::domain_failure(
            error,
            false,
            &mut io::stdout().lock(),
            &mut io::stderr().lock(),
        ),
    }
}

fn main() -> ExitCode {
    ExitCode::from(run().unwrap_or(1))
}
