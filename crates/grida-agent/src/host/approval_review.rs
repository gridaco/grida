//! GRIDA-SEC-004 — bound reviewer decisions for a captured approval request.

use super::*;
use crate::permissions::{
    ApprovalDecision, ApprovalEffect, ApprovalRequest, is_approval, read_approval,
    reviewed_approval_answer,
};
use agent_kit_core::inference::{InferenceRequest, PreparedRequest};
use agent_kit_core::turn::{OperationInput, TurnState};
use agent_kit_core::{OperationId, WaitId};
use agent_kit_runtime::{TurnOperations, TurnView};
use grida_agent_master::approval_review::{self, Decision, ReadProfile, ReadTarget};
use std::num::NonZeroU64;
use std::path::Path;

pub(super) enum ReviewPolicy {
    ConfiguredRead(ReadProfile),
    ApproveForMe { external_file_read: bool },
}

const MAX_USER_INSTRUCTIONS: usize = 32;
const MAX_INSTRUCTION_BYTES: usize = 4096;

/// Only a complete original transcript may supply authority. One bounded
/// store window suffices; an older cursor or a fork/revision seed means Ask.
async fn prior_instructions(host: &Host, state: &TurnState) -> Option<Vec<String>> {
    let binding = state.binding();
    let window = host
        .store
        .history_replay_window(
            binding.session.clone(),
            None,
            |turn| {
                grida_agent_master::questions::transcript(turn)
                    .into_iter()
                    .filter(|HistoryRecord::Message(message)| message.role == Role::User)
                    .collect()
            },
            |HistoryRecord::Message(message)| {
                message
                    .content
                    .iter()
                    .map(|part| match part {
                        Content::Text(text) => text.len().max(1),
                        _ => 1,
                    })
                    .sum::<usize>()
                    .max(1)
            },
            |_| {
                Err(problem(
                    ErrorKind::Unavailable,
                    "approval_review_inherited_context",
                ))
            },
        )
        .await
        .ok()?;
    if window.older.is_some() || window.turns.last()?.id != binding.turn {
        return None;
    }
    let mut instructions = Vec::new();
    append_instructions(
        &mut instructions,
        window
            .records
            .iter()
            .filter(|entry| entry.turn.as_ref() != Some(&binding.turn))
            .map(|entry| &entry.record),
    )?;
    Some(instructions)
}

fn append_instructions<'a>(
    instructions: &mut Vec<String>,
    records: impl Iterator<Item = &'a HistoryRecord>,
) -> Option<()> {
    let mut bytes: usize = instructions.iter().map(String::len).sum();
    for HistoryRecord::Message(message) in records {
        if message.role != Role::User {
            continue;
        }
        let text = if let Some(reply) = grida_agent_master::questions::visible_reply(message) {
            std::borrow::Cow::Owned(format!(
                "Question: {}\nUser answer: {}",
                reply.question, reply.answer
            ))
        } else if message.provenance.kind == ProvenanceKind::Supplied
            && matches!(
                message.provenance.source.as_str(),
                "native-client" | super::message_context::SUPPLIED_SOURCE
            )
        {
            let [Content::Text(text)] = message.content.as_slice() else {
                return None;
            };
            // Resource-link-only inputs are normalized to one JSON text part.
            // An attachment label cannot stand in for authored instructions.
            if text.starts_with(r#"{"kind":"resource_link","#) {
                return None;
            }
            std::borrow::Cow::Borrowed(text.as_str())
        } else if super::message_context::is_supplemental(message)
            || super::editor_observation::is_observation(message)
        {
            // Client/editor observations carry no user authority.
            continue;
        } else {
            // An unfamiliar user contribution may contain a restriction.
            return None;
        };
        bytes = bytes.checked_add(text.len())?;
        if instructions.len() >= MAX_USER_INSTRUCTIONS || bytes > MAX_INSTRUCTION_BYTES {
            return None;
        }
        instructions.push(text.into_owned());
    }
    Some(())
}

pub(super) struct AutomaticReview {
    host: Host,
    policy: ReviewPolicy,
    prior_instructions: tokio::sync::OnceCell<Option<Vec<String>>>,
    provider: Arc<dyn Provider>,
    grants: GrantSelection,
}

impl AutomaticReview {
    pub(super) fn new(
        host: &Host,
        policy: ReviewPolicy,
        execution: &Execution,
        provider: Arc<dyn Provider>,
    ) -> Self {
        Self {
            host: host.clone(),
            policy,
            prior_instructions: tokio::sync::OnceCell::new(),
            provider,
            grants: execution.authority.inference.clone(),
        }
    }

