//! GRIDA-SEC-004 — Goal evidence from one trusted file observation.

use crate::file_tools::{read_request, validate_path};
use agent_kit_core::authority::GrantSelection;
use agent_kit_core::messages::{OutcomeStatus, ResultContent};
use agent_kit_core::turn::{OperationInput, OperationOutcome, OperationState};
use agent_kit_core::{BindingId, Error, ErrorKind, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::Path;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ReadVerification {
    pub(crate) directory: BindingId,
    relative_path: String,
    sha256: [u8; 32],
}

impl ReadVerification {
    pub(crate) fn validate(&self) -> Result<()> {
        // Keep the generated criterion comfortably inside the Goal text limit.
        if self.relative_path.is_empty()
            || self
                .relative_path
                .split('/')
                .any(|part| matches!(part, "" | "." | ".."))
            || self.criterion().len() > 768
        {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "invalid_goal_read_verification",
            ));
        }
        validate_path(Path::new(&self.relative_path))
    }

    fn criterion(&self) -> String {
        let digest = self
            .sha256
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        format!(
            "Observe SHA-256 {digest} for directory {:?}, path {:?}.",
            self.directory.as_str(),
            self.relative_path
        )
    }

    pub(crate) fn verifier(self, grant: GrantSelection) -> impl Fn(&str, &OperationState) -> bool {
        let criterion = self.criterion();
        move |selected, operation| {
            if selected != criterion
                || operation.record.grants != grant
                || operation.record.origin.is_none()
                || operation.record.source_call.is_none()
                || operation.rejection.is_some()
            {
                return false;
            }
            let OperationInput::Tool(invocation) = &operation.record.input else {
                return false;
            };
            if invocation.definition().id.as_str() != "read_file"
                || invocation.definition().version != 1
                || invocation.id() != &operation.record.id
            {
                return false;
            }
            let Ok(request) = read_request(invocation) else {
                return false;
            };
            if request.directory.as_ref() != Some(&self.directory)
                || request.path.as_deref().and_then(Path::to_str)
                    != Some(self.relative_path.as_str())
            {
                return false;
            }
            let [attempt] = operation.attempts.as_slice() else {
                return false;
            };
            let Some(OperationOutcome::Tool(outcome)) = &attempt.outcome else {
                return false;
            };
            let [ResultContent::Text(bytes)] = outcome.content.as_slice() else {
                return false;
            };
            // Native read_file uses lossless UTF-8 decoding over the complete
            // bounded file. Its Tool outcome keeps those exact observed bytes.
            attempt.prior_outcomes.is_empty()
                && outcome.status == OutcomeStatus::Succeeded
                && !outcome.truncated
                && outcome.structured.is_none()
                && outcome.receipt.is_none()
                && <[u8; 32]>::from(Sha256::digest(bytes.as_bytes())) == self.sha256
        }
    }
}
