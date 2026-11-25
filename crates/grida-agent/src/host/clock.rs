//! Local clock tools for a single active turn.

use super::problem;
use crate::waiting;
use agent_kit_core::authority::{AuthorityBinding, GrantSelection};
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{OutcomeStatus, ResultContent, ToolArguments};
use agent_kit_core::tools::{
    Inventory, InventorySnapshot, Invocation, InvocationContext, InvocationRecovery, RecoveryKind,
    Tool, ToolDefinition, ToolOutcome,
};
use agent_kit_core::turn::TurnBinding;
use agent_kit_core::{
    BindingId, BoxFuture, ErrorKind, Fingerprint, GrantId, PrincipalId, Result, ScopeId, ToolId,
};
use agent_kit_runtime::{ToolAdmission, ToolDecision, TurnOperations};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::Duration;
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

const SLEEP: &str = "clock_sleep";
const CURRENT_TIME: &str = "clock_curr_time";

#[derive(Clone)]
pub(super) struct Access(GrantSelection);

impl Access {
    pub(super) fn bind(binding: &TurnBinding) -> Result<Self> {
        Ok(Self(GrantSelection {
            authority: AuthorityBinding {
                principal: PrincipalId::new("grida-local")?,
                binding: BindingId::new(format!(
                    "clock/{}",
                    Fingerprint::of(&(&binding.session, &binding.turn))?.to_hex()
                ))?,
                scope: ScopeId::new("active-turn-clock")?,
            },
            grants: vec![GrantId::new("clock")?],
        }))
    }

    pub(super) fn accepts(&self, selection: &GrantSelection) -> bool {
        &self.0 == selection
    }

    pub(super) fn decide(&self, admission: &ToolAdmission) -> Result<ToolDecision> {
        let offered = admission.invocation.definition();
        if !self.accepts(&admission.grants) || *offered != definition(offered.id.as_str())? {
            return Err(problem(ErrorKind::Unavailable, "clock_unavailable"));
        }
        Ok(ToolDecision::Permit)
    }

    pub(super) fn insert(
        &self,
        inventory: &mut Inventory,
        grants: &mut BTreeMap<ToolId, GrantSelection>,
    ) -> Result<()> {
        for name in [SLEEP, CURRENT_TIME] {
            let definition = definition(name)?;
            grants.insert(definition.id.clone(), self.0.clone());
            inventory.insert(Arc::new(Clock { definition }))?;
        }
        Ok(())
    }

    pub(super) async fn reconcile(
        &self,
        operations: &TurnOperations,
        tools: &InventorySnapshot,
    ) -> Result<()> {
        let view = operations.view();
        for (id, operation) in view.state.operations() {
            if self.accepts(&operation.record.grants)
                && (operation.is_running() || operation.is_uncertain())
            {
                operations.reconcile_tool(id.clone(), tools.clone()).await?;
            }
        }
        Ok(())
    }
}

struct Clock {
    definition: ToolDefinition,
}

fn definition(id: &str) -> Result<ToolDefinition> {
    let (description, properties, required) = match id {
        SLEEP => (
            "Wait in the active turn for a fixed duration. Returns elapsed wall time, and ends early if new input reaches this turn. Use this between checks of external work when there is no command session to wait on.",
            json!({"duration_ms":{"type":"integer","minimum":1,"maximum":waiting::MAX_MS}}),
            json!(["duration_ms"]),
        ),
        CURRENT_TIME => ("Return the current time in UTC.", json!({}), json!([])),
        _ => return Err(problem(ErrorKind::Unavailable, "clock_unavailable")),
    };
    Ok(ToolDefinition {
        id: ToolId::new(id)?,
        version: 1,
        description: description.into(),
        input: InputFormat::Json(json!({
            "type":"object", "properties":properties, "required":required, "additionalProperties":false
        })),
        max_input_bytes: 256,
        max_output_bytes: 1024,
        recovery: RecoveryKind::Reconcile,
    })
}

fn sleep_duration(arguments: &ToolArguments) -> Result<Duration> {
    let ToolArguments::Json(Value::Object(args)) = arguments else {
        return Err(problem(ErrorKind::InvalidInput, "clock_arguments_invalid"));
    };
    args.get("duration_ms")
        .filter(|_| args.len() == 1)
        .and_then(Value::as_u64)
        .filter(|millis| (1..=waiting::MAX_MS).contains(millis))
        .map(Duration::from_millis)
        .ok_or_else(|| problem(ErrorKind::InvalidInput, "clock_duration_invalid"))
}

