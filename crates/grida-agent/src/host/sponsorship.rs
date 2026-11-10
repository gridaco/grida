//! GRIDA-SEC-004 — parent controls fence the exact funded child slot.

use super::*;
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::ToolArguments;
use agent_kit_core::tools::{RecoveryKind, ToolDefinition};
use agent_kit_core::turn::{OperationInput, TurnBinding};
use agent_kit_core::{GrantId, ToolId};
use agent_kit_store_sqlite::{
    OperationClaimSource, OperationPairControl, OperationPairReceipt, OperationRelatedControl,
};
use grida_agent_master::subagents::{
    self, Assignment, PauseCause, Profile, Sponsorship, sponsored_identity,
};
use serde_json::json;

const DELEGATE: &str = "delegate_review";
const CHILD_INPUT: &str = "sponsored-assignment";
const CHILD_TURN: &str = "sponsored-turn";

fn delegation_definition() -> Result<ToolDefinition> {
    Ok(ToolDefinition {
        id: ToolId::new(DELEGATE)?,
        version: 1,
        description: "Start one independent, text-only review within this task's allowance. Include its objective and the evidence it should return.".into(),
        input: InputFormat::Json(json!({
            "type": "object",
            "properties": {"instructions": {"type": "string", "minLength": 1}},
            "required": ["instructions"],
            "additionalProperties": false
        })),
        max_input_bytes: subagents::MAX_ASSIGNMENT_BYTES + 512,
        max_output_bytes: 4096,
        recovery: RecoveryKind::Reconcile,
    })
}

fn delegation_grant(binding: &TurnBinding) -> Result<GrantSelection> {
    let digest = Fingerprint::of(&(&binding.session, &binding.turn))?;
    let id = uuid::Uuid::from_bytes(digest.bytes()[..16].try_into().expect("fingerprint prefix"));
    Ok(GrantSelection {
        authority: AuthorityBinding {
            principal: PrincipalId::new("grida-local")?,
            binding: BindingId::new(format!("delegation/{id}"))?,
            scope: ScopeId::new("sponsored-subagent")?,
        },
        grants: vec![GrantId::new(DELEGATE)?],
    })
}

impl Host {
    /// Start the one child funded by an already admitted local delegation
    /// operation. The caller supplies that operation's exact attempt and
    /// control basis. Repeating a retained start observes the original child.
    pub async fn start_sponsored_child(
        &self,
        source: OperationClaimSource,
        instructions: String,
    ) -> Result<SubagentWork> {
        if !self.subagents_available() {
            return Err(problem(ErrorKind::Unsupported, "subagents_unavailable"));
        }
        subagents::validate_assignment(&instructions)?;
        self.verify_delegation(&source, &instructions).await?;
        let slot = sponsored_identity(&source.binding.session, &source.binding.turn)?;
        if let Some(work) = self.sponsored_work(&source, &slot, &instructions).await? {
            return Ok(work);
        }
        let request = self
            .sponsored_claim(source.clone(), slot.clone(), &instructions)
            .await?;
        let turn = TurnId::new(CHILD_TURN)?;
        let ticket = {
            let mut work = self.work.lock().await;
            self.register(
                &mut work,
                slot.clone(),
                turn,
                Launch::Sponsored(Box::new(request)),
            )
        };
        let admitted = match ticket {
            Ok(ticket) => ticket
                .admission
                .await
                .map_err(|_| problem(ErrorKind::Uncertain, "admission_worker_interrupted"))?
                .map(|_| ()),
            Err(error) => Err(error),
        };
        if let Some(work) = self.sponsored_work(&source, &slot, &instructions).await? {
            return Ok(work);
        }
        admitted?;
        Err(problem(
            ErrorKind::Uncertain,
            "sponsored_subagent_admission_missing",
        ))
    }

