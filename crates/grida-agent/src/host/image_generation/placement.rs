//! GRIDA-SEC-004 — publish one exact retained image through the reviewed workspace owner.

use super::*;
use agent_kit_core::Envelope;

pub(crate) const CAPABILITY: &str = "co.grida/media/place-image";
pub(in crate::host) const TOOL: &str = "place_generated_image";
const RECEIPT_SCHEMA: &str = "grida.agent.generated-image";
const MAX_PATH_BYTES: usize = 1024;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Artifact {
    id: String,
    media_type: String,
    bytes: u64,
    sha256: String,
}

impl Artifact {
    pub(super) fn new(id: String, media_type: String, bytes: u64, sha256: String) -> Result<Self> {
        let artifact = Self {
            id,
            media_type,
            bytes,
            sha256,
        };
        artifact.verify()?;
        Ok(artifact)
    }

    fn verify(&self) -> Result<()> {
        if !canonical_id(&self.id)
            || !matches!(
                self.media_type.as_str(),
                "image/png" | "image/jpeg" | "image/webp" | "image/gif"
            )
            || !(1..=MAX_MEDIA_BYTES).contains(&self.bytes)
            || self.sha256.len() != 64
            || !self
                .sha256
                .bytes()
                .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
        {
            return Err(source_unavailable());
        }
        Ok(())
    }

    pub(super) fn receipt(&self) -> Result<Envelope> {
        super::super::encode(RECEIPT_SCHEMA, 1, self)
    }

    fn from_outcome(outcome: &ToolOutcome, turn: &TurnId) -> Option<Self> {
        if outcome.status != OutcomeStatus::Succeeded || outcome.truncated {
            return None;
        }
        let receipt = crate::tool_host::verified_owner_receipt(outcome)?;
        if receipt.schema().as_str() != RECEIPT_SCHEMA || receipt.version() != 1 {
            return None;
        }
        let artifact: Self = serde_json::from_slice(receipt.bytes()).ok()?;
        artifact.verify().ok()?;
        let result = outcome.structured.as_ref()?;
        (result["status"] == "retained"
            && result["id"] == artifact.id
            && result["media_type"] == artifact.media_type
            && result["bytes"] == artifact.bytes
            && result["source_turn_id"] == turn.as_str())
        .then_some(artifact)
    }
}

fn source_unavailable() -> agent_kit_core::Error {
    problem(ErrorKind::Unavailable, "image_placement_source_unavailable")
}

fn canonical_id(id: &str) -> bool {
    Uuid::parse_str(id).is_ok_and(|uuid| uuid.to_string() == id)
}

fn source_artifact(state: &TurnState, id: &str) -> Result<Artifact> {
    let mut candidates = state.operations().values().filter_map(|operation| {
        if !matches!(
            generation_operation(state, operation),
            Some(PLACEABLE_TEXT_VERSION | PLACEABLE_REFERENCE_VERSION)
        ) {
            return None;
        }
        let OperationOutcome::Tool(outcome) = operation.outcome()? else {
            return None;
        };
        Artifact::from_outcome(outcome, &state.binding().turn).filter(|artifact| artifact.id == id)
    });
    let artifact = candidates.next().ok_or_else(source_unavailable)?;
    if candidates.next().is_some() {
        return Err(source_unavailable());
    }
    Ok(artifact)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Arguments {
    media_id: String,
    path: String,
    source_turn_id: Option<TurnId>,
}

impl Arguments {
    fn parse(value: &Value) -> Result<Self> {
        let invalid = || problem(ErrorKind::InvalidInput, "invalid_image_placement_arguments");
        let arguments: Self = serde_json::from_value(value.clone()).map_err(|_| invalid())?;
        if !canonical_id(&arguments.media_id)
            || arguments.path.len() > MAX_PATH_BYTES
            || arguments.path.contains('\\')
            || arguments.path.chars().any(char::is_control)
            || arguments
                .path
                .split('/')
                .any(|part| matches!(part, "" | "." | ".."))
            || (value.get("source_turn_id").is_some() && arguments.source_turn_id.is_none())
        {
            return Err(invalid());
        }
        Ok(arguments)
    }
}

#[derive(Clone, Deserialize, Serialize, JsonRpcRequest)]
#[request(method = "_co.grida/media/place-image", response = Reply)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    session_id: SessionId,
    turn_id: TurnId,
    call_id: BindingId,
    path: String,
    artifact: Artifact,
}

