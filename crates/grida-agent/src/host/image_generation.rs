//! GRIDA-SEC-004 — paid image generation stays with the captured Desktop owner.

use super::{
    Credential, Execution, Host, PromptPart, host_tools::HostTools, problem,
    questions::QuestionAccess, retained_inputs::RetainedInputs,
};
use crate::http::HttpTransport;
use crate::scratch::AssetRef;
use crate::tool_host::{
    CapabilityCall, CapabilityDefinition, CapabilityEffect, CapabilityExecutor, CapabilityReply,
    ToolHost,
};
use agent_client_protocol::v1::ConnectionTo;
use agent_client_protocol::{Client, JsonRpcRequest, JsonRpcResponse};
use agent_kit_core::authority::GrantSelection;
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{OutcomeStatus, ResultContent};
use agent_kit_core::tools::{RecoveryKind, ToolDefinition, ToolOutcome};
use agent_kit_core::turn::{
    OperationInput, OperationOutcome, OperationState, TurnBinding, TurnState,
};
use agent_kit_core::{BindingId, BoxFuture, ErrorKind, Result, SessionId, ToolId, TurnId};
use agent_kit_store_sqlite::SqliteStore;
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use uuid::Uuid;

mod placement;
mod workspace_reference;
pub(crate) use placement::CAPABILITY as PLACE_CAPABILITY;
pub(super) use placement::TOOL as PLACE_TOOL;
pub(crate) use workspace_reference::CAPABILITY as WORKSPACE_CAPABILITY;
pub(super) use workspace_reference::{
    TOOL as WORKSPACE_TOOL, unavailable as workspace_reference_unavailable,
};

pub(crate) const CAPABILITY: &str = "co.grida/media/generate-image";
pub(crate) const REFERENCE_CAPABILITY: &str = "co.grida/media/image-reference";
pub(crate) const ATTACHMENT_CAPABILITY: &str = "co.grida/media/attachment-reference";
pub(super) const TOOL: &str = "generate_image";
pub(super) const PRINCIPAL: &str = "desktop-image-generation";
const MAX_PROMPT_BYTES: usize = 8 * 1024;
const MAX_MEDIA_BYTES: u64 = 64 * 1024 * 1024;
const TEXT_VERSION: u32 = 1;
const REFERENCE_VERSION: u32 = 2;
const PLACEABLE_TEXT_VERSION: u32 = 3;
const PLACEABLE_REFERENCE_VERSION: u32 = 4;
const ATTACHMENT_VERSION: u32 = 5;
const BOTH_REFERENCES_VERSION: u32 = 6;
const PLACEABLE_ATTACHMENT_VERSION: u32 = 7;
const PLACEABLE_BOTH_REFERENCES_VERSION: u32 = 8;

pub(super) fn attached_image<'a>(
    parts: &'a [PromptPart],
    owner: &SessionId,
) -> Option<&'a AssetRef> {
    let mut attachments = parts.iter().filter_map(|part| match part {
        PromptPart::RetainedImage { asset } => Some(asset),
        _ => None,
    });
    let asset = attachments.next()?;
    (attachments.next().is_none()
        && asset.owner() == owner
        && asset.id().as_str().starts_with("input/")
        && asset.name() == super::images::NAME
        && asset.version() == 1
        && (1..=super::images::MAX_IMAGE_BYTES as u64).contains(&asset.size()))
    .then_some(asset)
}

#[derive(PartialEq, Eq)]
enum GenerationReceipt {
    Retained,
    Placeable,
}