    async fn scoped_request(
        &self,
        state: &TurnState,
        basis: &approval_review::ReviewBasis<'_>,
        source: &InferenceRequest,
        action: approval_review::ScopedAction<'_>,
    ) -> Result<Option<InferenceRequest>> {
        // Only contributions made since the last ordinary prompt can name a
        // new target. Earlier restrictions still travel in the full evidence.
        let mut answers = Vec::new();
        let mut supplied = state.history().records().iter().rev().filter_map(|record| {
            let HistoryRecord::Message(message) = record;
            (message.role == Role::User && message.provenance.kind == ProvenanceKind::Supplied)
                .then_some(message)
        });
        let intent = loop {
            let Some(message) = supplied.next() else {
                return Ok(None);
            };
            if matches!(
                message.provenance.source.as_str(),
                "native-client" | super::message_context::SUPPLIED_SOURCE
            ) {
                break message;
            }
            let Some(reply) =
                grida_agent_master::questions::reply_in_context(state, message, &source.messages)
            else {
                return Ok(None);
            };
            answers.push(reply.answer);
            if answers.len() >= MAX_USER_INSTRUCTIONS {
                return Ok(None);
            }
        };
        let prior = self
            .prior_instructions
            .get_or_init(|| prior_instructions(&self.host, state))
            .await;
        let Some(mut instructions) = prior.clone() else {
            return Ok(None);
        };
        if append_instructions(
            &mut instructions,
            grida_agent_master::questions::transcript(state).iter(),
        )
        .is_none()
        {
            return Ok(None);
        }
        action.request(basis, source, intent, &answers, &instructions)
    }

    fn prepare(&self, candidate: &Candidate) -> Result<PreparedRequest> {
        let prepared = self.provider.prepare(candidate.request.clone())?;
        match candidate.input_limit {
            Some(limit) => prepared.with_input_limit(limit),
            None => Ok(prepared),
        }
    }

    async fn resolve(
        &self,
        basis: &TurnView,
        candidate: Candidate,
        operation: OperationId,
        prepared: PreparedRequest,
    ) -> Result<bool> {
        let binding = basis.state.binding().clone();
        let control = basis.state.controls().revision;
        let history = basis.state.history().position();
        let wait = candidate.wait.clone();
        let grants = self.grants.clone();
        let (session, resolution) = self
            .host
            .store
            .inspect_with_current(binding.session.clone(), {
                let binding = binding.clone();
                let operation = operation.clone();
                let wait = wait.clone();
                move |state| {
                    let Some(state) = state.filter(|state| state.binding() == &binding) else {
                        return Ok(Resolution::Pending);
                    };
                    let Some(retained) = state.waits().get(&wait) else {
                        return Ok(Resolution::Pending);
                    };
                    if read_approval(retained)? != candidate.approval {
                        return Ok(Resolution::Pending);
                    }
                    if retained.answer.is_some() {
                        return Ok(Resolution::Resolved);
                    }
                    if !retained.is_pending()
                        || !state.controls().admits_work()
                        || state.controls().revision != control
                        || state.history().position() != history
                    {
                        return Ok(Resolution::Pending);
                    }
                    let decision = state.operations().get(&operation).and_then(|record| {
                        approval_review::retained_decision(record, &prepared, &grants)
                    });
                    let decision = match decision {
                        Some(Decision::Allow) => ApprovalDecision::ApproveOnce,
                        Some(Decision::Deny) => ApprovalDecision::Decline,
                        Some(Decision::Ask(_)) | None => return Ok(Resolution::Pending),
                    };
                    Ok(Resolution::Review(reviewed_approval_answer(
                        retained,
                        decision,
                        Some(operation),
                    )?))
                }
            })
            .await?;
        let answer = match resolution {
            Resolution::Pending => return Ok(false),
            Resolution::Resolved => return Ok(true),
            Resolution::Review(answer) => answer,
        };
        let request = Fingerprint::of(&(&binding, &wait, &operation, &answer))?;
        let id = uuid::Uuid::from_bytes(request.bytes()[..16].try_into().expect("fingerprint"));
        match self
            .host
            .resolve_interaction(
                TurnControl {
                    session: binding.session,
                    turn: binding.turn.clone(),
                    request: ChangeId::new(format!("automatic-approval/{id}"))?,
                    expected_session: session.revision,
                    expected_control: control,
                },
                SessionControl::Resolve {
                    turn: binding.turn,
                    expected: control,
                    wait,
                    answer,
                },
                false,
                None,
            )
            .await
        {
            Ok(_) => Ok(true),
            Err(error)
                if error.kind == ErrorKind::Conflict || error.code == "host_shutting_down" =>
            {
                Ok(false)
            }
            Err(error) => Err(error),
        }
    }