impl std::fmt::Debug for Request {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("DesktopImagePlacementRequest")
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonRpcResponse)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
enum Reply {
    Published,
    AlreadyPresent,
    Declined,
    Conflict,
    Unavailable,
    Uncertain,
}

impl Reply {
    fn outcome(self, path: &str) -> ToolOutcome {
        match self {
            Self::Published | Self::AlreadyPresent => {
                let (status, text) = match self {
                    Self::Published => ("published", "Placed the retained image in the workspace"),
                    _ => (
                        "already_present",
                        "The exact retained image is already at the workspace destination",
                    ),
                };
                ToolOutcome {
                    status: OutcomeStatus::Succeeded,
                    content: vec![ResultContent::Text(text.into())],
                    structured: Some(json!({"status":status, "path":path})),
                    receipt: None,
                    truncated: false,
                }
            }
            Self::Declined => ToolOutcome::failed("image_placement_declined"),
            Self::Conflict => ToolOutcome::failed("image_placement_conflict"),
            Self::Unavailable => ToolOutcome::failed("image_placement_unavailable"),
            Self::Uncertain => ToolOutcome::uncertain(),
        }
    }
}

struct PlaceImage {
    owner: DesktopImageGeneration,
    store: Arc<SqliteStore>,
    turn: TurnBinding,
}

pub(super) fn tool(
    owner: DesktopImageGeneration,
    store: Arc<SqliteStore>,
    turn: TurnBinding,
) -> Result<(CapabilityDefinition, Arc<dyn CapabilityExecutor>)> {
    let definition = CapabilityDefinition {
        tool: ToolDefinition {
            id: ToolId::new(TOOL)?,
            version: 1,
            description: "Ask the user to place one already generated image in the workspace at a relative destination. Supply its media_id and the exact source_turn_id for an image generated in an earlier turn. An existing different file cannot be overwritten. To retry placement, use the same media, source turn and destination. Do not generate the image again.".into(),
            input: InputFormat::Json(json!({
                "type":"object",
                "properties":{
                    "media_id":{"type":"string", "format":"uuid"},
                    "path":{"type":"string", "minLength":1, "maxLength":MAX_PATH_BYTES},
                    "source_turn_id":{"type":"string", "minLength":1, "maxLength":256}
                },
                "required":["media_id","path"],
                "additionalProperties":false
            })),
            max_input_bytes: MAX_PATH_BYTES * 6 + 1024,
            max_output_bytes: MAX_PATH_BYTES * 6 + 512,
            recovery: RecoveryKind::Unavailable,
        },
        output_schema: json!({
            "type":"object",
            "properties":{"status":{"enum":["published","already_present"]},"path":{"type":"string"}},
            "required":["status","path"],
            "additionalProperties":false
        }),
        effect: CapabilityEffect::Mutation,
    };
    Ok((definition, Arc::new(PlaceImage { owner, store, turn })))
}

impl PlaceImage {
    async fn source(&self, turn: TurnId, id: String) -> Result<Artifact> {
        let active = self.turn.clone();
        let same_turn = active.turn == turn;
        if !same_turn {
            let current = active.clone();
            self.store
                .inspect_turn_with(
                    current.session.clone(),
                    current.turn.clone(),
                    move |state| {
                        if state.binding() != &current
                            || state.outcome().is_some()
                            || !state.controls().admits_work()
                        {
                            return Err(source_unavailable());
                        }
                        Ok(())
                    },
                )
                .await?;
        }
        self.store
            .inspect_turn_with(active.session.clone(), turn.clone(), move |state| {
                if state.binding().session != active.session
                    || state.binding().turn != turn
                    || (same_turn
                        && (state.binding() != &active
                            || state.outcome().is_some()
                            || !state.controls().admits_work()))
                    || (!same_turn && state.outcome().is_none())
                {
                    return Err(source_unavailable());
                }
                source_artifact(state, &id)
            })
            .await
    }

