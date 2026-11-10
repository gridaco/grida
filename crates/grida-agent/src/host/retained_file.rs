//! GRIDA-SEC-004 — Inspect only the file selected for this admitted task.

use super::retained_inputs::RetainedInputs;
use super::{AdmissionContext, ToolAdmission, ToolDecision, ToolGate, problem};
use crate::scratch::{AssetRef, WorkingCopyReceipt};
use agent_kit_core::authority::{AuthorityBinding, GrantSelection};
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{MediaRef, OutcomeStatus, Retention, ToolArguments};
use agent_kit_core::tools::{
    Inventory, Invocation, InvocationContext, RecoveryKind, Tool, ToolDefinition, ToolOutcome,
};
use agent_kit_core::turn::TurnBinding;
use agent_kit_core::{
    BindingId, BoxFuture, ErrorKind, Fingerprint, GrantId, PrincipalId, Result, ScopeId, ToolId,
};
use base64::{Engine, engine::general_purpose::STANDARD};
use grida_agent_master::retained_file::{LOCATOR_PREFIX, MAX_NAME_BYTES, MEDIA_TYPE};
use serde::Deserialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::Path;
use std::sync::Arc;

const MAX_FILE_BYTES: usize = 256 * 1024;
const MAX_EXCERPT_BYTES: usize = 2 * 1024;

/// One selected local file. Its transient bytes do not enter the prompt journal.
#[derive(Clone, PartialEq, Eq)]
pub struct FileUpload {
    pub(super) name: String,
    pub(super) bytes: Vec<u8>,
    pub(super) digest: [u8; 32],
}

impl std::fmt::Debug for FileUpload {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("FileUpload")
            .field("size", &self.bytes.len())
            .finish_non_exhaustive()
    }
}

impl FileUpload {
    pub(crate) fn decode(name: &str, data: &str) -> Result<Self> {
        if name.is_empty()
            || name.len() > 256
            || name.contains(['/', '\\'])
            || name.chars().any(char::is_control)
        {
            return Err(problem(
                ErrorKind::InvalidInput,
                "retained_file_name_invalid",
            ));
        }
        if data.len() > MAX_FILE_BYTES.div_ceil(3) * 4 {
            return Err(problem(ErrorKind::LimitExceeded, "file_size_limit"));
        }
        let bytes = STANDARD
            .decode(data)
            .map_err(|_| problem(ErrorKind::InvalidInput, "invalid_file_attachment"))?;
        if bytes.len() > MAX_FILE_BYTES {
            return Err(problem(ErrorKind::LimitExceeded, "file_size_limit"));
        }
        Ok(Self::with_bytes(name, bytes))
    }

    pub(crate) fn read_selected_file(path: &Path) -> Result<Self> {
        let bytes = super::selected_file::read_selected(
            path,
            MAX_FILE_BYTES,
            "selected_file_unavailable",
            "selected_file_changed",
            "file_size_limit",
        )?;
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("attachment");
        Ok(Self::with_bytes(name, bytes))
    }