    async fn review_candidate(
        &self,
        operations: &TurnOperations,
        basis: &TurnView,
        candidate: Candidate,
        allowance: u32,
    ) -> Result<bool> {
        let Ok(prepared) = self.prepare(&candidate) else {
            return Ok(false);
        };
        let key = match self.policy {
            ReviewPolicy::ConfiguredRead(_) => approval_review::operation_key(),
            ReviewPolicy::ApproveForMe { .. } => {
                let prior = approval_review::recorded_review(
                    &basis.state,
                    &candidate.approval.operation,
                    candidate.approval.action,
                    candidate.approval.scope,
                )?;
                let mut selected = None;
                for slot in 0..allowance {
                    let key = approval_review::scoped_operation_key(slot)?;
                    let operation = operations.operation_id(&key)?;
                    if prior.map_or_else(
                        || !basis.state.operations().contains_key(&operation),
                        |record| record.record.id == operation,
                    ) {
                        selected = Some(key);
                        break;
                    }
                }
                let Some(key) = selected else {
                    return Ok(false);
                };
                key
            }
        };
        let operation = operations.operation_id(&key)?;
        if !basis.state.operations().contains_key(&operation)
            && let Err(error) = operations
                .infer_until(
                    key,
                    prepared.clone(),
                    self.grants.clone(),
                    std::time::Instant::now() + approval_review::TIMEOUT,
                )
                .await
            && error.kind == ErrorKind::Uncertain
        {
            return Err(error);
        }
        // A provider protocol fault can release the owner before writing a
        // terminal outcome. Settle that evidence before the turn suspends.
        let view = operations.view();
        if let Some(review) = view.state.operations().get(&operation) {
            if review.is_running() && !view.active.contains(&operation) {
                operations.record_interruption(operation.clone()).await?;
            } else if review.outcome().is_none() && review.attempts.is_empty() {
                operations.cancel_prepared(operation.clone()).await?;
            }
        }
        self.resolve(basis, candidate, operation, prepared).await
    }
}

impl approval_review::Reviewer for AutomaticReview {
    fn allowance(&self, max_steps: u32) -> u32 {
        match self.policy {
            ReviewPolicy::ConfiguredRead(_) => u32::from(max_steps > 1),
            ReviewPolicy::ApproveForMe { .. } => {
                (max_steps / 2).min(approval_review::MAX_SCOPED_REVIEWS)
            }
        }
    }

    fn review<'a>(
        &'a self,
        operations: &'a TurnOperations,
        basis: &'a TurnView,
        deferred: &'a [WaitId],
    ) -> BoxFuture<'a, Result<bool>> {
        self.review_with_allowance(operations, basis, deferred, 1)
    }

    fn review_with_allowance<'a>(
        &'a self,
        operations: &'a TurnOperations,
        basis: &'a TurnView,
        deferred: &'a [WaitId],
        allowance: u32,
    ) -> BoxFuture<'a, Result<bool>> {
        Box::pin(async move {
            for wait in deferred {
                let current = operations.view();
                if !current.state.controls().admits_work()
                    || current.state.controls().revision != basis.state.controls().revision
                    || current.state.history().position() != basis.state.history().position()
                {
                    break;
                }
                if let Some(candidate) = Candidate::for_wait(self, &current.state, wait).await?
                    && self
                        .review_candidate(operations, &current, candidate, allowance)
                        .await?
                {
                    return Ok(true);
                }
            }
            Ok(false)
        })
    }
}

enum Resolution {
    Pending,
    Resolved,
    Review(Envelope),
}

struct Candidate {
    wait: WaitId,
    approval: ApprovalRequest,
    request: InferenceRequest,
    input_limit: Option<NonZeroU64>,
}

