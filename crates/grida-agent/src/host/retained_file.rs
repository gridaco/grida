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
    pub(super) source: Option<(super::SelectedImage, usize)>,
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
    pub(crate) fn byte_len(&self) -> usize {
        self.source
            .as_ref()
            .map_or(self.bytes.len(), |(_, size)| *size)
    }

    pub(crate) fn staged(selection: super::SelectedImage, size: usize) -> Result<Self> {
        selection.validate()?;
        Self::validate_name(&selection.name)?;
        if selection.source != super::ImageSource::Snapshot {
            return Err(problem(
                ErrorKind::InvalidInput,
                "selected_file_snapshot_required",
            ));
        }
        if size > MAX_FILE_BYTES {
            return Err(problem(ErrorKind::LimitExceeded, "file_size_limit"));
        }
        let mut file = Self::with_bytes(&selection.name, Vec::new());
        file.digest = selection.sha256;
        file.source = Some((selection, size));
        Ok(file)
    }

    pub(super) fn read_staged(mut self) -> Result<Self> {
        if let Some((source, size)) = self.source.take() {
            let bytes = super::selected_file::read_selected(
                Path::new(&source.path),
                MAX_FILE_BYTES,
                "selected_file_unavailable",
                "selected_file_changed",
                "file_size_limit",
            )?;
            if bytes.len() != size || <[u8; 32]>::from(Sha256::digest(&bytes)) != self.digest {
                return Err(problem(ErrorKind::Conflict, "selected_file_changed"));
            }
            self.bytes = bytes;
        }
        Ok(self)
    }

    pub(crate) fn decode(name: &str, data: &str) -> Result<Self> {
        Self::validate_name(name)?;
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

    pub(crate) fn from_text(name: &str, text: String) -> Result<Self> {
        Self::validate_name(name)?;
        if text.len() > MAX_FILE_BYTES {
            return Err(problem(ErrorKind::LimitExceeded, "file_size_limit"));
        }
        Ok(Self::with_bytes(name, text.into_bytes()))
    }

    fn validate_name(name: &str) -> Result<()> {
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
        Ok(())
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
            source: None,
        }
    }

    pub(super) fn matches(&self, asset: &AssetRef) -> bool {
        self.name == asset.name()
            && self.byte_len() as u64 == asset.size()
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
    work: Vec<WorkingCopyReceipt>,
    grants: GrantSelection,
    definition: ToolDefinition,
}

impl TurnFile {
    pub(super) fn bind(
        storage: Arc<RetainedInputs>,
        turn: &TurnBinding,
        work: Vec<WorkingCopyReceipt>,
    ) -> Result<Arc<Self>> {
        if work.is_empty()
            || work.iter().any(|entry| {
                entry.asset().owner() != &turn.session
                    || entry.asset().size() > MAX_FILE_BYTES as u64
            })
        {
            return Err(denied());
        }
        let multiple = work.len() > 1;
        let description = if multiple {
            let files = work
                .iter()
                .map(|entry| format!("{} ({})", entry.asset().name(), entry.asset().id()))
                .collect::<Vec<_>>()
                .join(", ");
            format!(
                "Inspect one file attached to this task. Attachments in input order: {files}. Returns the verified size and SHA-256. Request a text excerpt only if needed."
            )
        } else {
            "Inspect the file attached to this task. Returns its verified size and SHA-256. Request a text excerpt only if needed. Binary content is not returned.".to_owned()
        };
        let input = if multiple {
            let ids = work
                .iter()
                .map(|entry| entry.asset().id())
                .collect::<Vec<_>>();
            json!({
                "type":"object", "properties":{
                    "attachment_id":{"type":"string","enum":ids},
                    "include_text":{"type":"boolean"}
                },
                "required":["attachment_id"], "additionalProperties":false
            })
        } else {
            json!({
                "type":"object", "properties":{"include_text":{"type":"boolean"}},
                "additionalProperties":false
            })
        };
        let digest = if let [file] = work.as_slice() {
            Fingerprint::of(&(&turn.session, &turn.turn, file))?
        } else {
            Fingerprint::of(&(&turn.session, &turn.turn, &work))?
        };
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
                version: if multiple { 2 } else { 1 },
                description,
                input: InputFormat::Json(input),
                max_input_bytes: if multiple { 256 } else { 64 },
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

    fn read(&self, work: &WorkingCopyReceipt) -> BoxFuture<'static, Result<Vec<u8>>> {
        let storage = self.storage.clone();
        let work = work.clone();
        Box::pin(async move {
            tokio::task::spawn_blocking(move || storage.read_file(&work))
                .await
                .map_err(|_| problem(ErrorKind::Unavailable, "attachment_storage_unavailable"))?
        })
    }

    pub(super) fn check(&self) -> BoxFuture<'static, Result<()>> {
        let reads = self
            .work
            .iter()
            .map(|work| self.read(work))
            .collect::<Vec<_>>();
        Box::pin(async move {
            for read in reads {
                read.await?;
            }
            Ok(())
        })
    }

    fn selected(&self, request: &Inspect) -> Result<&WorkingCopyReceipt> {
        match (&request.attachment_id, self.work.as_slice()) {
            (None, [work]) => Ok(work),
            (Some(id), work) if work.len() > 1 => work
                .iter()
                .find(|entry| entry.asset().id().as_str() == id)
                .ok_or_else(invalid_inspection),
            _ => Err(invalid_inspection()),
        }
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
        self.selected(&request(arguments)?).map(|_| ())
    }

    fn invoke(
        &self,
        invocation: Invocation,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            let result = async {
                let request = request(invocation.arguments())?;
                let work = self.selected(&request)?;
                let include_text = request.include_text;
                let bytes = self.read(work).await?;
                let text = include_text
                    .then(|| std::str::from_utf8(&bytes).ok())
                    .flatten()
                    .filter(|text| {
                        text.chars()
                            .all(|c| !c.is_control() || matches!(c, '\n' | '\r' | '\t'))
                    });
                let excerpt = text.map(|text| &text[..text.floor_char_boundary(MAX_EXCERPT_BYTES)]);
                let digest = work
                    .asset()
                    .digest()
                    .iter()
                    .map(|byte| format!("{byte:02x}"))
                    .collect::<String>();
                let mut structured = json!({
                    "name": work.asset().name(), "bytes": bytes.len(), "sha256": digest,
                    "text": excerpt, "textRequested": include_text,
                });
                if self.work.len() > 1 {
                    structured["attachmentId"] = json!(work.asset().id());
                }
                Ok::<_, agent_kit_core::Error>(ToolOutcome {
                    status: OutcomeStatus::Succeeded,
                    content: Vec::new(),
                    structured: Some(structured),
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
    attachment_id: Option<String>,
}

fn request(arguments: &ToolArguments) -> Result<Inspect> {
    let ToolArguments::Json(value) = arguments else {
        return Err(invalid_inspection());
    };
    serde_json::from_value(value.clone()).map_err(|_| invalid_inspection())
}

fn invalid_inspection() -> agent_kit_core::Error {
    problem(
        ErrorKind::InvalidInput,
        "retained_file_inspection_arguments",
    )
}

fn denied() -> agent_kit_core::Error {
    problem(ErrorKind::InvalidInput, "retained_file_scope_mismatch")
}
