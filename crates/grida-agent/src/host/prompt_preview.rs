//! Developer inspection of product instructions at the actual inference boundary.

use super::*;
use agent_kit_core::inference::{InferenceRequest, PreparedRequest, ToolOffer};
use agent_kit_core::turn::{OperationInput, TurnState};
use agent_kit_providers::{TransportFailure, TransportRequest, TransportResponse};

/// The ordered system messages and tool declarations from one prepared model call.
#[derive(Serialize)]
pub struct BakedPrompt {
    pub instructions: Vec<String>,
    pub tools: Vec<ToolOffer>,
}

impl BakedPrompt {
    fn read(request: &InferenceRequest) -> Self {
        Self {
            instructions: request
                .messages
                .iter()
                .filter(|m| m.role == Role::System)
                .flat_map(|m| &m.content)
                .filter_map(|part| match part {
                    Content::Text(text) => Some(text.clone()),
                    _ => None,
                })
                .collect(),
            tools: request.tools.clone(),
        }
    }
}

/// Metadata for a retained request. Only a specifically selected operation
/// includes its potentially large system messages and tool declarations.
#[derive(Serialize)]
pub struct RecordedPrompt {
    operation: OperationId,
    request_fingerprint: Fingerprint,
    model: ModelId,
    message_count: usize,
    attempts: usize,
    #[serde(flatten)]
    prompt: Option<BakedPrompt>,
}

fn prepared_requests(
    state: &TurnState,
) -> impl Iterator<Item = (&OperationId, &PreparedRequest, usize)> {
    state
        .operations()
        .iter()
        .filter_map(|(id, operation)| match &operation.record.input {
            OperationInput::Inference(request) => Some((id, request, operation.attempts.len())),
            OperationInput::Tool(_) => None,
        })
}

impl Host {
    /// List recorded inferences by ID, or read a selected request without
    /// reassembling it from today's host, workspace, or provider configuration.
    pub async fn recorded_prompts(
        &self,
        session: SessionId,
        turn: TurnId,
        selected: Option<OperationId>,
    ) -> Result<Vec<RecordedPrompt>> {
        self.store
            .inspect_turn_with(session, turn, move |state| {
                let mut captured = Vec::new();
                for (id, request, attempts) in prepared_requests(state) {
                    if selected.as_ref().is_none_or(|selected| selected == id) {
                        captured.push(RecordedPrompt {
                            operation: id.clone(),
                            request_fingerprint: request.fingerprint(),
                            model: request.request().model.clone(),
                            message_count: request.request().messages.len(),
                            attempts,
                            prompt: selected
                                .is_some()
                                .then(|| BakedPrompt::read(request.request())),
                        });
                    }
                }
                if selected.is_some() && captured.is_empty() {
                    return Err(problem(
                        ErrorKind::Unavailable,
                        "prepared_prompt_unavailable",
                    ));
                }
                Ok(captured)
            })
            .await
    }
}

/// The preview follows ordinary admission, request preparation and journaling.
/// Its transport has no network capability and cannot generate a tool call.
struct Offline;
impl StreamingTransport for Offline {
    fn send(
        &self,
        _: TransportRequest,
        _: RequestControl,
    ) -> BoxFuture<'_, std::result::Result<TransportResponse, TransportFailure>> {
        Box::pin(async {
            Ok(TransportResponse {
                status: 400,
                request_id: None,
                retry_after_ms: None,
                body: Box::pin(futures_util::stream::empty()),
            })
        })
    }
}

pub async fn bake(
    regime: OperatingRegime,
    side: bool,
    effort: EffortPreset,
    questions: bool,
    subagents: bool,
    cwd: Option<&Path>,
    profile: Option<&Path>,
) -> Result<BakedPrompt> {
    let temporary = tempfile::tempdir()
        .map_err(|_| problem(ErrorKind::Unavailable, "preview_directory_unavailable"))?;
    let state = temporary.path().join("state");
    // A fresh state directory and credential-free route with an in-memory transport.
    let options = ProviderOptions {
        endpoint: "http://127.0.0.1:1/v1".into(),
        model: ModelId::new("prompt-preview")?,
        protocol: ProviderProtocol::OpenAiCompatible,
        credential_env: None,
        credential_home: None,
        max_output_tokens: 1024,
        compatible_output_limit_field: None,
        llama_cpp_input_count: false,
        reasoning: false,
    };
    let mut host = Host::open_with(
        &state,
        Some(|inputs| {
            Execution::with_transport(&state, options, None, inputs, |_| Arc::new(Offline))
        }),
        None,
    )?
    .with_operating_regime(regime);
    if subagents || effort == EffortPreset::Ultra {
        host = host.with_subagents();
    }
    let cwd = if let Some(path) = profile {
        let profile = crate::launch_permissions::load_permission_profile(path, &state, None)?;
        if profile.before_tool_hook().is_some()
            || profile.completion_hook().is_some()
            || !profile.lifecycle_hooks().is_empty()
        {
            return Err(problem(
                ErrorKind::Unsupported,
                "prompt_preview_executable_hooks",
            ));
        }
        let cwd = profile.primary_directory()?.to_path_buf();
        host = host.with_permission_profile(profile);
        cwd
    } else if let Some(cwd) = cwd {
        host = host.with_headless_guidance(cwd)?;
        cwd.to_owned()
    } else {
        temporary.path().to_owned()
    };
    let parent = host.new_session(cwd).await?;
    let session = if side {
        side_chats::SideChats::default()
            .open(&host, parent, None, || Ok(()), |_| {})
            .await?
            .side_chat_id
    } else {
        parent
    };
    let accepted = host
        .start_prompt(PromptRequest {
            id: change_id()?,
            session: session.clone(),
            parts: vec![PromptPart::Text {
                text: "Preview this prompt.".into(),
            }],
            questions,
            question_batches: questions,
            operating_regime: Some(regime),
            effort: Some(effort),
            reasoning: None,
        })
        .await?;
    accepted
        .completion
        .await
        .map_err(|_| problem(ErrorKind::Unavailable, "prompt_preview_interrupted"))??;
    let prompt = host
        .store
        .inspect_turn_with(session, accepted.turn, |state| {
            let mut requests = prepared_requests(state);
            let (_, request, _) = requests
                .next()
                .ok_or_else(|| problem(ErrorKind::Unavailable, "prepared_prompt_unavailable"))?;
            if requests.next().is_some() {
                return Err(problem(
                    ErrorKind::InvalidState,
                    "unexpected_preview_operations",
                ));
            }
            Ok(BakedPrompt::read(request.request()))
        })
        .await?;
    host.shutdown().await?;
    Ok(prompt)
}
