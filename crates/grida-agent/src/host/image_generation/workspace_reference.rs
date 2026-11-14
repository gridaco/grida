//! GRIDA-SEC-004 — resolve an exact same-turn capture before asking Desktop to transfer it.

use super::*;
use crate::file_tools::{
    CAPTURE_IMAGE_REFERENCE, WORKSPACE_IMAGE_REFERENCE_SCHEMA, workspace_reference_path,
};
use crate::host::{images, retained_inputs::WORKSPACE_REFERENCE};
use agent_kit_core::OperationId;
use agent_kit_core::messages::{MediaRef, ToolArguments};

pub(crate) const CAPABILITY: &str = "co.grida/media/workspace-reference";
pub(in crate::host) const TOOL: &str = "generate_image_from_workspace_reference";
pub(super) const VERSION: u32 = 1;
pub(super) const PLACEABLE_VERSION: u32 = 2;

pub(in crate::host) fn unavailable() -> agent_kit_core::Error {
    problem(
        ErrorKind::Unavailable,
        "workspace_image_reference_unavailable",
    )
}

pub(super) struct Scope {
    store: Arc<SqliteStore>,
    turn: TurnBinding,
    storage: Arc<RetainedInputs>,
    grant: GrantSelection,
}

impl Scope {
    pub(super) fn new(
        store: Arc<SqliteStore>,
        turn: TurnBinding,
        storage: Arc<RetainedInputs>,
        grant: GrantSelection,
    ) -> Self {
        Self {
            store,
            turn,
            storage,
            grant,
        }
    }

    async fn read(&self, id: OperationId) -> Result<ImageReference> {
        let turn = self.turn.clone();
        let grant = self.grant.clone();
        let (path, media) = self
            .store
            .inspect_turn_with(turn.session.clone(), turn.turn.clone(), move |state| {
                if state.binding() != &turn
                    || state.outcome().is_some()
                    || !state.controls().admits_work()
                {
                    return Err(unavailable());
                }
                let operation = state.operations().get(&id).ok_or_else(unavailable)?;
                source(operation, &id, &turn.session, &grant).ok_or_else(unavailable)
            })
            .await?;
        let png = read_png(self.storage.clone(), media).await?;
        Ok(ImageReference::Workspace { png, path })
    }
}