fn generation_operation(
    state: &TurnState,
    operation: &OperationState,
) -> Option<GenerationReceipt> {
    let OperationInput::Tool(invocation) = &operation.record.input else {
        return None;
    };
    let grants = &operation.record.grants;
    let tool = invocation.definition().id.as_str();
    if grants.authority.principal.as_str() != PRINCIPAL
        || grants.authority.scope.as_str() != state.binding().turn.as_str()
        || !matches!(grants.grants.as_slice(), [grant] if grant.as_str() == tool)
        || operation.attempts.is_empty()
    {
        return None;
    }
    match (tool, invocation.definition().version) {
        (TOOL, TEXT_VERSION | REFERENCE_VERSION | ATTACHMENT_VERSION | BOTH_REFERENCES_VERSION)
        | (WORKSPACE_TOOL, workspace_reference::VERSION) => Some(GenerationReceipt::Retained),
        (
            TOOL,
            PLACEABLE_TEXT_VERSION
            | PLACEABLE_REFERENCE_VERSION
            | PLACEABLE_ATTACHMENT_VERSION
            | PLACEABLE_BOTH_REFERENCES_VERSION,
        )
        | (WORKSPACE_TOOL, workspace_reference::PLACEABLE_VERSION) => {
            Some(GenerationReceipt::Placeable)
        }
        _ => None,
    }
}

pub(super) fn summary_note(state: &TurnState) -> Option<&'static str> {
    let mut retained = false;
    let mut unretained = false;
    for operation in state.operations().values() {
        if generation_operation(state, operation).is_none() {
            continue;
        }
        let outcomes = operation.outcome().into_iter().chain(
            operation
                .attempts
                .iter()
                .flat_map(|attempt| &attempt.prior_outcomes),
        );
        for outcome in outcomes {
            let OperationOutcome::Tool(outcome) = outcome else {
                continue;
            };
            let status = outcome
                .structured
                .as_ref()
                .and_then(|details| details.get("status"))
                .and_then(Value::as_str);
            match (outcome.status, status) {
                (OutcomeStatus::Succeeded, Some("retained")) => retained = true,
                (OutcomeStatus::Uncertain, Some("generated_unretained")) => unretained = true,
                _ => {}
            }
        }
    }
    match (retained, unretained) {
        (true, true) => Some(
            "Desktop retained a generated image in Recents. The provider also generated an image that Desktop could not retain.",
        ),
        (true, false) => Some("Desktop retained a generated image in Recents."),
        (false, true) => {
            Some("The provider generated an image, but Desktop could not retain a usable copy.")
        }
        (false, false) => None,
    }
}

#[derive(Clone)]
pub(crate) struct DesktopImageGeneration {
    binding: BindingId,
    connection: Arc<Mutex<Option<DesktopConnection>>>,
    transport: Arc<HttpTransport>,
}

struct DesktopConnection {
    client: ConnectionTo<Client>,
    references: bool,
    placement: bool,
    attachment_references: bool,
    workspace_references: bool,
}

pub(super) struct Prepared {
    owner: DesktopImageGeneration,
    references: bool,
    placement: bool,
    attachment: Option<AssetRef>,
    workspace_reference: bool,
}

impl Prepared {
    pub(super) fn workspace_reference(&self) -> bool {
        self.workspace_reference
    }

    pub(super) fn bind(
        self,
        store: Arc<SqliteStore>,
        execution: &Execution,
        turn: &TurnBinding,
        workspace_capture: Option<&GrantSelection>,
    ) -> Result<Arc<HostTools>> {
        let reference = if self.references {
            Some(ReferenceScope {
                store: store.clone(),
                turn: turn.clone(),
                storage: execution
                    .retained_inputs
                    .clone()
                    .ok_or_else(reference_unavailable)?,
                access: execution.questions.clone(),
            })
        } else {
            None
        };
        let attachment = self
            .attachment
            .map(|asset| {
                if asset.owner() != &turn.session {
                    return Err(attachment_unavailable());
                }
                Ok(AttachmentScope {
                    asset,
                    storage: execution
                        .retained_inputs
                        .clone()
                        .ok_or_else(attachment_unavailable)?,
                })
            })
            .transpose()?;
        let workspace = if self.workspace_reference {
            Some(workspace_reference::Scope::new(
                store.clone(),
                turn.clone(),
                execution
                    .retained_inputs
                    .clone()
                    .ok_or_else(workspace_reference_unavailable)?,
                workspace_capture
                    .cloned()
                    .ok_or_else(workspace_reference_unavailable)?,
            ))
        } else {
            None
        };
        let tool = self.owner.tool_host(
            turn,
            reference,
            attachment,
            workspace,
            self.placement.then_some(store),
        )?;
        Ok(Arc::new(HostTools::image_generation(
            tool,
            self.owner.binding,
            self.placement,
            self.workspace_reference,
        )?))
    }
}