    async fn verify_delegation(
        &self,
        source: &OperationClaimSource,
        instructions: &str,
    ) -> Result<()> {
        let operation = source.operation.clone();
        let attempt = source.attempt.clone();
        let action = source.action;
        let grants = delegation_grant(&source.binding)?;
        let definition = delegation_definition()?;
        let arguments = ToolArguments::Json(json!({"instructions": instructions}));
        self.store
            .inspect_turn_with(
                source.binding.session.clone(),
                source.binding.turn.clone(),
                move |state| {
                    let matches = state.operations().get(&operation).is_some_and(|entry| {
                        entry.record.grants == grants
                            && entry.attempts.iter().any(|record| record.id == attempt)
                            && matches!(&entry.record.input, OperationInput::Tool(invocation)
                            if invocation.fingerprint() == action
                                && invocation.definition() == &definition
                                && invocation.arguments() == &arguments)
                    });
                    if !matches {
                        return Err(problem(
                            ErrorKind::Conflict,
                            "sponsored_subagent_operation_changed",
                        ));
                    }
                    Ok(())
                },
            )
            .await
    }

    async fn sponsored_work(
        &self,
        source: &OperationClaimSource,
        slot: &SessionId,
        instructions: &str,
    ) -> Result<Option<SubagentWork>> {
        let input = ChangeId::new(CHILD_INPUT)?;
        let (view, accepted) = match self
            .store
            .inspect_with_input(slot.clone(), input.clone())
            .await
        {
            Ok(value) => value,
            Err(error) if error.code == "session_missing" => return Ok(None),
            Err(error) => return Err(error),
        };
        let profile = session_configuration(&view)?
            .subagent
            .ok_or_else(sponsored_slot_used)?;
        let admission = Fingerprint::of(source)?;
        if profile.parent() != &source.binding.session
            || !profile.sponsorship().is_some_and(|sponsor| {
                sponsor.parent_turn == source.binding.turn
                    && sponsor.operation == source.operation
                    && sponsor.admission == Some(admission)
            })
        {
            return Err(sponsored_slot_used());
        }
        let accepted = accepted.ok_or_else(sponsored_slot_used)?;
        let stored: StoredPrompt = decode_input(&accepted.input.input)?;
        if !matches!(stored.parts.as_slice(), [PromptPart::Text {text}] if text == instructions) {
            return Err(sponsored_slot_used());
        }
        let observation = self
            .inspect_subagent(source.binding.session.clone(), slot.clone(), Some(input))
            .await?;
        observation
            .assignment
            .map(Some)
            .ok_or_else(sponsored_slot_used)
    }

    async fn sponsored_claim(
        &self,
        source: OperationClaimSource,
        child: SessionId,
        instructions: &str,
    ) -> Result<OperationClaim> {
        let execution = self.execution()?;
        let view = self.store.inspect(source.binding.session.clone()).await?;
        self.check_execution(&view)?;
        let mut config = session_configuration(&view)?;
        let inputs = self
            .store
            .turn_submissions(source.binding.session.clone(), source.binding.turn.clone())
            .await?;
        let [input] = inputs.as_slice() else {
            return Err(problem(
                ErrorKind::Unsupported,
                "sponsored_subagent_source_input",
            ));
        };
        let mut captured: StoredPrompt = decode_input(input)?;
        if input.payload.version() != 2
            || config.subagent.is_some()
            || captured.goal.is_some()
            || captured.subagent.is_some()
            || captured.max_output_tokens.is_none()
        {
            return Err(problem(
                ErrorKind::Unsupported,
                "sponsored_subagent_source_input",
            ));
        }
        let profile = Profile::sponsored(
            source.binding.session.clone(),
            "Independent reviewer".into(),
            Sponsorship {
                parent_turn: source.binding.turn.clone(),
                operation: source.operation.clone(),
                admission: Some(Fingerprint::of(&source)?),
            },
            &execution.authority.inference.authority,
        )?;
        let driver_state = profile.reserve(&Default::default())?;
        config.subagent = Some(profile);
        config.execution = execution.configuration;
        captured.parts = vec![PromptPart::Text {
            text: instructions.to_owned(),
        }];
        captured.max_steps = Some(subagents::INFERENCE_STEPS_PER_ASSIGNMENT);
        captured.questions = false;
        captured.allow_wakeups = false;
        captured.configuration_permission = crate::ConfigurationPermission::Disabled;
        captured.permission_capture = None;
        captured.host_tools_capture = None;
        captured.editor_endpoint = None;
        captured.editor_presentation = false;
        captured.guidance = None;
        captured.subagent = Some(Assignment {
            parent_turn: source.binding.turn.clone(),
        });
        captured.completion_checks = None;
        let input = Submission {
            id: ChangeId::new(CHILD_INPUT)?,
            payload: encode(INPUT_SCHEMA, 2, &captured)?,
        };
        Ok(OperationClaim {
            source,
            create: CreateSession {
                id: child.clone(),
                request: ChangeId::new("sponsored-create")?,
                configuration: encode(SESSION_SCHEMA, 2, &config)?,
            },
            claim: ClaimRequest {
                id: ChangeId::new("sponsored-claim")?,
                session: child,
                expected_revision: SessionRevision(0),
                selection: TurnSelection::New {
                    turn: TurnId::new(CHILD_TURN)?,
                    inputs: vec![input.id.clone()],
                },
            },
            input,
            driver_state,
        })
    }

