// GRIDA-SEC-010 / GRIDA-SEC-013 — fixed safe errors and escaped terminal text.
use std::io::{self, Write};

use serde_json::json;
use unicode_general_category::{GeneralCategory, get_general_category};

use crate::{Command, Failure, Invocation};

/// Replace terminal controls without modifying printable account-controlled text.
pub fn terminal_text(value: &str) -> String {
    value
        .chars()
        .map(|character| match get_general_category(character) {
            GeneralCategory::Control
            | GeneralCategory::Format
            | GeneralCategory::LineSeparator
            | GeneralCategory::ParagraphSeparator => '\u{fffd}',
            _ => character,
        })
        .collect()
}

pub fn failure(
    error: Failure,
    json_mode: bool,
    stdout: &mut impl Write,
    stderr: &mut impl Write,
) -> io::Result<u8> {
    if json_mode {
        writeln!(
            stdout,
            "{}",
            json!({"error": {"code": error.code.as_str(), "message": error.message}})
        )?;
    } else {
        writeln!(
            stderr,
            "grida: {} ({})",
            terminal_text(error.message),
            error.code.as_str()
        )?;
    }
    Ok(error.code.exit_code())
}

/// Static commands are handled without initializing the asynchronous host.
pub fn dispatch(
    invocation: Invocation,
    stdout: &mut impl Write,
    _stderr: &mut impl Write,
) -> io::Result<u8> {
    match invocation.command {
        Command::Help(topic) => stdout.write_all(topic.help().as_bytes())?,
        Command::Version => writeln!(stdout, "grida {}", env!("CARGO_PKG_VERSION"))?,
        Command::Docs(topic) => writeln!(stdout, "{}", topic.docs_url())?,
        _ => {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "offline command required",
            ));
        }
    }
    Ok(0)
}

pub fn result(
    value: &crate::runtime::Output,
    json_mode: bool,
    stdout: &mut impl Write,
) -> io::Result<u8> {
    if json_mode {
        writeln!(stdout, "{}", value.value)?;
    } else {
        writeln!(
            stdout,
            "{}",
            value
                .lines
                .iter()
                .map(|l| terminal_text(l))
                .collect::<Vec<_>>()
                .join("\n")
        )?;
    }
    Ok(value.exit)
}
pub fn domain_failure(
    error: crate::error::Error,
    json_mode: bool,
    stdout: &mut impl Write,
    stderr: &mut impl Write,
) -> io::Result<u8> {
    if json_mode {
        writeln!(stdout, "{}", json!({"error":error.value}))?;
    } else {
        let e = &error.value;
        let safe = |k: &str| terminal_text(e[k].as_str().unwrap_or(""));
        writeln!(stderr, "grida: {} ({})", safe("message"), safe("code"))?;
        for (key, label) in [("task_id", "Task"), ("directory", "Output")] {
            if e[key].is_string() {
                writeln!(stderr, "  {label}: {}", safe(key))?;
            }
        }
        if let Some(saved) = e["saved"].as_array() {
            for a in saved {
                writeln!(
                    stderr,
                    "  Saved: {}",
                    terminal_text(a["path"].as_str().unwrap_or(""))
                )?;
            }
        }
        if let Some(choices) = e["choices"].as_array() {
            for c in choices {
                writeln!(
                    stderr,
                    "  {} (ID {})",
                    terminal_text(c["name"].as_str().unwrap_or("")),
                    c["id"]
                )?;
            }
        }
        if e["choices_truncated"] == true {
            writeln!(
                stderr,
                "  More organizations are available; run grida account view."
            )?;
        }
    }
    Ok(error.exit)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Options, Topic};

    struct BrokenPipe;
    impl Write for BrokenPipe {
        fn write(&mut self, _: &[u8]) -> io::Result<usize> {
            Err(io::ErrorKind::BrokenPipe.into())
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    #[test]
    fn broken_pipe_is_returned_without_secondary_output() {
        for command in [
            Command::Help(Topic::Root),
            Command::Version,
            Command::Docs(Topic::Auth),
        ] {
            let invocation = Invocation {
                options: Options {
                    json: false,
                    no_input: false,
                },
                command,
            };
            let mut stderr = Vec::new();
            assert_eq!(
                dispatch(invocation, &mut BrokenPipe, &mut stderr)
                    .unwrap_err()
                    .kind(),
                io::ErrorKind::BrokenPipe
            );
            assert!(stderr.is_empty());
        }
        assert_eq!(
            failure(Failure::usage(), true, &mut BrokenPipe, &mut Vec::new())
                .unwrap_err()
                .kind(),
            io::ErrorKind::BrokenPipe
        );
        assert_eq!(
            failure(Failure::usage(), false, &mut Vec::new(), &mut BrokenPipe)
                .unwrap_err()
                .kind(),
            io::ErrorKind::BrokenPipe
        );
    }

    #[test]
    fn terminal_controls_are_escaped_across_unicode_categories() {
        assert_eq!(
            terminal_text("雪 é\n\u{1b}\u{7f}\u{85}\u{200b}\u{202e}\u{2028}\u{2029}"),
            "雪 é��������"
        );
    }

    #[test]
    fn usage_failure_channel_is_explicit() {
        let (mut stdout, mut stderr) = (Vec::new(), Vec::new());
        assert_eq!(
            failure(Failure::usage(), true, &mut stdout, &mut stderr).unwrap(),
            2
        );
        assert!(stderr.is_empty());
        let value: serde_json::Value = serde_json::from_slice(&stdout).unwrap();
        assert_eq!(value["error"]["code"], "invalid_usage");
    }
}
