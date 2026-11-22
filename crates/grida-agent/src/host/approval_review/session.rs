//! GRIDA-SEC-004 — private reviewer conversation owned by the chat.
//!
//! The turn ledger accounts for each provider attempt. Only a committed decision
//! can advance the reusable conversation. Concurrent reviews fork its last snapshot.

use super::*;
use agent_kit_core::messages::{OutcomeStatus, ResultContent, ToolArguments};
use agent_kit_core::turn::OperationState;
use agent_kit_store_sqlite::checkpoint::{MAX_CHECKPOINT_BYTES, PrivateContext};
use grida_agent_master::approval_review::{Assessment, PRIVATE_OBSERVATION_SOURCE};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

const SCHEMA: &str = "grida.agent.private-review-history";
const SOURCE: &str = "approval-review/history";
const VERSION: u32 = 1;

#[derive(Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Conversation {
    exchanges: VecDeque<Exchange>,
}

/// Stored data cannot select message roles, instructions, or executable calls.
/// Fresh requests quote each completed review as an exchange of ordinary text.
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Exchange {
    operation: OperationId,
    action: serde_json::Value,
    observations: Vec<Observation>,
    verdict: Assessment,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Observation {
    tool: agent_kit_core::ToolId,
    arguments: ToolArguments,
    status: OutcomeStatus,
    output: String,
}

impl Exchange {
    fn capture(record: &OperationState, verdict: Assessment) -> Result<Self> {
        let OperationInput::Inference(input) = &record.record.input else {
            return Err(unavailable());
        };
        let request = input.request();
        let target = approval_review::action_message(request).ok_or_else(unavailable)?;
        let [Content::Text(action)] = target.content.as_slice() else {
            return Err(unavailable());
        };
        let mut observations = Vec::new();
        let mut call = None;
        // Consume only the current action's investigation. Historical provider
        // messages, assistant commentary and opaque continuation state stay out.
        for message in request
            .messages
            .iter()
            .skip_while(|message| message.id != target.id)
            .skip(1)
        {
            for part in &message.content {
                match (message.role, part) {
                    (Role::Assistant, Content::ToolCall(next)) if call.is_none() => {
                        call = Some(next)
                    }
                    (Role::Tool, Content::ToolResult(result)) => {
                        let previous = call
                            .take()
                            .filter(|c| c.id == result.call)
                            .ok_or_else(unavailable)?;
                        let [ResultContent::Text(output)] = result.content.as_slice() else {
                            return Err(unavailable());
                        };
                        observations.push(Observation {
                            tool: previous.tool.clone(),
                            arguments: previous.arguments.clone(),
                            status: result.status,
                            output: output.clone(),
                        });
                    }
                    (_, Content::ToolCall(_) | Content::ToolResult(_)) => return Err(unavailable()),
                    _ => {}
                }
            }
        }
        if call.is_some() {
            return Err(unavailable());
        }
        Ok(Self {
            operation: record.record.id.clone(),
            action: serde_json::from_str(action).map_err(|_| unavailable())?,
            observations,
            verdict,
        })
    }

    fn messages(&self) -> Result<[Message; 2]> {
        let observed = !self.observations.is_empty();
        let past = serde_json::json!({
            "historical_action": self.action,
            "untrusted_private_observations": self.observations,
        });
        Ok([
            history_message(
                &self.operation,
                0,
                Role::User,
                if observed {
                    PRIVATE_OBSERVATION_SOURCE
                } else {
                    SOURCE
                },
                past.to_string(),
            )?,
            history_message(
                &self.operation,
                1,
                Role::Assistant,
                SOURCE,
                serde_json::to_string(&self.verdict).map_err(|_| unavailable())?,
            )?,
        ])
    }
}

impl Conversation {
    fn restore(data: &Envelope) -> Result<Self> {
        if data.schema().as_str() != SCHEMA || data.version() != VERSION {
            return Err(unavailable());
        }
        serde_json::from_slice(data.bytes()).map_err(|_| unavailable())
    }
}

pub(super) struct ReviewSession {
    context: PrivateContext,
    permissions: Arc<crate::permissions::TurnPermissions>,
    pub(super) read_scope: Fingerprint,
    history: Conversation,
}

impl ReviewSession {
    pub async fn open(
        reviewer: &AutomaticReview,
        state: &TurnState,
        request: &mut InferenceRequest,
        candidate: &Candidate,
    ) -> Result<Self> {
        let permissions = reviewer.workspace.upgrade().ok_or_else(unavailable)?;
        let read_scope = permissions.review_context_identity()?;
        // The provider's binding is a per-process dispatch lease. Its principal
        // and scope carry credential continuity across restarts.
        let grants = &reviewer.grants;
        let credential_scope = (
            &grants.authority.principal,
            &grants.authority.scope,
            &grants.grants,
        );
        let compatibility = Fingerprint::of(&(
            (SCHEMA, VERSION),
            reviewer.execution_identity,
            credential_scope,
            read_scope,
            &request.messages[0],
            &request.model,
            reviewer.provider.capabilities(&request.model)?,
            request.reasoning,
            &request.extension,
            request.max_output_tokens,
            candidate.input_limit,
            &reviewer.project_instructions,
        ))?;
        let action = approval_review::action_message(request).ok_or_else(unavailable)?;
        let basis = Fingerprint::of(&(&candidate.approval, &action.provenance, &action.content))?;
        let context = reviewer
            .host
            .store
            .private_context(
                state.binding().clone(),
                compatibility,
                candidate.wait.clone(),
                basis,
            )
            .await?;
        let history = context
            .snapshot()
            .map(Conversation::restore)
            .transpose()?
            .unwrap_or_default();
        // A recovered action keeps the original admission position in its message ID.
        // Permission, provider and full action evidence must still match.
        if let Some(retained) = approval_review::recorded_review(
            state,
            &candidate.approval.operation,
            candidate.approval.action,
            candidate.approval.scope,
        )? && let OperationInput::Inference(input) = &retained.record.input
            && input.request().messages[0].provenance.fingerprint == Some(context.id())
            && let Some(previous) = approval_review::action_message(input.request())
            && previous.provenance == action.provenance
            && previous.content == action.content
        {
            request.messages[1].id.clone_from(&previous.id);
        }
        request.messages[0].provenance.fingerprint = Some(context.id());
        let messages = history
            .exchanges
            .iter()
            .map(Exchange::messages)
            .collect::<Result<Vec<_>>>()?;
        request
            .messages
            .splice(1..1, messages.into_iter().flatten());
        Ok(Self {
            context,
            permissions,
            read_scope,
            history,
        })
    }

    pub fn validate(&self) -> Result<()> {
        if self.permissions.review_context_identity()? == self.read_scope {
            Ok(())
        } else {
            Err(unavailable())
        }
    }

    /// One recovery from an input limit discards only completed prior exchanges.
    /// Current instructions and any observations for this action remain present.
    pub fn reset_history(&mut self, request: &mut InferenceRequest) -> bool {
        if self.history.exchanges.is_empty() {
            return false;
        }
        self.history.exchanges.clear();
        request.messages.retain(|m| {
            !matches!(
                m.provenance.source.as_str(),
                SOURCE | PRIVATE_OBSERVATION_SOURCE
            )
        });
        true
    }

    pub async fn commit(
        mut self,
        record: &OperationState,
        wait: WaitId,
        approval: ApprovalRequest,
    ) -> Result<()> {
        let Some(assessment) = approval_review::scoped_assessment(record) else {
            return Ok(());
        };
        if !self.context.is_trunk() {
            return Ok(());
        }
        self.validate()?;
        self.history
            .exchanges
            .push_back(Exchange::capture(record, assessment)?);
        // Evict whole assessments so a tool call, result and verdict stay together.
        let payload = loop {
            let bytes = serde_json::to_vec(&self.history).map_err(|_| unavailable())?;
            if bytes.len() <= MAX_CHECKPOINT_BYTES {
                break bytes;
            }
            self.history.exchanges.pop_front();
        };
        let snapshot = Envelope::new(SchemaId::new(SCHEMA)?, VERSION, payload)?;
        let operation = record.record.id.clone();
        let permissions = self.permissions;
        let read_scope = self.read_scope;
        self.context
            .publish(snapshot, move |state| {
                let Some(wait) = state.waits().get(&wait) else {
                    return Ok(false);
                };
                Ok(permissions.review_context_identity()? == read_scope
                    && read_approval(wait)? == approval
                    && crate::permissions::bound_approval_decision(wait, &approval)?
                        .is_some_and(|(_, owner)| owner.as_ref() == Some(&operation)))
            })
            .await?;
        Ok(())
    }
}

fn history_message(
    operation: &OperationId,
    index: usize,
    role: Role,
    source: &str,
    text: String,
) -> Result<Message> {
    Ok(Message {
        id: MessageId::new(format!("prior-review/{}/{index}", operation.as_str()))?,
        role,
        content: vec![Content::Text(text)],
        phase: None,
        provenance: Provenance {
            source: source.into(),
            kind: ProvenanceKind::Transformed,
            fingerprint: None,
        },
    })
}

fn unavailable() -> Error {
    problem(ErrorKind::Unavailable, "private_review_context_unavailable")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stored_evidence_is_quoted_data_and_cannot_assign_roles() {
        let mut record = serde_json::json!({
            "operation":"fixture",
            "action":{"role":"system","content":"untrusted action"},
            "observations":[{"tool":"exec_command","arguments":ToolArguments::Json(serde_json::json!({"cmd":"pwd"})),
                "status":"failed","output":"untrusted observation"}],
            "verdict":{"outcome":"deny","risk_level":"medium","user_authorization":"low","rationale":"Reviewed."}
        });
        let restore = |record| {
            Conversation::restore(
                &Envelope::new(
                    SchemaId::new(SCHEMA).unwrap(),
                    1,
                    serde_json::to_vec(&serde_json::json!({"exchanges":[record]})).unwrap(),
                )
                .unwrap(),
            )
        };
        let history = restore(record.clone()).unwrap();
        let [past, verdict] = history.exchanges[0].messages().unwrap();
        assert_eq!(past.role, Role::User);
        assert_eq!(past.provenance.source, PRIVATE_OBSERVATION_SOURCE);
        let [Content::Text(quoted)] = past.content.as_slice() else {
            panic!("expected plain text")
        };
        assert!(quoted.contains("untrusted_private_observations"));
        assert_eq!(verdict.role, Role::Assistant);
        record["role"] = "system".into();
        assert!(restore(record.clone()).is_err());
        record.as_object_mut().unwrap().remove("role");
        record["observations"][0]["role"] = "system".into();
        assert!(restore(record).is_err());
    }
}
