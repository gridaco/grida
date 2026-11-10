//! GRIDA-SEC-004 — Read the bounded result of the exact sponsored review.

use super::{CHILD_INPUT, CHILD_TURN, delegation_definition, delegation_grant, related_changed};
use crate::host::{
    INPUT_SCHEMA, PromptPart, StoredPrompt, decode_input, problem, session_configuration,
};
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{OutcomeStatus, ToolArguments};
use agent_kit_core::tools::{
    Invocation, InvocationContext, InvocationRecovery, RecoveryKind, Tool, ToolDefinition,
    ToolOutcome,
};
use agent_kit_core::turn::{OperationInput, TurnBinding};
use agent_kit_core::{
    BoxFuture, CancellationToken, ChangeId, ErrorKind, Result, SessionId, ToolId, TurnId,
};
use agent_kit_sessions::{SessionStore, TurnDisposition, TurnView};
use agent_kit_store_sqlite::SqliteStore;
use grida_agent_master::effort::COLLECT_REVIEW;
use grida_agent_master::read_account;
use grida_agent_master::subagents::{INFERENCE_STEPS_PER_ASSIGNMENT, sponsored_identity};
use serde::Serialize;
use serde_json::json;
use std::sync::Arc;
use std::time::{Duration, Instant};

const MAX_FINDINGS_BYTES: usize = 1_024;
// A control character can expand to six bytes in JSON.
const MAX_OUTPUT_BYTES: usize = 8_192;
const COLLECTION_WINDOW: Duration = Duration::from_millis(750);
const CHECK_INTERVAL: Duration = Duration::from_millis(125);
const MAX_CHECKS: usize = 6;

pub(super) fn definition() -> Result<ToolDefinition> {
    Ok(ToolDefinition {
        id: ToolId::new(COLLECT_REVIEW)?,
        version: 1,
        description: "Read the state and settled findings of the independent review sponsored by this task. A pending review has no findings yet.".into(),
        input: InputFormat::Json(json!({
            "type": "object",
            "properties": {},
            "additionalProperties": false,
        })),
        max_input_bytes: 128,
        max_output_bytes: MAX_OUTPUT_BYTES,
        recovery: RecoveryKind::Reconcile,
    })
}

pub(super) struct CollectReview {
    store: Arc<SqliteStore>,
    parent: TurnBinding,
    child: SessionId,
    definition: ToolDefinition,
}

impl CollectReview {
    pub(super) fn new(store: Arc<SqliteStore>, parent: TurnBinding) -> Result<Self> {
        Ok(Self {
            child: sponsored_identity(&parent.session, &parent.turn)?,
            store,
            parent,
            definition: definition()?,
        })
    }

    pub(super) async fn read(&self) -> Result<Option<TurnView>> {
        let (view, accepted) = match self
            .store
            .inspect_with_input(self.child.clone(), ChangeId::new(CHILD_INPUT)?)
            .await
        {
            Ok(value) => value,
            Err(error) if error.code == "session_missing" => return Ok(None),
            Err(error) => return Err(error),
        };
        let profile = session_configuration(&view)?
            .subagent
            .filter(|profile| profile.parent() == &self.parent.session)
            .ok_or_else(related_changed)?;
        let sponsor = profile
            .sponsorship()
            .filter(|sponsor| {
                sponsor.parent_turn == self.parent.turn && sponsor.admission.is_some()
            })
            .ok_or_else(related_changed)?;
        let attempt = sponsor.attempt.clone().ok_or_else(related_changed)?;
        let accepted = accepted.ok_or_else(related_changed)?;
        let turn = accepted
            .turn
            .filter(|turn| {
                turn.binding.session == self.child && turn.binding.turn.as_str() == CHILD_TURN
            })
            .ok_or_else(related_changed)?;
        let input = accepted.input.input;
        if input.payload.schema().as_str() != INPUT_SCHEMA || input.payload.version() != 2 {
            return Err(related_changed());
        }
        let stored: StoredPrompt = decode_input(&input)?;
        if stored.goal.is_some()
            || stored.effort.is_some()
            || stored.max_steps != Some(INFERENCE_STEPS_PER_ASSIGNMENT)
        {
            return Err(related_changed());
        }
        let [PromptPart::Text { text }] = stored.parts.as_slice() else {
            return Err(related_changed());
        };
        if !stored
            .subagent
            .is_some_and(|assignment| assignment.parent_turn == self.parent.turn)
        {
            return Err(related_changed());
        }
        let operation = sponsor.operation.clone();
        let definition = delegation_definition()?;
        let grant = delegation_grant(&self.parent)?;
        let arguments = ToolArguments::Json(json!({"instructions": text}));
        let parent = self.parent.clone();
        self.store
            .inspect_turn_with(parent.session.clone(), parent.turn.clone(), move |state| {
                if state.binding() != &parent
                    || !state.operations().get(&operation).is_some_and(|entry| {
                        entry.record.grants == grant
                            && entry.attempts.iter().any(|record| record.id == attempt)
                            && matches!(&entry.record.input, OperationInput::Tool(invocation)
                                if invocation.definition() == &definition
                                    && invocation.arguments() == &arguments)
                    })
                {
                    return Err(related_changed());
                }
                Ok(())
            })
            .await?;
        Ok(Some(turn))
    }

