//! GRIDA-SEC-004 — parent controls fence the exact funded child slot.

use super::*;
use agent_kit_store_sqlite::{OperationPairControl, OperationPairReceipt, OperationRelatedControl};
use grida_agent_master::subagents::{PauseCause, sponsored_identity};

impl Host {
    pub(super) async fn control_sponsorship(
        &self,
        request: ControlRequest,
    ) -> Result<ControlReceipt> {
        let (turn, stop) = match &request.action {
            SessionControl::Turn {
                turn,
                directive: ControlDirective::Pause,
                ..
            } => (turn, false),
            SessionControl::PauseAndCancel { turn, .. } => (turn, true),
            _ => return self.store.control(request).await,
        };
        if session_configuration(&self.store.inspect(request.session.clone()).await?)?
            .subagent
            .is_some()
        {
            return self.store.control(request).await;
        }
        let slot = sponsored_identity(&request.session, turn)?;
        let mut conflict = problem(ErrorKind::Conflict, "sponsored_subagent_control_changed");
        for _ in 0..4 {
            let ordinary = self.store.control_receipt(request.clone()).await?;
            if let Some(receipt) = self.store.operation_pair_receipt(request.clone()).await? {
                return Ok(self.finish_sponsored_control(receipt, stop).await);
            }
            if let Some(receipt) = ordinary {
                return Ok(receipt);
            }
            let related = self.sponsored_control(&request, turn, &slot, stop).await?;
            if matches!(related, OperationRelatedControl::Absent { .. })
                && !self.subagents_available()
            {
                return self.store.control(request).await;
            }
            match self
                .store
                .control_operation_pair(OperationPairControl {
                    source: request.clone(),
                    related,
                })
                .await
            {
                Ok(receipt) => return Ok(self.finish_sponsored_control(receipt, stop).await),
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

    async fn finish_sponsored_control(
        &self,
        receipt: OperationPairReceipt,
        stop: bool,
    ) -> ControlReceipt {
        if stop
            && let Some(child) = receipt.destination
            && let Some(turn) = child.turn
        {
            let turn = turn.record().binding.turn.clone();
            self.release_timer(&child.session, &turn).await;
            self.kick_stopped(child.session, turn).await;
        }
        receipt.source
    }
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