impl Host {
    pub(crate) fn supports_attachment_reference(&self) -> bool {
        self.execution()
            .ok()
            .zip(self.desktop_image_generation.as_ref())
            .is_some_and(|(execution, owner)| {
                owner
                    .transport
                    .accepts_compatible_png(&execution.config.model)
            })
    }

    pub(crate) fn supports_workspace_image_reference(&self) -> bool {
        self.supports_attachment_reference()
            && self.accepts_files()
            && self
                .permissions
                .as_ref()
                .is_some_and(|profile| profile.supports_workspace_image_reference())
    }

    /// Bind image generation to the trusted supervisor's exact media profile.
    pub fn with_desktop_image_generation(mut self, binding: &str) -> Result<Self> {
        let Credential::Http(transport) = &self.execution()?.authorization.credential else {
            return Err(problem(
                ErrorKind::InvalidInput,
                "desktop_image_generation_provider_invalid",
            ));
        };
        if binding.len() != 64
            || !binding
                .bytes()
                .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
            || self.desktop_image_generation.is_some()
        {
            return Err(problem(
                ErrorKind::InvalidInput,
                "desktop_image_generation_binding_invalid",
            ));
        }
        self.desktop_image_generation = Some(DesktopImageGeneration {
            binding: BindingId::new(binding)?,
            connection: Arc::default(),
            transport: transport.clone(),
        });
        Ok(self)
    }
}

impl DesktopImageGeneration {
    pub(crate) fn attach(
        &self,
        client: ConnectionTo<Client>,
        references: bool,
        placement: bool,
        attachment_references: bool,
        workspace_references: bool,
    ) {
        *self.connection.lock().unwrap() = Some(DesktopConnection {
            client,
            references,
            placement,
            attachment_references,
            workspace_references,
        });
    }

    pub(crate) fn detach(&self) {
        self.connection.lock().unwrap().take();
    }

    pub(super) fn capture(&self) -> Option<BindingId> {
        self.connection.lock().unwrap().as_ref()?;
        Some(self.binding.clone())
    }

    pub(super) fn references(&self) -> bool {
        self.connection
            .lock()
            .unwrap()
            .as_ref()
            .is_some_and(|connection| connection.references)
    }

    pub(super) fn placement(&self) -> bool {
        self.connection
            .lock()
            .unwrap()
            .as_ref()
            .is_some_and(|connection| connection.placement)
    }

    pub(super) fn attachment_references(&self) -> bool {
        self.connection
            .lock()
            .unwrap()
            .as_ref()
            .is_some_and(|connection| connection.attachment_references)
    }

    pub(super) fn workspace_references(&self) -> bool {
        self.connection
            .lock()
            .unwrap()
            .as_ref()
            .is_some_and(|connection| connection.workspace_references)
    }

    pub(super) fn prepare(
        &self,
        references: bool,
        placement: bool,
        attachment: Option<AssetRef>,
        workspace_reference: bool,
    ) -> Result<Prepared> {
        if references && !self.references() {
            return Err(reference_unavailable());
        }
        if placement && !self.placement() {
            return Err(problem(
                ErrorKind::Unavailable,
                "retained_image_placement_unavailable",
            ));
        }
        if attachment.is_some() && !self.attachment_references() {
            return Err(attachment_unavailable());
        }
        if workspace_reference && !self.workspace_references() {
            return Err(workspace_reference_unavailable());
        }
        Ok(Prepared {
            owner: self.clone(),
            references,
            placement,
            attachment,
            workspace_reference,
        })
    }

