//! GRIDA-SEC-004 — the agent settings file, the one host-state file the file
//! tools reach. Reads are allowed; every write is an approved action.

use super::*;
use crate::configuration::SettingsWrite;

const SUPPORTED: &str = "Supported content: schema_version = 1, and an optional [context] table with max_input_tokens set to a positive integer.";
const APPLIES: &str = "The new settings apply to messages accepted from now on. This turn and work already accepted keep the settings they started with.";

impl FileTools {
    pub(super) fn settings_file(
        &self,
        operation: Operation,
        request: &Request,
        budget: &Budget,
    ) -> Result<ToolOutcome> {
        let authority = self
            .settings
            .as_ref()
            .ok_or_else(|| problem(ErrorKind::Unavailable, "settings_file_unavailable"))?;
        if request.path.as_deref() != Some(Path::new(SETTINGS_PATH)) {
            return Ok(failed_text(
                "settings_path_invalid",
                "The agent-settings directory holds only config.toml.",
            ));
        }
        let access = authority(&budget.invocation)?;
        match operation {
            Operation::Read => {
                let read = access.configuration.read_settings()?;
                let exists = read.bytes.is_some();
                let text = decode(read.bytes.unwrap_or_default())?;
                let status = match (&read.diagnostic, exists, read.applied) {
                    (_, false, _) => format!("config.toml does not exist yet. {SUPPORTED}"),
                    (Some(error), _, _) => format!(
                        "config.toml is invalid ({}) and is not applied. {SUPPORTED}",
                        error.code
                    ),
                    (None, true, true) => {
                        "These settings are active for newly accepted messages.".into()
                    }
                    (None, true, false) => "This content is not active yet. It takes effect when the agent next starts.".into(),
                };
                bounded_outcome(
                    ToolOutcome {
                        status: OutcomeStatus::Succeeded,
                        content: vec![ResultContent::Text(text), ResultContent::Text(status)],
                        structured: None,
                        receipt: None,
                        truncated: false,
                    },
                    budget.output,
                )
            }
            Operation::Write | Operation::Edit => {
                if !access.write {
                    return Err(problem(ErrorKind::Unavailable, "permission_denied"));
                }
                let _serial = self.mutations.lock().map_err(|_| unavailable())?;
                let written = access.configuration.replace_settings(
                    |current| match operation {
                        Operation::Write => {
                            Ok(request.content.clone().unwrap_or_default().into_bytes())
                        }
                        _ => edit(current, request),
                    },
                    || budget.check(),
                );
                match written {
                    Ok(SettingsWrite::Applied) => text_outcome(
                        format!("Saved {SETTINGS_PATH}. {APPLIES}"),
                        false,
                        budget.output,
                    ),
                    Ok(SettingsWrite::Invalid(error)) => Ok(failed_text(
                        &error.code,
                        &format!(
                            "{SETTINGS_PATH} was not changed because the new content is invalid. {SUPPORTED}"
                        ),
                    )),
                    Err(error) if error.code == "edit_no_match" => Ok(failed_text(
                        "edit_no_match",
                        "old_string does not match the current file. Read the file and retry with its exact text.",
                    )),
                    Err(error) if error.code == "edit_ambiguous" => Ok(failed_text(
                        "edit_ambiguous",
                        "old_string matches more than one place. Add surrounding text to make it unique, or set replace_all.",
                    )),
                    Err(error) => Err(error),
                }
            }
            _ => Ok(failed_text(
                "settings_operation_unsupported",
                "Use read_file, write_file, or edit_file with path config.toml.",
            )),
        }
    }
}

fn edit(current: Option<&[u8]>, request: &Request) -> Result<Vec<u8>> {
    let invalid = || problem(ErrorKind::InvalidInput, "file_arguments_invalid");
    let old = request.old_string.as_deref().ok_or_else(invalid)?;
    let new = request.new_string.as_deref().ok_or_else(invalid)?;
    let current = current.ok_or_else(|| problem(ErrorKind::InvalidInput, "file_not_found"))?;
    let text = decode(current.to_vec())?;
    let count = text.matches(old).count();
    if count == 0 {
        return Err(problem(ErrorKind::InvalidInput, "edit_no_match"));
    }
    if count > 1 && request.replace_all != Some(true) {
        return Err(problem(ErrorKind::InvalidInput, "edit_ambiguous"));
    }
    Ok(if request.replace_all == Some(true) {
        text.replace(old, new)
    } else {
        text.replacen(old, new, 1)
    }
    .into_bytes())
}
