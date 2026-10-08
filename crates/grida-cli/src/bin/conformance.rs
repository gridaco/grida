// GRIDA-SEC-013 / GRIDA-SEC-014 — fixture-only parsing/input reads, never host dispatch.
use std::io::{self, BufRead, Read, Write};
use std::process::ExitCode;

use grida_cli::{Command, GenerationSource, Topic, input};
use serde_json::{Value, json};
use tokio_util::sync::CancellationToken;

const MAX_LINE: u64 = 1024 * 1024;

fn topics() -> Value {
    Value::Array(
        Topic::ALL
            .iter()
            .map(|topic| json!({"name": topic.name(), "help": topic.help(), "docs_url": topic.docs_url()}))
            .collect(),
    )
}

async fn validate_example(argv: &[String]) -> Value {
    let invocation = match grida_cli::parse(argv) {
        Ok(invocation) => invocation,
        Err(error) => {
            return json!({"error": {"code": error.code.as_str(), "message": error.message}});
        }
    };
    let mut result = json!({"invocation": grida_cli::conformance::project(&invocation)});
    let catalog = grida_ai::Catalog::bundled();
    let checked = async {
        match &invocation.command {
            Command::ModelsInspect(model) => {
                result["descriptor"] = input::inspect(&catalog, model, None)?;
            }
            Command::Generate { model, source, .. } => {
                // This one-shot documentation mode has no stdin fixture. Never
                // compete with the parser protocol or wait for ambient input.
                let reads_stdin = match source {
                    GenerationSource::Json(value) => value == "-",
                    GenerationSource::Flags(request) => {
                        request.prompt_file.as_deref() == Some("-")
                            || request.text_file.as_deref() == Some("-")
                    }
                };
                if reads_stdin {
                    return Err(grida_cli::error::Error::usage(
                        "Documentation examples require named input files instead of stdin.",
                    ));
                }
                let descriptor = input::inspect(&catalog, model, Some(source))?;
                let value = input::read(&descriptor, source, &CancellationToken::new()).await?;
                catalog.parse_input(&input::selector(&descriptor), value)?;
                result["descriptor"] = descriptor;
                result["input_validated"] = json!(true);
            }
            // Auth, credential and other commands are grammar checks only.
            // No Host, runtime, network transport or output reservation exists.
            _ => {}
        }
        Ok::<(), grida_cli::error::Error>(())
    }
    .await;
    match checked {
        Ok(()) => result,
        Err(error) => json!({"error": error.value}),
    }
}

fn response(line: &[u8]) -> Value {
    let record = serde_json::from_slice::<Value>(line).ok();
    let argv = record
        .as_ref()
        .and_then(Value::as_object)
        .filter(|record| record.len() == 1)
        .and_then(|record| record.get("argv"))
        .and_then(Value::as_array)
        .and_then(|argv| {
            argv.iter()
                .map(|value| value.as_str().map(str::to_owned))
                .collect::<Option<Vec<_>>>()
        });
    let Some(argv) = argv else {
        return json!({"error": {"code": "invalid_request", "message": "Invalid conformance request."}});
    };
    match grida_cli::parse(&argv) {
        Ok(invocation) => json!({"invocation": grida_cli::conformance::project(&invocation)}),
        Err(error) => json!({"error": {"code": error.code.as_str(), "message": error.message}}),
    }
}

