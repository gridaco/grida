//! GRIDA-SEC-004 — paid image generation stays with the captured Desktop owner.

use super::{
    Credential, Execution, Host, host_tools::HostTools, problem, questions::QuestionAccess,
    retained_inputs::RetainedInputs,
};
use crate::http::HttpTransport;
use crate::tool_host::{
    CapabilityCall, CapabilityDefinition, CapabilityEffect, CapabilityExecutor, CapabilityReply,
    ToolHost,
};
use agent_client_protocol::v1::ConnectionTo;
use agent_client_protocol::{Client, JsonRpcRequest, JsonRpcResponse};
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{OutcomeStatus, ResultContent};
use agent_kit_core::tools::{RecoveryKind, ToolDefinition, ToolOutcome};
use agent_kit_core::turn::{OperationInput, OperationOutcome, TurnBinding, TurnState};
use agent_kit_core::{BindingId, BoxFuture, ErrorKind, Result, SessionId, ToolId};
use agent_kit_store_sqlite::SqliteStore;
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use uuid::Uuid;

pub(crate) const CAPABILITY: &str = "co.grida/media/generate-image";
pub(crate) const REFERENCE_CAPABILITY: &str = "co.grida/media/image-reference";
pub(super) const TOOL: &str = "generate_image";
pub(super) const PRINCIPAL: &str = "desktop-image-generation";
const MAX_PROMPT_BYTES: usize = 8 * 1024;
const MAX_MEDIA_BYTES: u64 = 64 * 1024 * 1024;
const TEXT_VERSION: u32 = 1;
const REFERENCE_VERSION: u32 = 2;