    pub(super) async fn admit_sponsored(
        &self,
        request: OperationClaim,
    ) -> Result<Option<Admitted>> {
        let execution = self.execution()?;
        let config = decode_session_configuration(&request.create.configuration)?;
        let profile = config.subagent.ok_or_else(sponsored_slot_used)?;
        profile.require_authority(&execution.authority.inference.authority)?;
        let session = request.create.id.clone();
        let prepared = self.prepare_input(
            execution,
            &session,
            &request.input,
            Some(&profile),
            InputAuthority::RequireCaptured,
        )?;
        let master = Master::new(
            prepared.config,
            execution.provider.clone(),
            Inventory::new().snapshot(&[])?,
            MasterAuthority {
                inference: execution.authority.inference.clone(),
                tools: BTreeMap::new(),
            },
        )?
        .with_input_limit(prepared.limit);
        let ClaimOutcome::Acquired(claim) = self.store.claim_from_operation(request).await? else {
            return Ok(None);
        };
        let turn = claim.lease.binding().turn.clone();
        let (opened, _) = self.open_owned_turn(&session, &turn, claim.lease).await?;
        Ok(Some(Admitted {
            opened,
            work: TurnWork::Conversation {
                master: Box::new(master),
                input: prepared.messages,
                command: None,
            },
            acceptance: None,
        }))
    }

    pub(super) async fn control_sponsorship(
        &self,
        request: ControlRequest,
    ) -> Result<OperationPairReceipt> {
        let (turn, stop) = match &request.action {
            SessionControl::Turn {
                turn,
                directive: ControlDirective::Pause,
                ..
            } => (turn, false),
            SessionControl::PauseAndCancel { turn, .. }
            | SessionControl::Turn {
                turn,
                directive: ControlDirective::Cancel,
                ..
            } => (turn, true),
            _ => return self.ordinary_control(request).await,
        };
        if session_configuration(&self.store.inspect(request.session.clone()).await?)?
            .subagent
            .is_some()
        {
            return self.ordinary_control(request).await;
        }
        let slot = sponsored_identity(&request.session, turn)?;
        let mut conflict = problem(ErrorKind::Conflict, "sponsored_subagent_control_changed");
        for _ in 0..4 {
            let ordinary = self.store.control_receipt(request.clone()).await?;
            if let Some(receipt) = self.store.operation_pair_receipt(request.clone()).await? {
                return Ok(receipt);
            }
            if let Some(receipt) = ordinary {
                return Ok(OperationPairReceipt {
                    source: receipt,
                    destination: None,
                });
            }
            let related = self.sponsored_control(&request, turn, &slot, stop).await?;
            if matches!(related, OperationRelatedControl::Absent { .. })
                && !self.subagents_available()
            {
                return self.ordinary_control(request).await;
            }
            match self
                .store
                .control_operation_pair(OperationPairControl {
                    source: request.clone(),
                    related,
                })
                .await
            {
                Ok(receipt) => return Ok(receipt),
                Err(error)
                    if matches!(
                        error.code.as_str(),
                        "operation_pair_destination_exists"
                            | "operation_pair_control_already_recorded"
                            | "request_identity_reused"
                            | "stale_session_revision"
                            | "stale_control_revision"
                            | "active_turn_mismatch"
                    ) =>
                {
                    conflict = error
                }
                Err(error) => return Err(error),
            }
        }
        Err(conflict)
    }