fn serve(mut input: impl BufRead, mut output: impl Write) -> io::Result<()> {
    loop {
        let mut line = Vec::new();
        let count = (&mut input)
            .take(MAX_LINE + 2)
            .read_until(b'\n', &mut line)?;
        if count == 0 {
            return Ok(());
        }
        if line.last() == Some(&b'\n') {
            line.pop();
        }
        if line.last() == Some(&b'\r') {
            line.pop();
        }
        if line.len() as u64 > MAX_LINE {
            writeln!(
                output,
                "{}",
                json!({"error": {"code": "invalid_request", "message": "Invalid conformance request."}})
            )?;
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "record too large",
            ));
        }
        writeln!(output, "{}", response(&line))?;
        output.flush()?;
    }
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if !args.is_empty() {
        let value = match args.as_slice() {
            [mode] if mode == "--topics" => topics(),
            [mode, argv @ ..] if mode == "--validate-example" => {
                let Ok(runtime) = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                else {
                    return ExitCode::FAILURE;
                };
                runtime.block_on(validate_example(argv))
            }
            _ => return ExitCode::FAILURE,
        };
        return match writeln!(io::stdout().lock(), "{value}") {
            Ok(()) => ExitCode::SUCCESS,
            Err(_) => ExitCode::FAILURE,
        };
    }
    match serve(io::stdin().lock(), io::stdout().lock()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(_) => ExitCode::FAILURE,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn responses(input: &[u8]) -> (io::Result<()>, Vec<Value>) {
        let mut output = Vec::new();
        let status = serve(Cursor::new(input), &mut output);
        let values = output
            .split(|byte| *byte == b'\n')
            .filter(|line| !line.is_empty())
            .map(|line| serde_json::from_slice(line).unwrap())
            .collect();
        (status, values)
    }

    fn argv(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).into()).collect()
    }

    #[tokio::test]
    async fn documentation_validates_real_file_inputs_without_output_or_credentials() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("request.json");
        let output = directory.path().join("output");
        std::fs::write(
            &source,
            r#"{"prompt":"synthetic-private-prompt","size":"1536x864"}"#,
        )
        .unwrap();
        let request = argv(&[
            "ai",
            "generate",
            "--provider",
            "openrouter",
            "--model",
            "openai/gpt-image-2",
            "--input",
            &format!("@{}", source.display()),
            "--out",
            output.to_str().unwrap(),
            "--key-stdin",
        ]);
        let valid = validate_example(&request).await;
        assert_eq!(valid["input_validated"], true, "{valid}");
        assert_eq!(valid["descriptor"]["provider_id"], "openrouter");
        assert!(!valid.to_string().contains("synthetic-private-prompt"));
        assert!(!output.exists());
        std::fs::write(&source, r#"{"prompt":false}"#).unwrap();
        assert_eq!(
            validate_example(&request).await["error"]["code"],
            "invalid_input"
        );
        std::fs::remove_file(&source).unwrap();
        assert_eq!(
            validate_example(&request).await["error"]["code"],
            "input_unavailable"
        );
        assert!(!output.exists());
    }

    #[tokio::test]
    async fn documentation_uses_schema_guided_scalar_and_image_lowering() {
        let image = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../fixtures/images/checker.png"
        );
        let mut request = argv(&[
            "ai",
            "generate",
            "--provider",
            "openrouter",
            "--model",
            "openai/gpt-image-2",
            "--prompt",
            "synthetic",
            "--reference",
            image,
            "--out",
            "/unused/output",
            "--param",
            "size=1536x864",
        ]);
        let valid = validate_example(&request).await;
        assert_eq!(valid["input_validated"], true, "{valid}");
        assert_eq!(valid["descriptor"]["variant"], "references");
        *request.last_mut().unwrap() = "size=not-a-supported-size".into();
        assert_eq!(
            validate_example(&request).await["error"]["code"],
            "invalid_input"
        );
        *request.last_mut().unwrap() = "unknown=untrusted".into();
        assert_eq!(
            validate_example(&request).await["error"]["code"],
            "invalid_usage"
        );
    }

    #[tokio::test]
    async fn documentation_never_dispatches_account_commands_or_reads_stdin() {
        for (request, command) in [
            (argv(&["auth", "login"]), "auth login"),
            (
                argv(&[
                    "ai",
                    "providers",
                    "configure",
                    "fal",
                    "--key-stdin",
                    "--no-input",
                ]),
                "ai providers configure",
            ),
            (
                argv(&["account", "credits", "--org", "synthetic"]),
                "account credits",
            ),
        ] {
            let result = validate_example(&request).await;
            assert_eq!(result["invocation"]["command"], command, "{result}");
            assert!(result.get("descriptor").is_none());
            assert!(result.get("input_validated").is_none());
        }
        for flag in ["--input", "--prompt-file"] {
            let result = validate_example(&argv(&[
                "ai",
                "generate",
                "--provider",
                "openrouter",
                "--model",
                "openai/gpt-image-2",
                flag,
                "-",
                "--out",
                "/unused/output",
            ]))
            .await;
            assert_eq!(result["error"]["code"], "invalid_usage");
        }
        assert_eq!(
            validate_example(&argv(&["unknown-command"])).await["error"]["code"],
            "invalid_usage"
        );
    }

    #[test]
    fn framing_supports_multiple_records_and_final_unterminated_line() {
        let (status, output) =
            responses(b"{\"argv\":[\"--version\"]}\r\n{\"argv\":[\"docs\",\"auth\"]}");
        status.unwrap();
        assert_eq!(output.len(), 2);
        assert_eq!(output[0]["invocation"]["command"], "version");
        assert_eq!(output[1]["invocation"]["topic"], "auth");
    }

    #[test]
    fn malformed_records_are_rejected_without_dispatch_or_echo() {
        let (status, output) = responses(b"{\"argv\":[],\"operation\":\"secret\"}\n{\"argv\":[1]}\n[]\nsecret\n{\"argv\":[\"auth\",\"login\"]}\n");
        status.unwrap();
        let invalid = json!({"error": {"code": "invalid_request", "message": "Invalid conformance request."}});
        assert_eq!(
            output[..4],
            [invalid.clone(), invalid.clone(), invalid.clone(), invalid]
        );
        assert_eq!(output[4]["invocation"]["command"], "auth login");
        assert!(!serde_json::to_string(&output).unwrap().contains("secret"));
    }

    #[test]
    fn byte_bound_excludes_line_endings_and_stops_oversized_stream() {
        let mut line = b"{\"argv\":[]}".to_vec();
        line.resize(MAX_LINE as usize, b' ');
        line.extend_from_slice(b"\r\n");
        let (status, output) = responses(&line);
        status.unwrap();
        assert_eq!(output[0]["invocation"]["command"], "help");
        line.truncate(MAX_LINE as usize);
        line.extend_from_slice(b" \n{\"argv\":[]}\n");
        let (status, output) = responses(&line);
        assert_eq!(status.unwrap_err().kind(), io::ErrorKind::InvalidData);
        assert_eq!(output.len(), 1);
        assert_eq!(output[0]["error"]["code"], "invalid_request");
    }
}
