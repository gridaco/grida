//! GRIDA-SEC-004 / GRIDA-SEC-014 — exact session image authority and scratch-only edits.

use super::images::{Images, MAX_DECODED_BYTES, MAX_IMAGE_BYTES, MAX_PIXELS, asset_ref, decoder};
use super::{AdmissionContext, ToolAdmission, ToolDecision, ToolGate, problem};
use crate::scratch::{AssetRef, WorkingCopyProof};
use agent_kit_core::authority::{
    AuthorityBinding, AuthorityRequest, AuthorityValidator, GrantSelection,
};
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{
    Content, Message, OutcomeStatus, ResultContent, Role, ToolArguments,
};
use agent_kit_core::tools::{
    Inventory, Invocation, InvocationContext, RecoveryKind, Tool, ToolDefinition, ToolOutcome,
};
use agent_kit_core::turn::{
    OperationInput, OperationOutcome, OperationState, TurnBinding, TurnState,
};
use agent_kit_core::{
    ArtifactId, AttemptId, BindingId, BoxFuture, Envelope, ErrorKind, Fingerprint, GrantId,
    OperationId, PrincipalId, Result, SchemaId, ScopeId, ToolId,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::io::Cursor;
use std::sync::Arc;
use std::time::Instant;

const CROP_TOOL: &str = "crop_retained_image";
const CROP_SCHEMA: &str = "grida.agent.scratch.crop";
const CROP_MAX_EVIDENCE: usize = 2048;
const MAX_ARTIFACTS: usize = 8;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CropArtifact {
    id: OperationId,
    kind: String,
    mime_type: String,
    label: String,
    width: u32,
    height: u32,
    bytes: usize,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CropReceipt {
    operation: OperationId,
    attempt: AttemptId,
    result: SavedCrop,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SavedCrop {
    working_copy_id: ArtifactId,
    source_asset_id: ArtifactId,
    source_version: u32,
    #[serde(deserialize_with = "deserialize_digest")]
    source_sha256: [u8; 32],
    #[serde(deserialize_with = "deserialize_digest")]
    sha256: [u8; 32],
    bytes: usize,
    width: u32,
    height: u32,
    retention: String,
}

impl CropReceipt {
    fn from_operation(state: &TurnState, operation: &OperationState) -> Option<Self> {
        let OperationInput::Tool(invocation) = &operation.record.input else {
            return None;
        };
        let grants = &operation.record.grants;
        if invocation.definition().id.as_str() != CROP_TOOL
            || invocation.definition().version != 1
            || grants.authority.principal.as_str() != "grida-local"
            || !grants
                .authority
                .binding
                .as_str()
                .starts_with("scratch-image/")
            || grants.authority.scope.as_str() != format!("scratch/{}", state.binding().session)
            || !matches!(grants.grants.as_slice(), [grant] if grant.as_str() == "retained-image-crop")
        {
            return None;
        }
        let attempt = operation.attempts.last()?;
        let Some(OperationOutcome::Tool(outcome)) = operation.outcome() else {
            return None;
        };
        let receipt = outcome.receipt.as_ref()?;
        if outcome.status != OutcomeStatus::Succeeded
            || receipt.schema().as_str() != CROP_SCHEMA
            || receipt.version() != 1
            || receipt.bytes().len() > CROP_MAX_EVIDENCE
        {
            return None;
        }
        let receipt: Self = serde_json::from_slice(receipt.bytes()).ok()?;
        let result = &receipt.result;
        if receipt.operation != operation.record.id
            || &receipt.operation != invocation.id()
            || receipt.attempt != attempt.id
            || result.bytes == 0
            || result.bytes > MAX_IMAGE_BYTES
            || result.width == 0
            || result.height == 0
            || u64::from(result.width) * u64::from(result.height) > MAX_PIXELS
            || result.retention != "chat_state"
        {
            return None;
        }
        Some(receipt)
    }

    fn artifact(&self) -> CropArtifact {
        CropArtifact {
            id: self.operation.clone(),
            kind: "image".into(),
            mime_type: "image/png".into(),
            label: "Cropped PNG".into(),
            width: self.result.width,
            height: self.result.height,
            bytes: self.result.bytes,
        }
    }

    fn proof(self) -> WorkingCopyProof {
        WorkingCopyProof {
            source_id: self.result.source_asset_id,
            source_version: self.result.source_version,
            source_digest: self.result.source_sha256,
            id: self.result.working_copy_id,
            size: self.result.bytes,
            digest: self.result.sha256,
        }
    }
}

pub(super) fn artifacts(state: &TurnState) -> Vec<CropArtifact> {
    state
        .operations()
        .values()
        .filter_map(|operation| CropReceipt::from_operation(state, operation))
        .take(MAX_ARTIFACTS)
        .map(|receipt| receipt.artifact())
        .collect()
}

pub(super) fn artifact_proof(state: &TurnState, id: &OperationId) -> Option<WorkingCopyProof> {
    state.outcome()?;
    CropReceipt::from_operation(state, state.operations().get(id)?).map(CropReceipt::proof)
}

fn deserialize_digest<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<[u8; 32], D::Error> {
    let value = String::deserialize(deserializer)?;
    let mut digest = [0; 32];
    if value.len() != digest.len() * 2 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(serde::de::Error::custom("invalid crop digest"));
    }
    for (index, byte) in digest.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&value[index * 2..index * 2 + 2], 16)
            .map_err(serde::de::Error::custom)?;
    }
    Ok(digest)
}