    async fn ordinary_control(&self, request: ControlRequest) -> Result<OperationPairReceipt> {
        Ok(OperationPairReceipt {
            source: self.store.control(request).await?,
            destination: None,
        })
    }

    async fn sponsored_control(
        &self,
        request: &ControlRequest,
        parent_turn: &TurnId,
        slot: &SessionId,
        stop: bool,
    ) -> Result<OperationRelatedControl> {
        let child = match self.store.inspect(slot.clone()).await {
            Ok(child) => child,
            Err(error) if error.code == "session_missing" => {
                return Ok(OperationRelatedControl::Absent {
                    session: slot.clone(),
                });
            }
            Err(error) => return Err(error),
        };
        let unavailable = || problem(ErrorKind::Conflict, "sponsored_subagent_relation_changed");
        let profile = session_configuration(&child)?
            .subagent
            .filter(|profile| profile.parent() == &request.session)
            .ok_or_else(unavailable)?;
        let sponsor = profile
            .sponsorship()
            .filter(|sponsor| &sponsor.parent_turn == parent_turn)
            .ok_or_else(unavailable)?;
        let turn = child
            .current
            .as_ref()
            .or(child.latest.as_ref())
            .ok_or_else(unavailable)?;
        if turn.disposition == TurnDisposition::Settled {
            return Ok(OperationRelatedControl::Settled {
                operation: sponsor.operation.clone(),
                session: child.session,
                turn: turn.binding.turn.clone(),
            });
        }
        let action = if stop || turn.controls.cancelled {
            SessionControl::PauseAndCancel {
                turn: turn.binding.turn.clone(),
                expected: turn.controls.revision,
            }
        } else {
            let (change, _) =
                profile.set_sponsored_pause(&child.driver_state, PauseCause::Ancestor, true)?;
            SessionControl::DriverState {
                change,
                turn: Some(agent_kit_sessions::TurnControl {
                    turn: turn.binding.turn.clone(),
                    expected: turn.controls.revision,
                    directive: ControlDirective::Pause,
                }),
            }
        };
        Ok(OperationRelatedControl::Apply {
            operation: sponsor.operation.clone(),
            request: ControlRequest {
                id: change_id()?,
                session: child.session,
                expected_revision: child.revision,
                action,
            },
        })
    }

    pub(super) async fn kick_sponsored_stop(&self, receipt: &OperationPairReceipt) {
        if let Some(child) = &receipt.destination
            && let Some(turn) = &child.turn
        {
            let turn = turn.record().binding.turn.clone();
            self.release_timer(&child.session, &turn).await;
            self.kick_stopped(child.session.clone(), turn).await;
        }
    }
}