    fn tool_host(
        &self,
        turn: &TurnBinding,
        reference: Option<ReferenceScope>,
        attachment: Option<AttachmentScope>,
        workspace: Option<workspace_reference::Scope>,
        placement_store: Option<Arc<SqliteStore>>,
    ) -> Result<ToolHost> {
        let mut properties = json!({
            "prompt": {"type": "string", "minLength": 1, "maxLength": MAX_PROMPT_BYTES},
            "background": {"enum": ["auto", "opaque", "transparent"]}
        });
        let mut description = String::from(
            "Generate one image from a text prompt using the saved Desktop image connection. Optional background intent is auto, opaque or transparent. A retained result is available in Desktop Recents. Do not repeat a request whose generation or retention is unconfirmed.",
        );
        if reference.is_some() {
            properties["library_reference_id"] = json!({"type":"string", "format":"uuid", "description":"The catalog ID of one Library image the user selected earlier in this turn."});
            description.push_str(" Use library_reference_id only for a Library image the user selected in this turn.");
        }
        if attachment.is_some() {
            properties["attached_image"] = json!({"type":"boolean", "const":true, "description":"Use the image attached to this submission. Desktop asks before sending it to the image provider."});
            description.push_str(" Set attached_image to true to request generation using the image attached to this submission. If the user declines, ask before another attempt or generating without it.");
            if reference.is_some() {
                description.push_str(" Choose attached_image or library_reference_id, never both.");
            }
        }
        let placement = placement_store.is_some();
        if placement {
            description.push_str(" To place a retained image in the workspace, use place_generated_image with its media ID and source turn.");
        }
        let mut input_schema = json!({
            "type": "object",
            "properties": properties,
            "required": ["prompt"],
            "additionalProperties": false
        });
        if reference.is_some() && attachment.is_some() {
            input_schema["not"] = json!({"required":["attached_image", "library_reference_id"]});
        }
        let definition = CapabilityDefinition {
            tool: ToolDefinition {
                id: ToolId::new(TOOL)?,
                version: match (reference.is_some(), placement, attachment.is_some()) {
                    (false, false, false) => TEXT_VERSION,
                    (true, false, false) => REFERENCE_VERSION,
                    (false, true, false) => PLACEABLE_TEXT_VERSION,
                    (true, true, false) => PLACEABLE_REFERENCE_VERSION,
                    (false, false, true) => ATTACHMENT_VERSION,
                    (true, false, true) => BOTH_REFERENCES_VERSION,
                    (false, true, true) => PLACEABLE_ATTACHMENT_VERSION,
                    (true, true, true) => PLACEABLE_BOTH_REFERENCES_VERSION,
                },
                description,
                input: InputFormat::Json(input_schema),
                max_input_bytes: MAX_PROMPT_BYTES * 6
                    + if attachment.is_some() { 256 } else { 128 },
                max_output_bytes: if placement { 4096 } else { 1024 },
                recovery: RecoveryKind::Unavailable,
            },
            output_schema: generation_output_schema(attachment.is_some()),
            effect: CapabilityEffect::Mutation,
        };
        let dispatch = DispatchImage {
            session: turn.session.clone(),
            owner: self.clone(),
            placement_turn: placement.then(|| turn.turn.clone()),
        };
        let executor = Arc::new(GenerateImage {
            dispatch: dispatch.clone(),
            reference,
            attachment,
        }) as Arc<dyn CapabilityExecutor>;
        let mut tools = vec![(definition, executor)];
        if let Some(workspace) = workspace {
            tools.push(workspace_reference::tool(workspace, dispatch)?);
        }
        if let Some(store) = placement_store {
            tools.push(placement::tool(self.clone(), store, turn.clone())?);
        }
        ToolHost::new(tools)
    }
}

fn generation_output_schema(can_decline: bool) -> Value {
    let mut statuses = vec!["retained", "generated_unretained"];
    if can_decline {
        statuses.push("reference_declined");
    }
    json!({
        "type": "object",
        "properties": {
            "status": {"enum": statuses},
            "id": {"type": "string"},
            "media_type": {"type": "string"},
            "bytes": {"type": "integer"}
        },
        "required": ["status"],
        "additionalProperties": false
    })
}