pub(super) struct TurnImage {
    images: Arc<Images>,
    turn: TurnBinding,
    source: AssetRef,
    grants: GrantSelection,
    definition: ToolDefinition,
}

impl TurnImage {
    pub(super) fn bind(
        images: Arc<Images>,
        turn: &TurnBinding,
        previous: &[Message],
        current: &[Message],
    ) -> Result<Option<Arc<Self>>> {
        let asset = current
            .iter()
            .rev()
            .chain(previous.iter().rev())
            .filter(|message| message.role == Role::User)
            .flat_map(|message| message.content.iter().rev())
            .filter_map(|part| match part {
                Content::Media(media) => asset_ref(media).ok(),
                _ => None,
            })
            .find(|asset| asset.owner() == &turn.session);
        let Some(source) = asset else {
            return Ok(None);
        };
        let fingerprint = Fingerprint::of(&(&turn.session, &turn.turn, &source))?;
        let binding = uuid::Uuid::from_bytes(
            fingerprint.bytes()[..16]
                .try_into()
                .expect("fingerprint prefix"),
        );
        let grants = GrantSelection {
            authority: AuthorityBinding {
                principal: PrincipalId::new("grida-local")?,
                binding: BindingId::new(format!("scratch-image/{binding}"))?,
                scope: ScopeId::new(format!("scratch/{}", turn.session))?,
            },
            grants: vec![GrantId::new("retained-image-crop")?],
        };
        let definition = ToolDefinition {
            id: ToolId::new(CROP_TOOL)?,
            version: 1,
            description: "Crop the most recent retained PNG attachment in this chat and save its working copy. Use pixel coordinates in the original image. The original and project files are preserved.".into(),
            input: InputFormat::Json(json!({
                "type": "object",
                "properties": {
                    "x": {"type":"integer", "minimum":0}, "y": {"type":"integer", "minimum":0},
                    "width": {"type":"integer", "minimum":1}, "height": {"type":"integer", "minimum":1}
                },
                "required": ["x", "y", "width", "height"],
                "additionalProperties": false
            })),
            max_input_bytes: 512,
            max_output_bytes: CROP_MAX_EVIDENCE,
            recovery: RecoveryKind::Unavailable,
        };
        Ok(Some(Arc::new(Self {
            images,
            turn: turn.clone(),
            source,
            grants,
            definition,
        })))
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

    fn crop(&self, invocation: &Invocation, context: &InvocationContext) -> Result<ToolOutcome> {
        let crop = Crop::parse(invocation.arguments())?;
        let original = self.images.with_scope(&self.turn.session, |scope| {
            check_control(context)?;
            scope.read_retained(&self.source, MAX_IMAGE_BYTES)
        })?;
        let bytes = crop.render(&original)?;
        self.images.with_scope(&self.turn.session, |scope| {
            check_control(context)?;
            let work = scope.materialize(&self.source)?;
            let result = json!({
                "workingCopyId": work.receipt().id(),
                "sourceAssetId": self.source.id(),
                "sourceVersion": self.source.version(),
                "sourceSha256": digest_text(self.source.digest()),
                "sha256": digest_text(&Sha256::digest(&bytes)),
                "bytes": bytes.len(),
                "width": crop.width,
                "height": crop.height,
                "retention": "chat_state",
            });
            let evidence = serde_json::to_vec(&json!({
                "operation": invocation.id(), "attempt": context.attempt, "result": &result,
            }))
            .map_err(|_| problem(ErrorKind::InvalidState, "scratch_crop_receipt_encoding"))?;
            let receipt = Envelope::new(SchemaId::new(CROP_SCHEMA)?, 1, evidence)?;
            scope.replace_working(work.receipt(), &bytes, || check_control(context))?;
            Ok(ToolOutcome {
                status: OutcomeStatus::Succeeded,
                content: vec![ResultContent::Text(
                    "Saved cropped PNG to the chat working copy.".into(),
                )],
                structured: Some(result),
                receipt: Some(receipt),
                truncated: false,
            })
        })
    }
}

impl AuthorityValidator for TurnImage {
    fn validate(&self, request: AuthorityRequest) -> BoxFuture<'_, Result<()>> {
        Box::pin(async move {
            if !self.handles(&request.selection) {
                return Err(denied());
            }
            Ok(())
        })
    }
}