    fn with_bytes(name: &str, bytes: Vec<u8>) -> Self {
        let name: String = name
            .chars()
            .take(MAX_NAME_BYTES)
            .map(|c| {
                if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        let name = name.trim_start_matches('.');
        Self {
            name: if name.is_empty() {
                "attachment".into()
            } else {
                name.into()
            },
            digest: Sha256::digest(&bytes).into(),
            bytes,
        }
    }

    pub(super) fn matches(&self, asset: &AssetRef) -> bool {
        self.name == asset.name()
            && self.bytes.len() as u64 == asset.size()
            && &self.digest == asset.digest()
    }
}

pub(super) fn media(asset: &AssetRef) -> Result<MediaRef> {
    let media = MediaRef {
        id: asset.id().clone(),
        media_type: MEDIA_TYPE.into(),
        locator: format!("{LOCATOR_PREFIX}{}", asset.name()),
        access_scope: BindingId::new(format!("retained-file/{}", asset.owner()))?,
        retention: Retention::Retained,
    };
    if grida_agent_master::retained_file::display(&media).is_none() {
        return Err(problem(
            ErrorKind::InvalidInput,
            "retained_file_name_invalid",
        ));
    }
    Ok(media)
}

pub(super) struct TurnFile {
    storage: Arc<RetainedInputs>,
    turn: TurnBinding,
    work: WorkingCopyReceipt,
    grants: GrantSelection,
    definition: ToolDefinition,
}

impl TurnFile {
    pub(super) fn bind(
        storage: Arc<RetainedInputs>,
        turn: &TurnBinding,
        work: WorkingCopyReceipt,
    ) -> Result<Arc<Self>> {
        if work.asset().owner() != &turn.session || work.asset().size() > MAX_FILE_BYTES as u64 {
            return Err(denied());
        }
        let digest = Fingerprint::of(&(&turn.session, &turn.turn, &work))?;
        let binding =
            uuid::Uuid::from_bytes(digest.bytes()[..16].try_into().expect("fingerprint prefix"));
        Ok(Arc::new(Self {
            storage,
            turn: turn.clone(),
            work,
            grants: GrantSelection {
                authority: AuthorityBinding {
                    principal: PrincipalId::new("grida-local")?,
                    binding: BindingId::new(format!("scratch-file/{binding}"))?,
                    scope: ScopeId::new(format!("scratch/{}", turn.session))?,
                },
                grants: vec![GrantId::new("retained-file-inspect")?],
            },
            definition: ToolDefinition {
                id: ToolId::new("inspect_retained_file")?,
                version: 1,
                description: "Inspect the file attached to this task. Returns its verified size and SHA-256. Request a text excerpt only if needed. Binary content is not returned.".into(),
                input: InputFormat::Json(json!({
                    "type":"object", "properties":{"include_text":{"type":"boolean"}},
                    "additionalProperties":false
                })),
                max_input_bytes: 64,
                max_output_bytes: 16 * 1024,
                recovery: RecoveryKind::Unavailable,
            },
        }))
    }

    pub(super) fn handles(&self, selection: &GrantSelection) -> bool {
        selection == &self.grants
    }

    pub(super) fn insert(
        self: &Arc<Self>,
        inventory: &mut Inventory,
        grants: &mut BTreeMap<ToolId, GrantSelection>,
    ) -> Result<()> {
        inventory.insert(self.clone())?;
        grants.insert(self.definition.id.clone(), self.grants.clone());
        Ok(())
    }

    fn read(&self) -> BoxFuture<'static, Result<Vec<u8>>> {
        let storage = self.storage.clone();
        let work = self.work.clone();
        Box::pin(async move {
            tokio::task::spawn_blocking(move || storage.read_file(&work))
                .await
                .map_err(|_| problem(ErrorKind::Unavailable, "attachment_storage_unavailable"))?
        })
    }

    pub(super) fn check(&self) -> BoxFuture<'static, Result<()>> {
        let read = self.read();
        Box::pin(async move { read.await.map(|_| ()) })
    }
}

impl ToolGate for TurnFile {
    fn decide(
        &self,
        admission: ToolAdmission,
        context: AdmissionContext,
    ) -> BoxFuture<'_, Result<ToolDecision>> {
        Box::pin(async move {
            if !self.handles(&admission.grants)
                || context.operations.view().state.binding() != &self.turn
                || admission.invocation.definition() != &self.definition
                || admission.invocation.id() != &admission.operation
            {
                return Err(denied());
            }
            Ok(ToolDecision::Permit)
        })
    }
}

impl Tool for TurnFile {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }

    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        request(arguments).map(|_| ())
    }

    fn invoke(
        &self,
        invocation: Invocation,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            let result = async {
                let include_text = request(invocation.arguments())?.include_text;
                let bytes = self.read().await?;
                let text = include_text
                    .then(|| std::str::from_utf8(&bytes).ok())
                    .flatten()
                    .filter(|text| {
                        text.chars()
                            .all(|c| !c.is_control() || matches!(c, '\n' | '\r' | '\t'))
                    });
                let excerpt = text.map(|text| &text[..text.floor_char_boundary(MAX_EXCERPT_BYTES)]);
                let digest = self
                    .work
                    .asset()
                    .digest()
                    .iter()
                    .map(|byte| format!("{byte:02x}"))
                    .collect::<String>();
                Ok::<_, agent_kit_core::Error>(ToolOutcome {
                    status: OutcomeStatus::Succeeded,
                    content: Vec::new(),
                    structured: Some(json!({
                        "name": self.work.asset().name(), "bytes": bytes.len(), "sha256": digest,
                        "text": excerpt, "textRequested": include_text,
                    })),
                    receipt: None,
                    truncated: text
                        .zip(excerpt)
                        .is_some_and(|(text, excerpt)| excerpt.len() < text.len()),
                })
            };
            tokio::select! {
                biased;
                _ = context.cancellation.cancelled() => ToolOutcome {
                    status: OutcomeStatus::Cancelled,
                    content: Vec::new(), structured: None, receipt: None, truncated: false,
                },
                outcome = result => outcome.unwrap_or_else(|error| ToolOutcome::failed(&error.code)),
            }
        })
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Inspect {
    #[serde(default)]
    include_text: bool,
}

fn request(arguments: &ToolArguments) -> Result<Inspect> {
    let invalid = || {
        problem(
            ErrorKind::InvalidInput,
            "retained_file_inspection_arguments",
        )
    };
    let ToolArguments::Json(value) = arguments else {
        return Err(invalid());
    };
    serde_json::from_value(value.clone()).map_err(|_| invalid())
}

fn denied() -> agent_kit_core::Error {
    problem(ErrorKind::InvalidInput, "retained_file_scope_mismatch")
}