impl Tool for Clock {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }

    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        if self.definition.id.as_str() == SLEEP {
            sleep_duration(arguments)?;
        } else if !matches!(arguments, ToolArguments::Json(Value::Object(args)) if args.is_empty())
        {
            return Err(problem(ErrorKind::InvalidInput, "clock_arguments_invalid"));
        }
        Ok(())
    }

    fn wait_timeout(&self, arguments: &ToolArguments) -> Option<Duration> {
        if self.definition.id.as_str() != SLEEP {
            return None;
        }
        sleep_duration(arguments)
            .ok()
            .map(waiting::execution_timeout)
    }

    fn invoke(
        &self,
        invocation: Invocation,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            if self.definition.id.as_str() == CURRENT_TIME {
                return OffsetDateTime::now_utc()
                    .format(&Rfc3339)
                    .map(|time| {
                        outcome(
                            OutcomeStatus::Succeeded,
                            format!("Current time: {time}"),
                            json!({"current_time":time}),
                        )
                    })
                    .unwrap_or_else(|_| ToolOutcome::failed("clock_unavailable"));
            }
            let duration = match sleep_duration(invocation.arguments()) {
                Ok(duration) => duration,
                Err(error) => return ToolOutcome::failed(&error.code),
            };
            sleep(duration, &context).await
        })
    }

    fn recover(&self, _: InvocationRecovery, _: InvocationContext) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async {
            outcome(
                OutcomeStatus::Cancelled,
                "The previous clock call was interrupted before its result was recorded.".into(),
                json!({"status":"interrupted"}),
            )
        })
    }
}

async fn sleep(duration: Duration, context: &InvocationContext) -> ToolOutcome {
    let start = tokio::time::Instant::now();
    let until = waiting::until(start.into_std(), duration, context.deadline);
    let reached_requested_duration = until >= start.into_std() + duration;
    let (status, reason, text) = tokio::select! {
        biased;
        _ = context.cancellation.cancelled() => (OutcomeStatus::Cancelled, "cancelled", "Sleep cancelled."),
        _ = context.input_activity.cancelled() => (OutcomeStatus::Succeeded, "input", "Sleep interrupted by new input."),
        _ = tokio::time::sleep_until(until.into()) => {
            if reached_requested_duration {
                (OutcomeStatus::Succeeded, "elapsed", "Sleep completed.")
            } else {
                (OutcomeStatus::Failed, "deadline", "Sleep ended at the operation deadline.")
            }
        },
    };
    let elapsed = start.elapsed();
    outcome(
        status,
        format!("Wall time: {:.4} seconds\n{text}", elapsed.as_secs_f64()),
        json!({"status":reason,"elapsed_ms":elapsed.as_millis()}),
    )
}

fn outcome(status: OutcomeStatus, text: String, details: Value) -> ToolOutcome {
    ToolOutcome {
        status,
        content: vec![ResultContent::Text(text)],
        structured: Some(details),
        receipt: None,
        truncated: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_kit_core::{AttemptId, CancellationToken};

    fn context() -> InvocationContext {
        InvocationContext {
            attempt: AttemptId::new("clock").unwrap(),
            cancellation: CancellationToken::new(),
            input_activity: CancellationToken::new(),
            deadline: None,
            max_output_bytes: 1024,
        }
    }

    #[tokio::test(start_paused = true)]
    async fn clock_wait_reports_elapsed_and_respects_input_and_cancellation() {
        for interruption in [None, Some("input"), Some("cancelled")] {
            let context = context();
            let wait = sleep(Duration::from_secs(60), &context);
            tokio::pin!(wait);
            assert!(futures_util::poll!(&mut wait).is_pending());
            tokio::time::advance(Duration::from_secs(20)).await;
            assert!(futures_util::poll!(&mut wait).is_pending());
            match interruption {
                Some("input") => context.input_activity.cancel(),
                Some("cancelled") => context.cancellation.cancel(),
                _ => tokio::time::advance(Duration::from_secs(40)).await,
            }
            let outcome = wait.await;
            let elapsed = if interruption.is_some() {
                20_000
            } else {
                60_000
            };
            assert_eq!(
                outcome.structured.unwrap(),
                json!({"status":interruption.unwrap_or("elapsed"),"elapsed_ms":elapsed})
            );
        }
    }
}