impl Candidate {
    async fn for_wait(
        reviewer: &AutomaticReview,
        state: &TurnState,
        id: &WaitId,
    ) -> Result<Option<Self>> {
        let Some(wait) = state
            .waits()
            .get(id)
            .filter(|wait| is_approval(wait) && wait.is_pending())
        else {
            return Ok(None);
        };
        let approval = read_approval(wait)?;
        if approval.session != state.binding().session || approval.turn != state.binding().turn {
            return Ok(None);
        }
        let Some(target) = state
            .operations()
            .get(&approval.operation)
            .filter(|target| {
                target.outcome().is_none()
                    && target.attempts.is_empty()
                    && matches!(&target.record.input, OperationInput::Tool(invocation)
                    if invocation.fingerprint() == approval.action)
            })
        else {
            return Ok(None);
        };
        let Some(OperationInput::Inference(source)) = target
            .record
            .origin
            .as_ref()
            .and_then(|origin| state.operations().get(origin))
            .map(|origin| &origin.record.input)
        else {
            return Ok(None);
        };
        let basis = approval_review::ReviewBasis {
            operation: &approval.operation,
            action: approval.action,
            scope: approval.scope,
            control: state.controls().revision,
            history: state.history().position(),
        };
        let request = match (&reviewer.policy, &approval.effect) {
            (
                ReviewPolicy::ConfiguredRead(profile),
                ApprovalEffect::Read {
                    tool,
                    relative_path,
                    query: None,
                },
            ) if tool.as_str() == "read_file" => {
                let Some(path) = relative_path.to_str() else {
                    return Ok(None);
                };
                let target = ReadTarget {
                    operation: basis.operation,
                    action: basis.action,
                    scope: basis.scope,
                    control: basis.control,
                    history: basis.history,
                    directory: &approval.directory,
                    relative_path: path,
                };
                profile.request(&target, source.request())?
            }
            (
                ReviewPolicy::ApproveForMe {
                    external_file_read: true,
                    ..
                },
                ApprovalEffect::Read {
                    tool,
                    relative_path,
                    query: None,
                },
            ) if tool.as_str() == "read_file"
                && approval.directory.as_str() == crate::file_tools::EXTERNAL_FILE_DIRECTORY
                && approval.root == Path::new("/") =>
            {
                let absolute_path = approval.root.join(relative_path);
                let Some(absolute_path) = absolute_path.to_str() else {
                    return Ok(None);
                };
                reviewer
                    .scoped_request(
                        state,
                        &basis,
                        source.request(),
                        approval_review::ScopedAction::ExternalFileRead { absolute_path },
                    )
                    .await?
            }
            (
                ReviewPolicy::ApproveForMe { .. },
                ApprovalEffect::Command {
                    access,
                    command,
                    terminal: false,
                    cwd,
                    executable,
                    network,
                    finite: true,
                    filesystem: Some(filesystem),
                    environment_names,
                },
            ) => {
                let (Some(cwd), Some(executable), Some(workspace_root)) =
                    (cwd.to_str(), executable.to_str(), approval.root.to_str())
                else {
                    return Ok(None);
                };
                if environment_names.len() > 128
                    || environment_names.iter().any(|name| {
                        name.is_empty()
                            || name.len() > 128
                            || !name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
                    })
                {
                    return Ok(None);
                }
                let filesystem_access = match access {
                    crate::command::CommandAccess::Read => "read",
                    crate::command::CommandAccess::ReadWrite => "read_write",
                };
                let command = approval_review::CommandReview {
                    command,
                    cwd,
                    executable,
                    workspace_root,
                    filesystem_access,
                    filesystem,
                    environment_names,
                };
                let action = match network {
                    Some(network) => approval_review::ScopedAction::NetworkCommand {
                        host: &network.host,
                        port: network.port,
                        command,
                    },
                    None => approval_review::ScopedAction::ConfinedCommand { command },
                };
                reviewer
                    .scoped_request(state, &basis, source.request(), action)
                    .await?
            }
            _ => None,
        };
        if let Some(request) = request {
            return Ok(Some(Self {
                wait: id.clone(),
                approval,
                request,
                input_limit: source.input_limit(),
            }));
        }
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ambiguous_or_incomplete_user_instructions_stay_with_the_person() {
        let input = |text: &str| {
            let mut messages = super::super::prompt_input(
                &ChangeId::new("submitted").unwrap(),
                &[PromptPart::Text { text: text.into() }],
            )
            .unwrap();
            HistoryRecord::Message(messages.remove(0))
        };
        let earlier = input("Keep this project offline.");
        let changed = input("Also cancel permission for that outside file.");
        let mut evidence = Vec::new();
        append_instructions(&mut evidence, [&earlier, &changed].into_iter()).unwrap();
        assert_eq!(
            evidence,
            [
                "Keep this project offline.",
                "Also cancel permission for that outside file."
            ]
        );

        let mut mixed = earlier.clone();
        let HistoryRecord::Message(message) = &mut mixed;
        message.content.push(Content::Text(
            "Attachment with additional restrictions.".into(),
        ));
        let resource = super::super::prompt_input(
            &ChangeId::new("attachment").unwrap(),
            &[PromptPart::ResourceLink {
                name: "This label cannot grant authorization.".into(),
                uri: "https://example.com".into(),
                mime_type: None,
            }],
        )
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
        for records in [
            vec![mixed],
            vec![HistoryRecord::Message(resource)],
            vec![input(&"x".repeat(MAX_INSTRUCTION_BYTES + 1))],
            vec![earlier; MAX_USER_INSTRUCTIONS + 1],
        ] {
            assert!(append_instructions(&mut Vec::new(), records.iter()).is_none());
        }
    }
}