fn valid_prompt(prompt: &str) -> bool {
    !prompt.trim().is_empty() && prompt.len() <= MAX_PROMPT_BYTES
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum Background {
    Auto,
    Opaque,
    Transparent,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Arguments {
    prompt: String,
    background: Option<Background>,
    library_reference_id: Option<String>,
    attached_image: Option<bool>,
}

impl Arguments {
    fn parse(value: &Value, references: bool, attachment: bool) -> Result<Self> {
        let invalid = || {
            problem(
                ErrorKind::InvalidInput,
                "invalid_image_generation_arguments",
            )
        };
        let args: Self = serde_json::from_value(value.clone()).map_err(|_| invalid())?;
        if !valid_prompt(&args.prompt)
            || (value.get("library_reference_id").is_some()
                && (!references
                    || !args.library_reference_id.as_ref().is_some_and(|id| {
                        Uuid::parse_str(id).is_ok_and(|uuid| uuid.to_string() == *id)
                    })))
            || (value.get("attached_image").is_some()
                && (!attachment
                    || args.attached_image != Some(true)
                    || args.library_reference_id.is_some()))
        {
            return Err(invalid());
        }
        Ok(args)
    }
}

#[derive(Clone, Deserialize, Serialize, JsonRpcRequest)]
#[request(method = "_co.grida/media/generate-image", response = Reply)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    session_id: SessionId,
    call_id: BindingId,
    prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    background: Option<Background>,
    credential: CredentialWitness,
    #[serde(skip_serializing_if = "Option::is_none")]
    reference_png: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reference_origin: Option<ReferenceOrigin>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reference_path: Option<String>,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum ReferenceOrigin {
    Attachment,
    Workspace,
}

enum ImageReference {
    Library(String),
    Attachment(String),
    Workspace { png: String, path: String },
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct CredentialWitness {
    nonce: String,
    proof: String,
}

impl std::fmt::Debug for Request {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("DesktopImageGenerationRequest")
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonRpcResponse)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum Reply {
    Retained {
        id: String,
        media_type: String,
        bytes: u64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        sha256: Option<String>,
    },
    Unavailable,
    GeneratedUnretained,
    ReferenceDeclined,
    Uncertain,
}

impl Reply {
    fn outcome(
        self,
        placement_turn: Option<&TurnId>,
        reference: Option<ReferenceOrigin>,
    ) -> ToolOutcome {
        match self {
            Self::Retained {
                id,
                media_type,
                bytes,
                sha256,
            } if Uuid::parse_str(&id).is_ok_and(|parsed| parsed.to_string() == id)
                && matches!(
                    media_type.as_str(),
                    "image/png" | "image/jpeg" | "image/webp" | "image/gif"
                )
                && (1..=MAX_MEDIA_BYTES).contains(&bytes) =>
            {
                let mut structured = json!({"status":"retained", "id":id, "media_type":media_type, "bytes":bytes});
                let receipt = if let Some(turn) = placement_turn {
                    let Some(receipt) = sha256.and_then(|sha256| placement::Artifact::new(id.clone(), media_type.clone(), bytes, sha256).and_then(|artifact| artifact.receipt()).ok()) else {
                        return ToolOutcome::uncertain();
                    };
                    structured["source_turn_id"] = json!(turn);
                    Some(receipt)
                } else {
                    None
                };
                ToolOutcome {
                    status: OutcomeStatus::Succeeded,
                    content: vec![ResultContent::Text(format!(
                        "Generated an image and retained it in Desktop Recents (media item {id})."
                    ))],
                    structured: Some(structured),
                    receipt,
                    truncated: false,
                }
            }
            Self::GeneratedUnretained => ToolOutcome {
                status: OutcomeStatus::Uncertain,
                content: vec![ResultContent::Text("The provider generated an image, but Desktop could not retain a usable copy. Do not repeat this generation automatically.".into())],
                structured: Some(json!({"status":"generated_unretained"})),
                receipt: None,
                truncated: false,
            },
            Self::ReferenceDeclined if let Some(reference) = reference => {
                let source = match reference {
                    ReferenceOrigin::Attachment => "attached image",
                    ReferenceOrigin::Workspace => "captured workspace image",
                };
                let mut outcome = ToolOutcome::failed(&format!("The user declined sending the {source} to the image provider. Ask before attempting generation again or generating without it."));
                outcome.structured = Some(json!({"status":"reference_declined"}));
                outcome
            }
            Self::Unavailable => ToolOutcome::failed("desktop_image_generation_unavailable"),
            Self::Uncertain | Self::ReferenceDeclined | Self::Retained { .. } => ToolOutcome::uncertain(),
        }
    }
}

struct GenerateImage {
    dispatch: DispatchImage,
    reference: Option<ReferenceScope>,
    attachment: Option<AttachmentScope>,
}

#[derive(Clone)]
struct DispatchImage {
    session: SessionId,
    owner: DesktopImageGeneration,
    placement_turn: Option<TurnId>,
}

struct ReferenceScope {
    store: Arc<SqliteStore>,
    turn: TurnBinding,
    storage: Arc<RetainedInputs>,
    access: Arc<QuestionAccess>,
}

struct AttachmentScope {
    asset: AssetRef,
    storage: Arc<RetainedInputs>,
}

fn attachment_unavailable() -> agent_kit_core::Error {
    problem(
        ErrorKind::Unavailable,
        "image_generation_attachment_unavailable",
    )
}

impl AttachmentScope {
    async fn read(&self) -> Result<String> {
        read_png(self.storage.clone(), super::images::media(&self.asset)?).await
    }
}

async fn read_png(
    storage: Arc<RetainedInputs>,
    media: agent_kit_core::messages::MediaRef,
) -> Result<String> {
    let bytes = tokio::task::spawn_blocking(move || {
        storage.resolve(&media, super::images::MAX_IMAGE_BYTES)
    })
    .await
    .map_err(|_| reference_unavailable())??;
    Ok(STANDARD.encode(bytes))
}

fn reference_unavailable() -> agent_kit_core::Error {
    problem(
        ErrorKind::Unavailable,
        "image_generation_reference_unavailable",
    )
}

impl ReferenceScope {
    async fn read(&self, id: String) -> Result<String> {
        let binding = self.turn.clone();
        let access = self.access.clone();
        let media = self
            .store
            .inspect_turn_with(
                binding.session.clone(),
                binding.turn.clone(),
                move |state| {
                    if state.binding() != &binding
                        || state.outcome().is_some()
                        || !state.controls().admits_work()
                    {
                        return Err(reference_unavailable());
                    }
                    super::library::generation_reference(state, &id, &access)
                },
            )
            .await?;
        read_png(self.storage.clone(), media).await
    }
}

impl CapabilityExecutor for GenerateImage {
    fn validate(&self, arguments: &Value) -> Result<()> {
        Arguments::parse(
            arguments,
            self.reference.is_some(),
            self.attachment.is_some(),
        )
        .map(|_| ())
    }

    fn invoke(&self, call: CapabilityCall) -> BoxFuture<'_, CapabilityReply> {
        Box::pin(async move {
            let outcome = match Arguments::parse(
                &call.arguments,
                self.reference.is_some(),
                self.attachment.is_some(),
            ) {
                Ok(arguments) => self.generate(&call, arguments).await,
                Err(error) => ToolOutcome::failed(&error.code),
            };
            CapabilityReply {
                binding: call.binding,
                outcome,
            }
        })
    }
}

impl GenerateImage {
    async fn generate(&self, call: &CapabilityCall, arguments: Arguments) -> ToolOutcome {
        let reference = if arguments.attached_image == Some(true) {
            let Some(scope) = &self.attachment else {
                return ToolOutcome::failed("image_generation_attachment_unavailable");
            };
            let resolved = tokio::select! {
                biased;
                () = call.cancellation.cancelled() => Err(attachment_unavailable()),
                result = scope.read() => result,
            };
            match resolved {
                Ok(png) => Some(ImageReference::Attachment(png)),
                Err(_) => return ToolOutcome::failed("image_generation_attachment_unavailable"),
            }
        } else if let Some(id) = arguments.library_reference_id {
            let Some(scope) = &self.reference else {
                return ToolOutcome::failed("image_generation_reference_unavailable");
            };
            let resolved = tokio::select! {
                biased;
                () = call.cancellation.cancelled() => Err(reference_unavailable()),
                result = scope.read(id) => result,
            };
            match resolved {
                Ok(png) => Some(ImageReference::Library(png)),
                Err(_) => return ToolOutcome::failed("image_generation_reference_unavailable"),
            }
        } else {
            None
        };
        self.dispatch
            .generate(call, arguments.prompt, arguments.background, reference)
            .await
    }
}

impl DispatchImage {
    async fn generate(
        &self,
        call: &CapabilityCall,
        prompt: String,
        background: Option<Background>,
        reference: Option<ImageReference>,
    ) -> ToolOutcome {
        let nonce = Uuid::new_v4().simple().to_string();
        let proof = tokio::select! {
            biased;
            () = call.cancellation.cancelled() => None,
            result = self.owner.transport.desktop_image_credential_proof(&nonce) => result.ok(),
        };
        let Some(proof) =
            proof.filter(|_| !call.cancellation.is_cancelled() && call.deadline > Instant::now())
        else {
            return ToolOutcome::failed("desktop_image_generation_unavailable");
        };
        let client = self
            .owner
            .connection
            .lock()
            .unwrap()
            .as_ref()
            .filter(|connection| {
                let allowed = match &reference {
                    Some(ImageReference::Library(_)) => connection.references,
                    Some(ImageReference::Attachment(_)) => connection.attachment_references,
                    Some(ImageReference::Workspace { .. }) => connection.workspace_references,
                    None => true,
                };
                allowed && (self.placement_turn.is_none() || connection.placement)
            })
            .map(|connection| connection.client.clone());
        let Some(connection) = client else {
            return ToolOutcome::failed("desktop_image_generation_unavailable");
        };
        let (reference_png, reference_origin, reference_path) = match reference {
            Some(ImageReference::Library(png)) => (Some(png), None, None),
            Some(ImageReference::Attachment(png)) => {
                (Some(png), Some(ReferenceOrigin::Attachment), None)
            }
            Some(ImageReference::Workspace { png, path }) => {
                (Some(png), Some(ReferenceOrigin::Workspace), Some(path))
            }
            None => (None, None, None),
        };
        let request = Request {
            session_id: self.session.clone(),
            call_id: call.binding.id.clone(),
            prompt,
            background,
            credential: CredentialWitness { nonce, proof },
            reference_png,
            reference_origin,
            reference_path,
        };
        tokio::select! {
            biased;
            () = call.cancellation.cancelled() => ToolOutcome::uncertain(),
            reply = connection.send_request(request).block_task() => {
                reply.map_or_else(|_| ToolOutcome::uncertain(), |reply| reply.outcome(self.placement_turn.as_ref(), reference_origin))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_bounded_prompt_and_background_intent() {
        let accepted = Arguments::parse(
            &json!({"prompt":"Build a tile", "background":"transparent"}),
            false,
            false,
        )
        .unwrap();
        let request = Request {
            session_id: SessionId::new("fixture-session").unwrap(),
            call_id: BindingId::new("fixture-call").unwrap(),
            prompt: accepted.prompt,
            background: accepted.background,
            credential: CredentialWitness {
                nonce: "a".repeat(32),
                proof: "b".repeat(64),
            },
            reference_png: None,
            reference_origin: None,
            reference_path: None,
        };
        assert_eq!(
            serde_json::to_value(request).unwrap(),
            json!({"sessionId":"fixture-session", "callId":"fixture-call", "prompt":"Build a tile", "background":"transparent", "credential":{"nonce":"a".repeat(32),"proof":"b".repeat(64)}})
        );
        for input in [
            json!({"prompt":"  "}),
            json!({"prompt":"é".repeat(MAX_PROMPT_BYTES / 2 + 1)}),
            json!({"prompt":"Build a tile", "background":"inherit"}),
            json!({"prompt":"Build a tile", "model":"other"}),
            json!({"prompt":"Build a tile", "references":["/tmp/reference.png"]}),
        ] {
            assert!(Arguments::parse(&input, false, false).is_err());
        }
    }

    #[test]
    fn reference_requires_negotiated_authority_and_a_canonical_catalog_id() {
        let id = "d365c5fb-5833-48e9-a081-ae6d52c9b49c";
        let args = json!({"prompt":"Use this selected image", "library_reference_id":id});
        assert!(Arguments::parse(&args, false, false).is_err());
        assert_eq!(
            Arguments::parse(&args, true, false)
                .unwrap()
                .library_reference_id
                .as_deref(),
            Some(id)
        );
        for invalid in [
            json!(null),
            json!(id.to_uppercase()),
            json!("https://example.com/image.png"),
            json!("/workspace/image.png"),
        ] {
            let args = json!({"prompt":"Use this selected image", "library_reference_id":invalid});
            assert!(Arguments::parse(&args, true, false).is_err());
        }
    }

    #[test]
    fn attachment_reference_requires_the_exact_current_input_and_explicit_source_choice() {
        let session = SessionId::new("fixture-session").unwrap();
        let asset: AssetRef = serde_json::from_value(json!({
            "owner":session, "id":"input/fixture", "name":super::super::images::NAME,
            "version":1, "size":128, "digest":([7_u8;32]),
        }))
        .unwrap();
        let part = || PromptPart::RetainedImage {
            asset: asset.clone(),
        };
        assert_eq!(attached_image(&[part()], &session), Some(&asset));
        assert!(attached_image(&[part(), part()], &session).is_none());
        assert!(attached_image(&[part()], &SessionId::new("foreign").unwrap()).is_none());
        let use_attachment = json!({"prompt":"Use this attached image", "attached_image":true});
        assert!(Arguments::parse(&use_attachment, false, true).is_ok());
        assert!(Arguments::parse(&use_attachment, true, false).is_err());
        for extra in [
            json!({"attached_image":false}),
            json!({"attached_image":null}),
            json!({"attached_image":true, "library_reference_id":"d365c5fb-5833-48e9-a081-ae6d52c9b49c"}),
        ] {
            let mut args = json!({"prompt":"Use this attached image"});
            args.as_object_mut()
                .unwrap()
                .extend(extra.as_object().unwrap().clone());
            assert!(Arguments::parse(&args, true, true).is_err());
        }
        let denial = Reply::ReferenceDeclined.outcome(None, Some(ReferenceOrigin::Attachment));
        assert_eq!(denial.status, OutcomeStatus::Failed);
        assert_eq!(
            denial.structured,
            Some(json!({"status":"reference_declined"}))
        );
        assert_eq!(
            Reply::ReferenceDeclined.outcome(None, None).status,
            OutcomeStatus::Uncertain
        );
    }

    #[test]
    fn preserves_generation_and_retention_as_separate_outcomes() {
        let id = "d365c5fb-5833-48e9-a081-ae6d52c9b49c";
        let accepted = serde_json::from_value::<Reply>(
            json!({"kind":"retained", "id":id, "mediaType":"image/png", "bytes":128}),
        )
        .unwrap()
        .outcome(None, None);
        assert_eq!(accepted.status, OutcomeStatus::Succeeded);
        assert_eq!(
            accepted.structured,
            Some(json!({"status":"retained", "id":id, "media_type":"image/png", "bytes":128}))
        );
        let unretained = serde_json::from_value::<Reply>(json!({"kind":"generated_unretained"}))
            .unwrap()
            .outcome(None, None);
        assert_eq!(unretained.status, OutcomeStatus::Uncertain);
        assert_eq!(
            unretained.structured,
            Some(json!({"status":"generated_unretained"}))
        );
        for reply in [
            json!({"kind":"retained", "id":"not-a-receipt", "mediaType":"image/png", "bytes":128}),
            json!({"kind":"retained", "id":id, "mediaType":"text/plain", "bytes":128}),
            json!({"kind":"retained", "id":id, "mediaType":"image/png", "bytes":MAX_MEDIA_BYTES + 1}),
            json!({"kind":"uncertain"}),
        ] {
            assert_eq!(
                serde_json::from_value::<Reply>(reply)
                    .unwrap()
                    .outcome(None, None)
                    .status,
                OutcomeStatus::Uncertain
            );
        }
    }
}