fn sponsored_slot_used() -> Error {
    problem(ErrorKind::Conflict, "sponsored_subagent_slot_used")
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_kit_core::inference::InputFormat;
    use agent_kit_core::messages::ToolArguments;
    use agent_kit_core::tools::{
        Invocation, InvocationContext, RecoveryKind, Tool, ToolDefinition, ToolOutcome,
    };
    use agent_kit_core::turn::{JournalAction, JournalChange, OperationInput, OperationRecord};
    use agent_kit_core::{AttemptId, ToolId};
    use agent_kit_store_sqlite::{OperationClaim, OperationClaimSource};
    use grida_agent_master::subagents::{Profile, Sponsorship};
    use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
    use tokio::net::TcpListener;

    struct WorkTool(ToolDefinition);

    impl Tool for WorkTool {
        fn definition(&self) -> &ToolDefinition {
            &self.0
        }

        fn validate(&self, _: &ToolArguments) -> Result<()> {
            Ok(())
        }

        fn invoke(&self, _: Invocation, _: InvocationContext) -> BoxFuture<'_, ToolOutcome> {
            panic!("the fixture controls an already recorded attempt")
        }
    }

    fn input(text: &str) -> Submission {
        Submission {
            id: change_id().unwrap(),
            payload: encode("fixture.prompt", 1, &text).unwrap(),
        }
    }

    async fn capture_delegation(
        host: &Host,
        cwd: &Path,
        regime: OperatingRegime,
        instructions: &str,
    ) -> (agent_kit_sessions::ClaimedTurn, OperationClaimSource) {
        let session = host.new_session(cwd.canonicalize().unwrap()).await.unwrap();
        let view = host.store.inspect(session.clone()).await.unwrap();
        let submission = host
            .capture_input(
                &view,
                change_id().unwrap(),
                vec![PromptPart::Text {
                    text: "Private parent context".into(),
                }],
                SubmissionPolicy {
                    questions: true,
                    configuration_permission: crate::ConfigurationPermission::Inspect,
                    allow_wakeups: false,
                    allow_host_tools: false,
                    editor_endpoint: None,
                    editor_presentation: false,
                    operating_regime: regime,
                    subagent: None,
                },
            )
            .await
            .unwrap();
        let id = submission.id.clone();
        host.store
            .submit(session.clone(), submission)
            .await
            .unwrap();
        let view = host.store.inspect(session.clone()).await.unwrap();
        let ClaimOutcome::Acquired(owner) = host
            .store
            .claim(
                new_claim(
                    session,
                    TurnId::new("parent-turn").unwrap(),
                    view.revision,
                    vec![id],
                )
                .unwrap(),
            )
            .await
            .unwrap()
        else {
            panic!("expected parent lease")
        };
        let definition = delegation_definition().unwrap();
        let tool = definition.id.clone();
        let mut inventory = Inventory::new();
        inventory.insert(Arc::new(WorkTool(definition))).unwrap();
        let operation = OperationId::new("delegate").unwrap();
        let attempt = AttemptId::new("delegate-attempt").unwrap();
        let invocation = inventory
            .snapshot(std::slice::from_ref(&tool))
            .unwrap()
            .prepare(
                operation.clone(),
                &tool,
                ToolArguments::Json(json!({"instructions": instructions})),
            )
            .unwrap()
            .invocation()
            .clone();
        let action = invocation.fingerprint();
        let initial = owner.lease.journal().load().await.unwrap();
        owner
            .lease
            .journal()
            .commit(
                JournalChange::new(
                    change_id().unwrap(),
                    initial.binding().clone(),
                    initial.position(),
                    initial.controls().revision,
                    vec![
                        JournalAction::prepare(OperationRecord {
                            id: operation.clone(),
                            input: OperationInput::Tool(invocation),
                            origin: None,
                            source_call: None,
                            grants: delegation_grant(initial.binding()).unwrap(),
                        }),
                        JournalAction::StartAttempt {
                            operation: operation.clone(),
                            attempt: attempt.clone(),
                        },
                    ],
                )
                .unwrap(),
            )
            .await
            .unwrap();
        let source = OperationClaimSource {
            binding: initial.binding().clone(),
            control: initial.controls().revision,
            operation,
            attempt,
            action,
        };
        (owner, source)
    }

    async fn synthetic_reply(listener: &TcpListener) -> serde_json::Value {
        let (stream, _) = listener.accept().await.unwrap();
        let mut stream = BufReader::new(stream);
        let mut size = None;
        loop {
            let mut line = String::new();
            assert_ne!(stream.read_line(&mut line).await.unwrap(), 0);
            if line == "\r\n" {
                break;
            }
            if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                size = Some(value.trim().parse::<usize>().unwrap());
            }
        }
        let mut body = vec![0; size.unwrap()];
        stream.read_exact(&mut body).await.unwrap();
        let reply = concat!(
            "data: {\"id\":\"fixture\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"Independent finding.\"},\"finish_reason\":null}]}\n\n",
            "data: {\"id\":\"fixture\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n",
            "data: [DONE]\n\n",
        );
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{reply}",
            reply.len()
        );
        stream
            .get_mut()
            .write_all(response.as_bytes())
            .await
            .unwrap();
        serde_json::from_slice(&body).unwrap()
    }

    #[tokio::test]
    async fn admitted_sponsored_work_runs_once_with_the_captured_regime() {
        let root = tempfile::tempdir().unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let host = Host::open(
            &root.path().join("state"),
            Some(ProviderOptions {
                endpoint: format!("http://{address}/v1"),
                model: ModelId::new("fixture").unwrap(),
                max_output_tokens: 1024,
                credential_env: None,
                protocol: ProviderProtocol::OpenAiCompatible,
                credential_home: None,
                compatible_output_limit_field: Some(CompatibleOutputLimitField::MaxTokens),
            }),
        )
        .unwrap()
        .with_subagents();
        let instructions = "Inspect the result and explain the independent finding.";
        for regime in [OperatingRegime::Plan, OperatingRegime::Act] {
            let (_owner, source) =
                capture_delegation(&host, root.path(), regime, instructions).await;
            let slot = sponsored_identity(&source.binding.session, &source.binding.turn).unwrap();
            let accepted = host
                .start_sponsored_child(source.clone(), instructions.into())
                .await
                .unwrap();
            assert_eq!(accepted.parent_turn, source.binding.turn);
            assert_eq!(
                accepted.max_generation_steps,
                subagents::INFERENCE_STEPS_PER_ASSIGNMENT
            );
            let request = tokio::time::timeout(Duration::from_secs(5), synthetic_reply(&listener))
                .await
                .unwrap();
            let prompt = request["messages"].to_string();
            assert!(prompt.contains(instructions));
            assert!(!prompt.contains("Private parent context"));
            assert_eq!(prompt.contains("Plan is active."), !regime.is_act());
            assert!(request.get("tools").is_none());
            assert_eq!(request["max_tokens"], 1024);
            let finished = tokio::time::timeout(Duration::from_secs(5), async {
                loop {
                    let replay = host
                        .start_sponsored_child(source.clone(), instructions.into())
                        .await
                        .unwrap();
                    if let Some(turn) = replay.turn
                        && turn.disposition == TurnDisposition::Settled
                    {
                        break turn;
                    }
                    tokio::time::sleep(Duration::from_millis(10)).await;
                }
            })
            .await
            .unwrap();
            assert_eq!(finished.binding.session, slot);
            let outcome = finished.outcome.unwrap();
            assert_eq!(
                outcome.status,
                agent_kit_core::messages::OutcomeStatus::Succeeded
            );
            assert_eq!(
                grida_agent_master::read_account(outcome.account.as_ref().unwrap())
                    .unwrap()
                    .text,
                "Independent finding."
            );
            let mut stale = source;
            stale.control.0 += 1;
            assert_eq!(
                host.start_sponsored_child(stale, instructions.into())
                    .await
                    .err()
                    .unwrap()
                    .code,
                "sponsored_subagent_slot_used"
            );
        }
        assert!(
            tokio::time::timeout(Duration::from_millis(100), listener.accept())
                .await
                .is_err()
        );
        host.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn parent_pause_and_stop_update_the_exact_sponsored_child() {
        let root = tempfile::tempdir().unwrap();
        let mut host = Host::open(
            &root.path().join("state"),
            Some(ProviderOptions {
                endpoint: "http://127.0.0.1:1/v1".into(),
                model: ModelId::new("fixture").unwrap(),
                max_output_tokens: 1024,
                credential_env: None,
                protocol: ProviderProtocol::OpenAiCompatible,
                credential_home: None,
                compatible_output_limit_field: None,
            }),
        )
        .unwrap()
        .with_subagents();
        let store = &host.store;
        let parent = host
            .new_session(root.path().canonicalize().unwrap())
            .await
            .unwrap();
        let parent_turn = TurnId::new("parent-turn").unwrap();
        let parent_input = input("Review the result");
        store
            .submit(parent.clone(), parent_input.clone())
            .await
            .unwrap();
        let view = store.inspect(parent.clone()).await.unwrap();
        let ClaimOutcome::Acquired(owner) = store
            .claim(
                new_claim(
                    parent.clone(),
                    parent_turn.clone(),
                    view.revision,
                    vec![parent_input.id],
                )
                .unwrap(),
            )
            .await
            .unwrap()
        else {
            panic!("expected parent lease")
        };
        let operation = OperationId::new("start-review").unwrap();
        let attempt = AttemptId::new("attempt").unwrap();
        let tool = ToolId::new("review").unwrap();
        let mut inventory = Inventory::new();
        inventory
            .insert(Arc::new(WorkTool(ToolDefinition {
                id: tool.clone(),
                version: 1,
                description: "Review the result".into(),
                input: InputFormat::Text,
                max_input_bytes: 256,
                max_output_bytes: 256,
                recovery: RecoveryKind::Unavailable,
            })))
            .unwrap();
        let invocation = inventory
            .snapshot(std::slice::from_ref(&tool))
            .unwrap()
            .prepare(
                operation.clone(),
                &tool,
                ToolArguments::Text("Inspect the result".into()),
            )
            .unwrap()
            .invocation()
            .clone();
        let action = invocation.fingerprint();
        let grant = host.execution().unwrap().authority.inference.clone();
        let initial = owner.lease.journal().load().await.unwrap();
        owner
            .lease
            .journal()
            .commit(
                JournalChange::new(
                    change_id().unwrap(),
                    initial.binding().clone(),
                    initial.position(),
                    initial.controls().revision,
                    vec![
                        JournalAction::prepare(OperationRecord {
                            id: operation.clone(),
                            input: OperationInput::Tool(invocation),
                            origin: None,
                            source_call: None,
                            grants: grant.clone(),
                        }),
                        JournalAction::StartAttempt {
                            operation: operation.clone(),
                            attempt: attempt.clone(),
                        },
                    ],
                )
                .unwrap(),
            )
            .await
            .unwrap();
        let profile = Profile::sponsored(
            parent.clone(),
            "Reviewer".into(),
            Sponsorship {
                parent_turn: parent_turn.clone(),
                operation: operation.clone(),
                admission: None,
            },
            &grant.authority,
        )
        .unwrap();
        let child = sponsored_identity(&parent, &parent_turn).unwrap();
        let child_turn = TurnId::new("child-turn").unwrap();
        let child_input = input("Inspect the result");
        let mut config = session_configuration(&view).unwrap();
        config.subagent = Some(profile.clone());
        let ClaimOutcome::Acquired(child_owner) = store
            .claim_from_operation(OperationClaim {
                source: OperationClaimSource {
                    binding: owner.lease.binding().clone(),
                    control: initial.controls().revision,
                    operation,
                    attempt,
                    action,
                },
                create: CreateSession {
                    id: child.clone(),
                    request: change_id().unwrap(),
                    configuration: encode(SESSION_SCHEMA, 2, &config).unwrap(),
                },
                claim: new_claim(
                    child.clone(),
                    child_turn.clone(),
                    SessionRevision(0),
                    vec![child_input.id.clone()],
                )
                .unwrap(),
                input: child_input,
                driver_state: profile.reserve(&Default::default()).unwrap(),
            })
            .await
            .unwrap()
        else {
            panic!("expected child lease")
        };

        let view = store.inspect(parent.clone()).await.unwrap();
        let pause_id = change_id().unwrap();
        let control = view.current.unwrap().controls.revision;
        let pause = || TurnControl {
            request: pause_id.clone(),
            session: parent.clone(),
            turn: parent_turn.clone(),
            expected_session: view.revision,
            expected_control: control,
        };
        let receipt = host.pause(pause()).await.unwrap();
        assert_eq!(host.pause(pause()).await.unwrap(), receipt);
        let child_view = store.inspect(child.clone()).await.unwrap();
        assert!(
            profile
                .sponsored_pause(&child_view.driver_state)
                .unwrap()
                .effective()
        );
        assert_eq!(
            profile
                .allocation(&child_view.driver_state)
                .unwrap()
                .reserved,
            1
        );
        assert!(child_view.current.unwrap().controls.paused);

        host.subagents_enabled = false;
        let view = store.inspect(parent.clone()).await.unwrap();
        let stop = change_id().unwrap();
        let control = view.current.unwrap().controls.revision;
        let receipt = host
            .stop(
                parent.clone(),
                parent_turn.clone(),
                stop.clone(),
                view.revision,
                control,
            )
            .await
            .unwrap();
        assert_eq!(
            host.stop(parent, parent_turn, stop, view.revision, control)
                .await
                .unwrap(),
            receipt
        );
        assert!(
            store
                .inspect_turn(child, child_turn)
                .await
                .unwrap()
                .controls
                .cancelled
        );
        drop(child_owner);
    }
}
