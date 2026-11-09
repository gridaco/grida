use crate::execution::fingerprint_name;
use crate::*;
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::messages::{Content, Message, Provenance, ProvenanceKind, Role, ToolResult};
use agent_kit_core::turn::{OperationInput, OperationOutcome};
use agent_kit_core::{MessageId, ToolCallId};
use futures_util::stream::{FuturesUnordered, StreamExt};
use std::pin::Pin;
use tokio::sync::mpsc;

type ToolWork =
    Pin<Box<dyn std::future::Future<Output = (ToolCall, Result<InvokeOutcome>)> + Send>>;

impl Turn {
    /// Execute one response and its complete tool calls. Transcript installation
    /// remains a separate atomic publication with the master's continuation.
    pub async fn step(&mut self, plan: StepPlan) -> Result<StepOutcome> {
        let operations = self.operations();
        let origin = operations.operation_id(&plan.key)?;
        let replay = self.view().state.operations().contains_key(&origin);
        if !replay {
            let mut offered = plan.request.request().tools.clone();
            offered.sort_by(|left, right| left.id.cmp(&right.id));
            if offered != plan.tools.offers()? {
                return Err(Error::new(ErrorKind::Conflict, "step_inventory_mismatch"));
            }
        }
        let (sender, mut receiver) = mpsc::channel(self.inner_capacity());
        let inference = operations.infer_updates(
            plan.key.clone(),
            plan.request.clone(),
            plan.inference_grants.clone(),
            Some(sender),
        );
        tokio::pin!(inference);
        let mut completed_inference = None;
        let mut calls = BTreeMap::<ToolCallId, ToolCall>::new();
        let mut results = BTreeMap::new();
        let mut work = FuturesUnordered::<ToolWork>::new();
        let mut input_closed = false;
        while completed_inference.is_none() || !input_closed || !work.is_empty() {
            tokio::select! {
                outcome = &mut inference, if completed_inference.is_none() => {
                    if let Ok(outcome) = &outcome {
                        for message in &outcome.messages {
                            for content in &message.content {
                                if let Content::ToolCall(call) = content {
                                    queue_call(&operations, &plan, &origin, call.clone(), &mut calls, &mut work, replay)?;
                                }
                            }
                        }
                    }
                    completed_inference = Some(outcome);
                }
                call = receiver.recv(), if !input_closed => {
                    match call {
                        Some(call) => queue_call(&operations, &plan, &origin, call, &mut calls, &mut work, replay)?,
                        None => input_closed = true,
                    }
                }
                result = work.next(), if !work.is_empty() => {
                    if let Some((call, result)) = result { results.insert(call.id, result?); }
                }
            }
        }
        let inference = completed_inference
            .ok_or_else(|| Error::new(ErrorKind::InvalidState, "inference_missing"))??;
        let tools: Vec<_> = calls
            .into_values()
            .map(|call| {
                let outcome = results
                    .remove(&call.id)
                    .ok_or_else(|| Error::new(ErrorKind::InvalidState, "tool_outcome_missing"))?;
                Ok(StepToolOutcome { call, outcome })
            })
            .collect::<Result<_>>()?;
        let history = if tools
            .iter()
            .any(|tool| matches!(tool.outcome, InvokeOutcome::Deferred(_)))
        {
            vec![]
        } else {
            candidate_history(&origin, inference.messages.iter().cloned(), &tools)?
        };
        Ok(StepOutcome {
            inference,
            tools,
            history,
        })
    }

    /// Project a step's recorded response and paired tool outcomes without
    /// admitting work. Only tool exchanges backed by a journaled result are
    /// included. The caller decides whether to publish the projection.
    pub async fn recorded_step_history(
        &self,
        key: &OperationKey,
    ) -> Result<Option<Vec<HistoryRecord>>> {
        let origin = self.operations().operation_id(key)?;
        let state = self.inner.refresh().await?;
        let Some(OperationOutcome::Inference(inference)) = state
            .operations()
            .get(&origin)
            .and_then(OperationState::outcome)
        else {
            return Ok(None);
        };
        let results: BTreeMap<_, _> = state
            .operations()
            .values()
            .filter_map(|operation| {
                let record = &operation.record;
                if record.origin.as_ref() != Some(&origin) {
                    return None;
                }
                let call = record.source_call.as_ref()?;
                let OperationInput::Tool(invocation) = &record.input else {
                    return None;
                };
                let Some(OperationOutcome::Tool(outcome)) = operation.outcome() else {
                    return None;
                };
                Some((call, (invocation, outcome)))
            })
            .collect();
        let mut tools = BTreeMap::new();
        let mut messages = Vec::new();
        for mut message in inference.messages.iter().cloned() {
            message.content.retain(|content| match content {
                Content::ToolCall(call) => {
                    let Some((invocation, outcome)) = results.get(&call.id) else {
                        return false;
                    };
                    if invocation.definition().id != call.tool
                        || invocation.arguments() != &call.arguments
                    {
                        return false;
                    }
                    tools.insert(
                        call.id.clone(),
                        StepToolOutcome {
                            call: call.clone(),
                            outcome: InvokeOutcome::Complete((*outcome).clone()),
                        },
                    );
                    true
                }
                Content::ToolResult(_) => false,
                _ => true,
            });
            if !message.content.is_empty() {
                messages.push(message);
            }
        }
        let tools: Vec<_> = tools.into_values().collect();
        Ok(Some(candidate_history(&origin, messages, &tools)?))
    }