pub(super) fn summary_note(state: &TurnState) -> Option<&'static str> {
    let mut retained = false;
    let mut unretained = false;
    for operation in state.operations().values() {
        let OperationInput::Tool(invocation) = &operation.record.input else {
            continue;
        };
        let grants = &operation.record.grants;
        if invocation.definition().id.as_str() != TOOL
            || !matches!(
                invocation.definition().version,
                TEXT_VERSION | REFERENCE_VERSION
            )
            || grants.authority.principal.as_str() != PRINCIPAL
            || grants.authority.scope.as_str() != state.binding().turn.as_str()
            || !matches!(grants.grants.as_slice(), [grant] if grant.as_str() == TOOL)
            || operation.attempts.is_empty()
        {
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
}

pub(super) struct Prepared {
    owner: DesktopImageGeneration,
    references: bool,
}

impl Prepared {
    pub(super) fn bind(
        self,
        store: Arc<SqliteStore>,
        execution: &Execution,
        turn: &TurnBinding,
    ) -> Result<Arc<HostTools>> {
        let reference = if self.references {
            Some(ReferenceScope {
                store,
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
        let tool = self.owner.tool_host(turn.session.clone(), reference)?;
        Ok(Arc::new(HostTools::image_generation(
            tool,
            self.owner.binding,
        )?))
    }
}

impl Host {
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
    pub(crate) fn attach(&self, client: ConnectionTo<Client>, references: bool) {
        *self.connection.lock().unwrap() = Some(DesktopConnection { client, references });
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

    pub(super) fn prepare(&self, references: bool) -> Result<Prepared> {
        if references && !self.references() {
            return Err(reference_unavailable());
        }
        Ok(Prepared {
            owner: self.clone(),
            references,
        })
    }

    fn tool_host(&self, session: SessionId, reference: Option<ReferenceScope>) -> Result<ToolHost> {
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
        let definition = CapabilityDefinition {
            tool: ToolDefinition {
                id: ToolId::new(TOOL)?,
                version: if reference.is_some() {
                    REFERENCE_VERSION
                } else {
                    TEXT_VERSION
                },
                description,
                input: InputFormat::Json(json!({
                    "type": "object",
                    "properties": properties,
                    "required": ["prompt"],
                    "additionalProperties": false
                })),
                max_input_bytes: MAX_PROMPT_BYTES * 6 + 128,
                max_output_bytes: 1024,
                recovery: RecoveryKind::Unavailable,
            },
            output_schema: json!({
                "type": "object",
                "properties": {
                    "status": {"enum": ["retained", "generated_unretained"]},
                    "id": {"type": "string"},
                    "media_type": {"type": "string"},
                    "bytes": {"type": "integer"}
                },
                "required": ["status"],
                "additionalProperties": false
            }),
            effect: CapabilityEffect::Mutation,
        };
        let executor = Arc::new(GenerateImage {
            session,
            owner: self.clone(),
            reference,
        }) as Arc<dyn CapabilityExecutor>;
        ToolHost::new([(definition, executor)])
    }
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
}

impl Arguments {
    fn parse(value: &Value, references: bool) -> Result<Self> {
        let invalid = || {
            problem(
                ErrorKind::InvalidInput,
                "invalid_image_generation_arguments",
            )
        };
        let args: Self = serde_json::from_value(value.clone()).map_err(|_| invalid())?;
        if args.prompt.trim().is_empty()
            || args.prompt.len() > MAX_PROMPT_BYTES
            || (value.get("library_reference_id").is_some()
                && (!references
                    || !args.library_reference_id.as_ref().is_some_and(|id| {
                        Uuid::parse_str(id).is_ok_and(|uuid| uuid.to_string() == *id)
                    })))
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
    },
    Unavailable,
    GeneratedUnretained,
    Uncertain,
}

impl Reply {
    fn outcome(self) -> ToolOutcome {
        match self {
            Self::Retained {
                id,
                media_type,
                bytes,
            } if Uuid::parse_str(&id).is_ok_and(|parsed| parsed.to_string() == id)
                && matches!(
                    media_type.as_str(),
                    "image/png" | "image/jpeg" | "image/webp" | "image/gif"
                )
                && (1..=MAX_MEDIA_BYTES).contains(&bytes) =>
            {
                ToolOutcome {
                    status: OutcomeStatus::Succeeded,
                    content: vec![ResultContent::Text(format!(
                        "Generated an image and retained it in Desktop Recents (media item {id})."
                    ))],
                    structured: Some(
                        json!({"status":"retained", "id":id, "media_type":media_type, "bytes":bytes}),
                    ),
                    receipt: None,
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
            Self::Unavailable => ToolOutcome::failed("desktop_image_generation_unavailable"),
            Self::Uncertain | Self::Retained { .. } => ToolOutcome::uncertain(),
        }
    }
}

struct GenerateImage {
    session: SessionId,
    owner: DesktopImageGeneration,
    reference: Option<ReferenceScope>,
}

struct ReferenceScope {
    store: Arc<SqliteStore>,
    turn: TurnBinding,
    storage: Arc<RetainedInputs>,
    access: Arc<QuestionAccess>,
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
        let storage = self.storage.clone();
        let bytes = tokio::task::spawn_blocking(move || {
            storage.resolve(&media, super::images::MAX_IMAGE_BYTES)
        })
        .await
        .map_err(|_| reference_unavailable())??;
        Ok(STANDARD.encode(bytes))
    }
}

impl CapabilityExecutor for GenerateImage {
    fn validate(&self, arguments: &Value) -> Result<()> {
        Arguments::parse(arguments, self.reference.is_some()).map(|_| ())
    }

    fn invoke(&self, call: CapabilityCall) -> BoxFuture<'_, CapabilityReply> {
        Box::pin(async move {
            let outcome = match Arguments::parse(&call.arguments, self.reference.is_some()) {
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
        let reference_png = if let Some(id) = arguments.library_reference_id {
            let Some(scope) = &self.reference else {
                return ToolOutcome::failed("image_generation_reference_unavailable");
            };
            let resolved = tokio::select! {
                biased;
                () = call.cancellation.cancelled() => Err(reference_unavailable()),
                result = scope.read(id) => result,
            };
            match resolved {
                Ok(png) => Some(png),
                Err(_) => return ToolOutcome::failed("image_generation_reference_unavailable"),
            }
        } else {
            None
        };
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
            .filter(|connection| reference_png.is_none() || connection.references)
            .map(|connection| connection.client.clone());
        let Some(connection) = client else {
            return ToolOutcome::failed("desktop_image_generation_unavailable");
        };
        let request = Request {
            session_id: self.session.clone(),
            call_id: call.binding.id.clone(),
            prompt: arguments.prompt,
            background: arguments.background,
            credential: CredentialWitness { nonce, proof },
            reference_png,
        };
        tokio::select! {
            biased;
            () = call.cancellation.cancelled() => ToolOutcome::uncertain(),
            reply = connection.send_request(request).block_task() => {
                reply.map_or_else(|_| ToolOutcome::uncertain(), Reply::outcome)
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
            assert!(Arguments::parse(&input, false).is_err());
        }
    }

    #[test]
    fn reference_requires_negotiated_authority_and_a_canonical_catalog_id() {
        let id = "d365c5fb-5833-48e9-a081-ae6d52c9b49c";
        let args = json!({"prompt":"Use this selected image", "library_reference_id":id});
        assert!(Arguments::parse(&args, false).is_err());
        assert_eq!(
            Arguments::parse(&args, true)
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
            assert!(Arguments::parse(&args, true).is_err());
        }
    }

    #[test]
    fn preserves_generation_and_retention_as_separate_outcomes() {
        let id = "d365c5fb-5833-48e9-a081-ae6d52c9b49c";
        let accepted = serde_json::from_value::<Reply>(
            json!({"kind":"retained", "id":id, "mediaType":"image/png", "bytes":128}),
        )
        .unwrap()
        .outcome();
        assert_eq!(accepted.status, OutcomeStatus::Succeeded);
        assert_eq!(
            accepted.structured,
            Some(json!({"status":"retained", "id":id, "media_type":"image/png", "bytes":128}))
        );
        let unretained = serde_json::from_value::<Reply>(json!({"kind":"generated_unretained"}))
            .unwrap()
            .outcome();
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
                    .outcome()
                    .status,
                OutcomeStatus::Uncertain
            );
        }
    }
}
