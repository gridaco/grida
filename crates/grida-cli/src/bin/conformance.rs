use std::io::{self, BufRead, Read, Write};
use std::process::ExitCode;

use serde_json::{Value, json};

const MAX_LINE: u64 = 1024 * 1024;

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