fn source(
    operation: &OperationState,
    id: &OperationId,
    session: &SessionId,
    grant: &GrantSelection,
) -> Option<(String, MediaRef)> {
    let OperationInput::Tool(invocation) = &operation.record.input else {
        return None;
    };
    if operation.record.id != *id
        || invocation.id() != id
        || invocation.definition().id.as_str() != CAPTURE_IMAGE_REFERENCE
        || invocation.definition().version != 1
        || operation.record.grants != *grant
        || operation.attempts.is_empty()
    {
        return None;
    }
    let OperationOutcome::Tool(outcome) = operation.outcome()? else {
        return None;
    };
    if outcome.status != OutcomeStatus::Succeeded || outcome.truncated {
        return None;
    }
    let ToolArguments::Json(arguments) = invocation.arguments() else {
        return None;
    };
    let arguments = arguments.as_object()?;
    let path = arguments.get("path")?.as_str()?;
    let details = outcome.structured.as_ref()?.as_object()?;
    if arguments.len() != 1
        || !workspace_reference_path(path)
        || details.len() != 2
        || details.get("path")?.as_str()? != path
        || details.get("reference_id")?.as_str()? != id.as_str()
    {
        return None;
    }
    let receipt = outcome.receipt.as_ref()?;
    if receipt.schema().as_str() != WORKSPACE_IMAGE_REFERENCE_SCHEMA
        || receipt.version() != 1
        || receipt.bytes().len() > 2048
    {
        return None;
    }
    let media: MediaRef = serde_json::from_slice(receipt.bytes()).ok()?;
    let asset = images::asset_ref(&media).ok()?;
    (asset.owner() == session
        && asset.id().as_str().starts_with(WORKSPACE_REFERENCE)
        && (1..=images::MAX_IMAGE_BYTES as u64).contains(&asset.size()))
    .then(|| (path.to_owned(), media))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Arguments {
    prompt: String,
    background: Option<Background>,
    workspace_reference_id: OperationId,
}

impl Arguments {
    fn parse(value: &Value) -> Result<Self> {
        let invalid = || {
            problem(
                ErrorKind::InvalidInput,
                "invalid_workspace_image_generation_arguments",
            )
        };
        let arguments: Self = serde_json::from_value(value.clone()).map_err(|_| invalid())?;
        if !valid_prompt(&arguments.prompt) {
            return Err(invalid());
        }
        Ok(arguments)
    }
}

struct Generate {
    source: Scope,
    dispatch: DispatchImage,
}

pub(super) fn tool(
    source: Scope,
    dispatch: DispatchImage,
) -> Result<(CapabilityDefinition, Arc<dyn CapabilityExecutor>)> {
    let placement = dispatch.placement_turn.is_some();
    let mut description = String::from(
        "Generate one image using a workspace PNG captured earlier in this turn with capture_image_reference. Use its reference_id as workspace_reference_id. Desktop asks before sending the captured PNG to the image provider. If the user declines, ask before another attempt or generating without it. A retained result is available in Desktop Recents. Do not repeat a request whose generation or retention is unconfirmed.",
    );
    if placement {
        description.push_str(" To place a retained image in the workspace, use place_generated_image with its media ID and source turn.");
    }
    let definition = CapabilityDefinition {
        tool: ToolDefinition {
            id: ToolId::new(TOOL)?,
            version: if placement {
                PLACEABLE_VERSION
            } else {
                VERSION
            },
            description,
            input: InputFormat::Json(json!({
                "type": "object",
                "properties": {
                    "prompt": {"type": "string", "minLength": 1, "maxLength": MAX_PROMPT_BYTES},
                    "background": {"enum": ["auto", "opaque", "transparent"]},
                    "workspace_reference_id": {"type": "string", "minLength": 1, "maxLength": 256}
                },
                "required": ["prompt", "workspace_reference_id"],
                "additionalProperties": false
            })),
            max_input_bytes: MAX_PROMPT_BYTES * 6 + 1024,
            max_output_bytes: if placement { 4096 } else { 1024 },
            recovery: RecoveryKind::Unavailable,
        },
        output_schema: generation_output_schema(true),
        effect: CapabilityEffect::Mutation,
    };
    Ok((definition, Arc::new(Generate { source, dispatch })))
}

impl CapabilityExecutor for Generate {
    fn validate(&self, arguments: &Value) -> Result<()> {
        Arguments::parse(arguments).map(|_| ())
    }

    fn invoke(&self, call: CapabilityCall) -> BoxFuture<'_, CapabilityReply> {
        Box::pin(async move {
            let outcome = match Arguments::parse(&call.arguments) {
                Ok(arguments) => {
                    let resolved = tokio::select! {
                        biased;
                        () = call.cancellation.cancelled() => Err(unavailable()),
                        result = self.source.read(arguments.workspace_reference_id) => result,
                    };
                    match resolved {
                        Ok(reference) => {
                            self.dispatch
                                .generate(
                                    &call,
                                    arguments.prompt,
                                    arguments.background,
                                    Some(reference),
                                )
                                .await
                        }
                        Err(_) => ToolOutcome::failed(&unavailable().code),
                    }
                }
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
    use super::*;
    use agent_kit_core::authority::AuthorityBinding;
    use agent_kit_core::tools::Invocation;
    use agent_kit_core::turn::{AttemptRecord, OperationRecord};
    use agent_kit_core::{AttemptId, Fingerprint, GrantId, PrincipalId, ScopeId};

    #[test]
    fn source_requires_the_successful_capture_grant_and_exact_path() {
        let id = OperationId::new("capture").unwrap();
        let session = SessionId::new("session").unwrap();
        let grant = GrantSelection {
            authority: AuthorityBinding {
                principal: PrincipalId::new("grida-local").unwrap(),
                binding: BindingId::new("native-permissions/fixture").unwrap(),
                scope: ScopeId::new("fixture-input").unwrap(),
            },
            grants: vec![GrantId::new("workspace-file-read").unwrap()],
        };
        let path = "assets/reference.png";
        let asset = serde_json::from_value::<AssetRef>(json!({
            "owner": session, "id": "workspace-reference/fixture", "name": images::NAME,
            "version": 1, "size": 128, "digest": ([7_u8; 32]),
        }))
        .unwrap();
        let media = images::media(&asset).unwrap();
        let definition = ToolDefinition {
            id: ToolId::new(CAPTURE_IMAGE_REFERENCE).unwrap(),
            version: 1,
            description: "Capture a reference".into(),
            input: InputFormat::Json(json!({"type":"object"})),
            max_input_bytes: 4096,
            max_output_bytes: 4096,
            recovery: RecoveryKind::Unavailable,
        };
        let arguments = ToolArguments::Json(json!({"path": path}));
        let fingerprint = Fingerprint::of(&(&definition, &arguments)).unwrap();
        let invocation: Invocation = serde_json::from_value(json!({
            "id": id, "definition": definition, "arguments": arguments, "fingerprint": fingerprint,
        }))
        .unwrap();
        let mut outcome = ToolOutcome {
            status: OutcomeStatus::Succeeded,
            content: vec![],
            structured: Some(json!({"reference_id":id,"path":path})),
            receipt: Some(
                crate::host::encode(WORKSPACE_IMAGE_REFERENCE_SCHEMA, 1, &media).unwrap(),
            ),
            truncated: false,
        };
        let operation = |outcome| OperationState {
            record: OperationRecord {
                id: id.clone(),
                input: OperationInput::Tool(invocation.clone()),
                origin: None,
                source_call: None,
                grants: grant.clone(),
            },
            attempts: vec![AttemptRecord {
                id: AttemptId::new("capture-attempt").unwrap(),
                outcome: Some(OperationOutcome::Tool(outcome)),
                prior_outcomes: vec![],
            }],
            rejection: None,
        };
        assert_eq!(
            source(&operation(outcome.clone()), &id, &session, &grant),
            Some((path.into(), media))
        );
        let foreign = SessionId::new("foreign").unwrap();
        assert!(source(&operation(outcome.clone()), &id, &foreign, &grant).is_none());
        let mut other_grant = grant.clone();
        other_grant.authority.scope = ScopeId::new("other-input").unwrap();
        assert!(source(&operation(outcome.clone()), &id, &session, &other_grant).is_none());
        outcome.structured.as_mut().unwrap()["path"] = json!("assets/other.png");
        assert!(source(&operation(outcome), &id, &session, &grant).is_none());
    }

    #[test]
    fn generation_accepts_only_a_capture_id_and_serializes_the_review_path() {
        let valid = json!({"prompt":"Create a variant", "workspace_reference_id":"capture"});
        assert!(Arguments::parse(&valid).is_ok());
        assert!(Arguments::parse(&json!({"prompt":"Create a variant", "path":"ref.png"})).is_err());
        assert!(Arguments::parse(&json!({"prompt":"Create a variant", "workspace_reference_id":"capture", "attached_image":true})).is_err());
        let request = Request {
            session_id: SessionId::new("session").unwrap(),
            call_id: BindingId::new("generate").unwrap(),
            prompt: "Create a variant".into(),
            background: None,
            credential: CredentialWitness {
                nonce: "fixture".into(),
                proof: "fixture".into(),
            },
            reference_png: Some("encoded".into()),
            reference_origin: Some(ReferenceOrigin::Workspace),
            reference_path: Some("assets/ref.png".into()),
        };
        let wire = serde_json::to_value(request).unwrap();
        assert_eq!(wire["referenceOrigin"], "workspace");
        assert_eq!(wire["referencePath"], "assets/ref.png");
        assert_eq!(wire["referencePng"], "encoded");
        let decline = Reply::ReferenceDeclined.outcome(None, Some(ReferenceOrigin::Workspace));
        assert_eq!(decline.status, OutcomeStatus::Failed);
        assert_eq!(
            decline.structured,
            Some(json!({"status":"reference_declined"}))
        );
    }
}