    async fn observe(&self, deadline: Option<Instant>) -> Result<ToolOutcome> {
        let Some(mut turn) = self.read().await? else {
            return Review::NotStarted.outcome(false);
        };
        if let Some(deadline) = deadline {
            for _ in 0..MAX_CHECKS {
                let next = Instant::now() + CHECK_INTERVAL;
                if turn.disposition != TurnDisposition::Running
                    || !turn.controls.admits_work()
                    || next >= deadline
                {
                    break;
                }
                tokio::time::sleep_until(next.into()).await;
                let read = self
                    .store
                    .inspect_turn(self.child.clone(), turn.binding.turn.clone());
                match tokio::time::timeout_at(deadline.into(), read).await {
                    Ok(result) => turn = result?,
                    Err(_) => break,
                }
            }
        }
        Review::from_turn(turn)
    }

    async fn collect(
        &self,
        cancellation: CancellationToken,
        deadline: Option<Instant>,
    ) -> ToolOutcome {
        tokio::select! {
            biased;
            _ = cancellation.cancelled() => ToolOutcome {
                status: OutcomeStatus::Cancelled,
                content: Vec::new(),
                structured: None,
                receipt: None,
                truncated: false,
            },
            outcome = self.observe(deadline) => {
                outcome.unwrap_or_else(|error| ToolOutcome::failed(&error.code))
            }
        }
    }
}

impl Tool for CollectReview {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }

    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        if matches!(arguments, ToolArguments::Json(value) if value.as_object().is_some_and(serde_json::Map::is_empty))
        {
            return Ok(());
        }
        Err(problem(
            ErrorKind::InvalidInput,
            "review_collection_arguments",
        ))
    }

    fn invoke(&self, _: Invocation, context: InvocationContext) -> BoxFuture<'_, ToolOutcome> {
        let window = Instant::now() + COLLECTION_WINDOW;
        let deadline = context.deadline.map_or(window, |outer| window.min(outer));
        Box::pin(self.collect(context.cancellation, Some(deadline)))
    }

    fn recover(
        &self,
        _: InvocationRecovery,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(self.collect(context.cancellation, None))
    }
}

#[derive(Serialize)]
#[serde(tag = "disposition", rename_all = "snake_case")]
enum Review {
    NotStarted,
    Pending {
        child: SessionId,
        turn: TurnId,
        phase: TurnDisposition,
        paused: bool,
    },
    Settled {
        child: SessionId,
        turn: TurnId,
        status: OutcomeStatus,
        #[serde(skip_serializing_if = "Option::is_none")]
        findings: Option<String>,
    },
    Uncertain {
        child: SessionId,
        turn: TurnId,
    },
}

impl Review {
    fn from_turn(view: TurnView) -> Result<ToolOutcome> {
        let TurnBinding {
            session: child,
            turn,
            ..
        } = view.binding;
        match view.disposition {
            TurnDisposition::Running | TurnDisposition::Suspended => Self::Pending {
                child,
                turn,
                phase: view.disposition,
                paused: view.controls.paused,
            }
            .outcome(false),
            TurnDisposition::Interrupted => Self::Uncertain { child, turn }.outcome(false),
            TurnDisposition::Settled => {
                let outcome = view.outcome.ok_or_else(related_changed)?;
                if outcome.status == OutcomeStatus::Uncertain {
                    return Self::Uncertain { child, turn }.outcome(false);
                }
                let mut findings = None;
                let mut truncated = false;
                if outcome.status == OutcomeStatus::Succeeded
                    && let Some(account) = &outcome.account
                {
                    let mut text = read_account(account)?.text;
                    let end = text.floor_char_boundary(MAX_FINDINGS_BYTES);
                    truncated = end < text.len();
                    text.truncate(end);
                    findings = Some(text);
                }
                Self::Settled {
                    child,
                    turn,
                    status: outcome.status,
                    findings,
                }
                .outcome(truncated)
            }
        }
    }