    fn inner_capacity(&self) -> usize {
        self.inner.max_operations()
    }
}

fn queue_call(
    operations: &TurnOperations,
    plan: &StepPlan,
    origin: &OperationId,
    call: ToolCall,
    calls: &mut BTreeMap<ToolCallId, ToolCall>,
    work: &mut FuturesUnordered<ToolWork>,
    replay: bool,
) -> Result<()> {
    if let Some(existing) = calls.get(&call.id) {
        if existing != &call {
            return Err(Error::new(ErrorKind::Conflict, "tool_call_identity_reused"));
        }
        return Ok(());
    }
    calls.insert(call.id.clone(), call.clone());
    let tool_key = OperationKey::new(fingerprint_name("tool", &(&plan.key, &call.id))?)?;
    let operations = operations.clone();
    let inventory = plan.tools.clone();
    let selected_grants = plan.tool_grants.get(&call.tool).cloned();
    let origin = origin.clone();
    let operation_id = operations.operation_id(&tool_key)?;
    work.push(Box::pin(async move {
        let view = operations.view();
        let grants = match (view.operation(&operation_id), selected_grants) {
            (Some(recorded), _) if recorded.outcome().is_some() => {
                Some(recorded.record.grants.clone())
            }
            (Some(recorded), Some(selected)) => {
                let authority = &recorded.record.grants.authority;
                if selected.authority.principal != authority.principal
                    || selected.authority.scope != authority.scope
                {
                    return (
                        call,
                        Err(Error::new(ErrorKind::Conflict, "operation_identity_reused")),
                    );
                }
                // A fresh selection keeps this tool eligible. Dispatch still
                // validates the exact authority recorded with the action.
                Some(recorded.record.grants.clone())
            }
            (_, selected) => selected,
        };
        let Some(grants) = grants else {
            return (
                call,
                Err(Error::new(ErrorKind::Unavailable, "tool_authority_missing")),
            );
        };
        let result = operations
            .invoke_captured(
                tool_key,
                PlannedInvocation {
                    tool: call.tool.clone(),
                    arguments: call.arguments.clone(),
                    grants,
                },
                inventory,
                Some(origin),
                Some(call.id.clone()),
            )
            .await;
        let result = match result {
            Err(error)
                if error.kind == ErrorKind::InvalidInput
                    || (!replay && error.code == "tool_unavailable") =>
            {
                Ok(InvokeOutcome::Complete(ToolOutcome::failed(&error.code)))
            }
            result => result,
        };
        (call, result)
    }));
    Ok(())
}

fn candidate_history(
    origin: &OperationId,
    messages: impl IntoIterator<Item = Message>,
    tools: &[StepToolOutcome],
) -> Result<Vec<HistoryRecord>> {
    let mut records: Vec<_> = messages.into_iter().map(HistoryRecord::Message).collect();
    for tool in tools {
        let InvokeOutcome::Complete(outcome) = &tool.outcome else {
            continue;
        };
        records.push(HistoryRecord::Message(Message {
            id: MessageId::new(fingerprint_name("result", &(origin, &tool.call.id))?)?,
            role: Role::Tool,
            phase: None,
            content: vec![Content::ToolResult(ToolResult {
                call: tool.call.id.clone(),
                status: outcome.status,
                content: outcome.content.clone(),
                structured: outcome.structured.clone(),
                truncated: outcome.truncated,
            })],
            provenance: Provenance {
                source: "tool".into(),
                kind: ProvenanceKind::Observed,
                fingerprint: None,
            },
        }));
    }
    Ok(records)
}