impl ToolGate for TurnImage {
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

impl Tool for TurnImage {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }

    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        Crop::parse(arguments).map(|_| ())
    }

    fn invoke(
        &self,
        invocation: Invocation,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        // All work is bounded and local. The future never leaves behind a
        // detached writer, and cancellation is checked at publication.
        Box::pin(async move {
            match self.crop(&invocation, &context) {
                Ok(outcome) => outcome,
                Err(error) if error.kind == ErrorKind::Uncertain => ToolOutcome::uncertain(),
                Err(error) if error.code == "scratch_crop_cancelled" => {
                    let mut outcome = ToolOutcome::failed(&error.code);
                    outcome.status = OutcomeStatus::Cancelled;
                    outcome
                }
                Err(error) => ToolOutcome::failed(&error.code),
            }
        })
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Crop {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

impl Crop {
    fn parse(arguments: &ToolArguments) -> Result<Self> {
        let ToolArguments::Json(value) = arguments else {
            return Err(invalid_crop());
        };
        let crop: Self = serde_json::from_value(value.clone()).map_err(|_| invalid_crop())?;
        if crop.width == 0 || crop.height == 0 {
            return Err(invalid_crop());
        }
        Ok(crop)
    }

    fn render(&self, original: &[u8]) -> Result<Vec<u8>> {
        let mut decoder = decoder(Cursor::new(original));
        decoder.set_transformations(png::Transformations::normalize_to_color8());
        let mut reader = decoder.read_info().map_err(|_| image_error())?;
        let info = reader.info();
        if self
            .x
            .checked_add(self.width)
            .is_none_or(|end| end > info.width)
            || self
                .y
                .checked_add(self.height)
                .is_none_or(|end| end > info.height)
        {
            return Err(invalid_crop());
        }
        let length = reader
            .output_buffer_size()
            .filter(|len| *len <= MAX_DECODED_BYTES)
            .ok_or_else(image_error)?;
        let mut decoded = vec![0; length];
        let frame = reader.next_frame(&mut decoded).map_err(|_| image_error())?;
        let channels = frame.color_type.samples();
        let offset = self.x as usize * channels;
        let row_width = self.width as usize * channels;
        let mut cropped = Vec::with_capacity(row_width * self.height as usize);
        for row in decoded
            .chunks_exact(frame.line_size)
            .skip(self.y as usize)
            .take(self.height as usize)
        {
            cropped.extend_from_slice(&row[offset..offset + row_width]);
        }

        let mut output = Vec::new();
        let mut encoder = png::Encoder::new(&mut output, self.width, self.height);
        encoder.set_color(frame.color_type);
        encoder.set_depth(frame.bit_depth);
        let mut writer = encoder.write_header().map_err(|_| image_error())?;
        writer
            .write_image_data(&cropped)
            .map_err(|_| image_error())?;
        writer.finish().map_err(|_| image_error())?;
        if output.len() > MAX_IMAGE_BYTES {
            return Err(problem(
                ErrorKind::LimitExceeded,
                "scratch_image_size_limit",
            ));
        }
        Ok(output)
    }
}

fn check_control(context: &InvocationContext) -> Result<()> {
    if context.cancellation.is_cancelled()
        || context
            .deadline
            .is_some_and(|deadline| deadline <= Instant::now())
    {
        return Err(problem(ErrorKind::Unavailable, "scratch_crop_cancelled"));
    }
    Ok(())
}

fn digest_text(digest: &[u8]) -> String {
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn denied() -> agent_kit_core::Error {
    problem(
        ErrorKind::Unavailable,
        "scratch_image_authority_unavailable",
    )
}

fn invalid_crop() -> agent_kit_core::Error {
    problem(ErrorKind::InvalidInput, "invalid_image_crop")
}

fn image_error() -> agent_kit_core::Error {
    problem(ErrorKind::InvalidInput, "scratch_image_encoding_failed")
}