    async fn place(&self, call: &CapabilityCall, arguments: Arguments) -> ToolOutcome {
        let source = arguments
            .source_turn_id
            .unwrap_or_else(|| self.turn.turn.clone());
        let artifact = tokio::select! {
            biased;
            () = call.cancellation.cancelled() => Err(source_unavailable()),
            result = self.source(source, arguments.media_id) => result,
        };
        let Ok(artifact) = artifact else {
            return ToolOutcome::failed("image_placement_source_unavailable");
        };
        if call.cancellation.is_cancelled() || call.deadline <= Instant::now() {
            return ToolOutcome::failed("image_placement_unavailable");
        }
        let client = self
            .owner
            .connection
            .lock()
            .unwrap()
            .as_ref()
            .filter(|connection| connection.placement)
            .map(|connection| connection.client.clone());
        let Some(client) = client else {
            return ToolOutcome::failed("image_placement_unavailable");
        };
        let request = Request {
            session_id: self.turn.session.clone(),
            turn_id: self.turn.turn.clone(),
            call_id: call.binding.id.clone(),
            path: arguments.path.clone(),
            artifact,
        };
        tokio::select! {
            biased;
            () = call.cancellation.cancelled() => ToolOutcome::uncertain(),
            reply = client.send_request(request).block_task() => {
                reply.map_or_else(|_| ToolOutcome::uncertain(), |reply| reply.outcome(&arguments.path))
            }
        }
    }
}

impl CapabilityExecutor for PlaceImage {
    fn validate(&self, arguments: &Value) -> Result<()> {
        Arguments::parse(arguments).map(|_| ())
    }

    fn invoke(&self, call: CapabilityCall) -> BoxFuture<'_, CapabilityReply> {
        Box::pin(async move {
            let outcome = match Arguments::parse(&call.arguments) {
                Ok(arguments) => self.place(&call, arguments).await,
                Err(error) => ToolOutcome::failed(&error.code),
            };
            CapabilityReply {
                binding: call.binding,
                outcome,
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::super::Reply as GenerateReply;
    use super::*;

    const ID: &str = "d365c5fb-5833-48e9-a081-ae6d52c9b49c";

    #[test]
    fn placement_accepts_only_a_retained_id_and_relative_destination() {
        let allowed =
            json!({"media_id":ID,"path":"assets/banner.png","source_turn_id":"generation-turn"});
        let arguments = Arguments::parse(&allowed).unwrap();
        assert_eq!(arguments.path, "assets/banner.png");
        assert_eq!(
            arguments.source_turn_id.unwrap().as_str(),
            "generation-turn"
        );
        for path in [
            "",
            "/image.png",
            "assets/../image.png",
            "assets/./image.png",
            "assets//image.png",
            "assets\\image.png",
            "assets/image\n.png",
        ] {
            assert!(Arguments::parse(&json!({"media_id":ID,"path":path})).is_err());
        }
        assert!(
            Arguments::parse(&json!({"media_id":ID,"path":"image.png","sha256":"caller supplied"}))
                .is_err()
        );
    }

    #[test]
    fn placeable_generation_requires_verified_private_evidence_without_exposing_digest() {
        let turn = TurnId::new("generation-turn").unwrap();
        let digest = "b".repeat(64);
        let reply = GenerateReply::Retained {
            id: ID.into(),
            media_type: "image/png".into(),
            bytes: 128,
            sha256: Some(digest.clone()),
        };
        let mut result = reply.clone().outcome(Some(&turn));
        assert_eq!(result.status, OutcomeStatus::Succeeded);
        assert_eq!(
            result.structured.as_ref().unwrap()["source_turn_id"],
            turn.as_str()
        );
        assert!(
            !result
                .structured
                .as_ref()
                .unwrap()
                .to_string()
                .contains(&digest)
        );
        let owner_receipt = result.receipt.take().unwrap();
        let wrapper = |reply_verified: bool| {
            crate::host::encode("grida.agent.tool-host.call", 1, &json!({
                "binding":{"id":"call","endpoint":"owner"}, "reply_verified":reply_verified, "owner_receipt":owner_receipt
            })).unwrap()
        };
        result.receipt = Some(wrapper(false));
        assert!(Artifact::from_outcome(&result, &turn).is_none());
        result.receipt = Some(wrapper(true));
        assert_eq!(
            Artifact::from_outcome(&result, &turn).unwrap().sha256,
            digest
        );
        assert!(Artifact::from_outcome(&result, &TurnId::new("wrong-turn").unwrap()).is_none());
        assert_eq!(reply.outcome(None).receipt, None);
    }
}