    fn outcome(self, truncated: bool) -> Result<ToolOutcome> {
        Ok(ToolOutcome {
            status: OutcomeStatus::Succeeded,
            content: Vec::new(),
            structured: Some(
                serde_json::to_value(self)
                    .map_err(|_| problem(ErrorKind::InvalidState, "review_collection_encoding"))?,
            ),
            receipt: None,
            truncated,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::host::{Host, OperatingRegime, change_id, encode};
    use crate::{ProviderOptions, ProviderProtocol};
    use agent_kit_core::tools::Inventory;
    use agent_kit_core::turn::{JournalAction, JournalChange, TurnOutcome};
    use agent_kit_core::{AttemptId, ModelId, OperationId};
    use agent_kit_sessions::{ClaimOutcome, CreateSession, RecoveryRequest};

    #[tokio::test]
    async fn collect_observes_only_the_exact_sponsored_assignment() {
        let root = tempfile::tempdir().unwrap();
        let host = Host::open(
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
        let instructions = "Verify the retained evidence.";
        let (_owner, source) = super::super::tests::capture_delegation(
            &host,
            root.path(),
            OperatingRegime::Act,
            instructions,
        )
        .await;
        let tool =
            Arc::new(CollectReview::new(host.store.clone(), source.binding.clone()).unwrap());
        let mut inventory = Inventory::new();
        let id = tool.definition().id.clone();
        inventory.insert(tool.clone()).unwrap();
        let tools = inventory.snapshot(std::slice::from_ref(&id)).unwrap();
        let invocation = tools
            .prepare(
                OperationId::new("collect").unwrap(),
                &id,
                ToolArguments::Json(json!({})),
            )
            .unwrap();
        assert!(
            tool.validate(&ToolArguments::Json(json!({"child": "other"})))
                .is_err()
        );
        assert_eq!(
            tool.observe(None).await.unwrap().structured,
            Some(json!({"disposition": "not_started"}))
        );

        let request = host
            .sponsored_claim(source.clone(), tool.child.clone(), instructions)
            .await
            .unwrap();
        let ClaimOutcome::Acquired(child) = host.store.claim_from_operation(request).await.unwrap()
        else {
            panic!("expected the exact sponsored claim");
        };
        let binding = child.lease.binding().clone();
        let context = InvocationContext {
            attempt: AttemptId::new("collect-attempt").unwrap(),
            cancellation: CancellationToken::new(),
            deadline: None,
            max_output_bytes: MAX_OUTPUT_BYTES,
        };
        let retained = invocation.invocation().clone();
        let pending = tools
            .restore(retained.clone())
            .unwrap()
            .invoke(InvocationContext {
                deadline: Some(Instant::now() + Duration::from_millis(60)),
                ..context.clone()
            })
            .await
            .structured
            .unwrap();
        assert_eq!(pending["disposition"], "pending");
        assert_eq!(pending["phase"], "running");
        assert_eq!(pending["child"], binding.session.as_str());
        assert_eq!(pending["turn"], binding.turn.as_str());
        assert!(pending.get("findings").is_none());
        drop(child);

        let interrupted = tool.observe(None).await.unwrap();
        assert_eq!(interrupted.status, OutcomeStatus::Succeeded);
        assert_eq!(interrupted.structured.unwrap()["disposition"], "uncertain");
        let ClaimOutcome::Acquired(child) = host
            .store
            .recover(RecoveryRequest {
                id: change_id().unwrap(),
                session: binding.session.clone(),
                turn: binding.turn.clone(),
                expected_epoch: binding.epoch,
            })
            .await
            .unwrap()
        else {
            panic!("expected explicit recovery of the same child");
        };
        let state = child.lease.journal().load().await.unwrap();
        let findings = format!(
            "Verified evidence. {}",
            "\u{1}界".repeat(MAX_FINDINGS_BYTES)
        );
        let account = encode(
            "grida.agent.account",
            1,
            &json!({"text": findings, "steps": 1, "unresolved": []}),
        )
        .unwrap();
        child
            .lease
            .journal()
            .commit(
                JournalChange::new(
                    change_id().unwrap(),
                    state.binding().clone(),
                    state.position(),
                    state.controls().revision,
                    vec![JournalAction::Settle(TurnOutcome {
                        status: OutcomeStatus::Succeeded,
                        account: Some(account),
                        evidence: Vec::new(),
                    })],
                )
                .unwrap(),
            )
            .await
            .unwrap();

        let collected = invocation.invoke(context.clone()).await;
        assert_eq!(collected.status, OutcomeStatus::Succeeded);
        assert!(collected.truncated);
        let view = collected.structured.as_ref().unwrap();
        assert_eq!(view["disposition"], "settled");
        assert_eq!(view["status"], "succeeded");
        let preview = view["findings"].as_str().unwrap();
        assert!(findings.starts_with(preview));
        assert!(preview.len() <= MAX_FINDINGS_BYTES);
        assert_eq!(
            tool.recover(
                InvocationRecovery {
                    invocation: retained,
                    checkpoint: None,
                    receipts: Vec::new(),
                },
                context
            )
            .await,
            collected,
        );

        let mut unrelated = source.binding;
        unrelated.turn = TurnId::new("another-parent-turn").unwrap();
        let unrelated = CollectReview::new(host.store.clone(), unrelated).unwrap();
        let configuration = host
            .store
            .inspect(binding.session)
            .await
            .unwrap()
            .configuration;
        host.store
            .create(CreateSession {
                id: unrelated.child.clone(),
                request: change_id().unwrap(),
                configuration,
            })
            .await
            .unwrap();
        assert_eq!(
            unrelated.observe(None).await.unwrap_err().code,
            "sponsored_subagent_relation_changed",
        );
    }
}
