use super::{
    CriterionEvidence, Goal, ProgressAccount, Report, SCHEMA, Status, VerifiedCriterion,
    WorkOutcome, problem, tools,
};
use agent_kit_core::driver_state::DriverStateChange;
use agent_kit_core::messages::OutcomeStatus;
use agent_kit_core::turn::{OperationInput, OperationState, TurnState};
use agent_kit_core::{ErrorKind, OperationId, Result, ToolCallId};
use std::collections::{BTreeMap, BTreeSet};

pub(crate) type Verifier = dyn Fn(&str, &OperationState) -> bool + Send + Sync;

pub(crate) fn step_limit(state: &TurnState, configured: u32, reserves_child: bool) -> Result<u32> {
    let goal = work_goal(state)?;
    if goal.is_some() && reserves_child {
        return Err(problem(
            ErrorKind::Unsupported,
            "goal_child_allowance_unavailable",
        ));
    }
    Ok(goal.map_or(configured, |goal| {
        configured.min(
            goal.reservation()
                .expect("reserved work")
                .inference_steps
                .get(),
        )
    }))
}

/// One eligible call per criterion for the current reserved work. These hints
/// describe recorded evidence; the final proposal must still be evaluated.
pub(crate) fn evidence_hints(
    state: &TurnState,
    verify: &Verifier,
) -> Result<Vec<CriterionEvidence>> {
    let Some(goal) = work_goal(state)? else {
        return Ok(Vec::new());
    };
    if goal.paused()
        || &goal.reservation().expect("reserved work").basis != goal.basis()
        || !state.controls().admits_work()
        || state
            .operations()
            .values()
            .any(OperationState::is_uncertain)
    {
        return Ok(Vec::new());
    }
    let operations = unique_calls(state);
    Ok(goal
        .objective()
        .criteria
        .iter()
        .enumerate()
        .filter_map(|(index, criterion)| {
            let (&call, _) = operations.iter().find(|(_, operation)| {
                operation.is_some_and(|operation| verified(criterion, operation, verify))
            })?;
            Some(CriterionEvidence {
                criterion: u8::try_from(index + 1).ok()?,
                call: call.clone(),
            })
        })
        .collect())
}

pub(crate) fn prepare(
    state: &TurnState,
    status: OutcomeStatus,
    verifier: Option<&Verifier>,
) -> Result<Option<(DriverStateChange, ProgressAccount)>> {
    let Some(mut goal) = work_goal(state)? else {
        return Ok(None);
    };
    let reservation = goal.reservation().expect("reserved work");
    let turn = &state.binding().turn;
    let inference_steps = state
        .operations()
        .values()
        .filter(|operation| matches!(operation.record.input, OperationInput::Inference(_)))
        .try_fold(0_u32, |total, operation| {
            u32::try_from(operation.attempts.len())
                .ok()
                .and_then(|count| total.checked_add(count))
                .ok_or_else(|| problem(ErrorKind::LimitExceeded, "goal_step_account_limit"))
        })?;
    let mut verified = BTreeMap::new();
    let confirmed: BTreeSet<_>;
    let outcome = if status == OutcomeStatus::Uncertain
        || state
            .operations()
            .values()
            .any(OperationState::is_uncertain)
    {
        WorkOutcome::Uncertain {
            observed_steps: inference_steps,
        }
    } else if state
        .operations()
        .values()
        .all(|operation| operation.attempts.is_empty())
    {
        WorkOutcome::NotDispatched
    } else {
        let report = (status == OutcomeStatus::Succeeded
            && !goal.paused()
            && &reservation.basis == goal.basis())
        .then(|| recorded_report(state, &goal))
        .flatten();
        if let (Some(Report::Completion { evidence, .. }), Some(verifier)) = (&report, verifier) {
            verified = verified_links(state, &goal, evidence, verifier);
        }
        confirmed = verified.keys().cloned().collect();
        WorkOutcome::Settled {
            inference_steps,
            report,
            verified_evidence: &confirmed,
        }
    };
    goal.account(turn, outcome)?;
    let account = ProgressAccount {
        basis: goal.basis().clone(),
        status: goal.status(),
        paused: goal.paused(),
        progress: goal.progress().map(str::to_owned),
        spent: goal.spent(),
        remaining: goal.remaining(),
        held: goal.reservation().cloned(),
        verified: if goal.status() == Status::Complete {
            verified
                .into_iter()
                .map(|(link, operation)| VerifiedCriterion {
                    criterion: link.criterion,
                    operation,
                })
                .collect()
        } else {
            vec![]
        },
    };
    Ok(Some((
        DriverStateChange {
            expected: state.driver_state().revision(),
            value: Some(goal.encode()?),
        },
        account,
    )))
}

fn work_goal(state: &TurnState) -> Result<Option<Goal>> {
    let Some(envelope) = state
        .driver_state()
        .value()
        .filter(|value| value.schema().as_str() == SCHEMA)
    else {
        return Ok(None);
    };
    let goal = Goal::decode(envelope)?;
    Ok(goal
        .reservation()
        .is_some_and(|reservation| reservation.turn == state.binding().turn)
        .then_some(goal))
}

fn recorded_report(state: &TurnState, goal: &Goal) -> Option<Report> {
    let mut accepted = None;
    for operation in state.operations().values() {
        let Some(report) =
            tools::read_report(operation, &state.binding().turn, goal.basis()).ok()?
        else {
            continue;
        };
        match &accepted {
            None => accepted = Some(report),
            Some(previous) if previous == &report => {}
            Some(_) => return None,
        }
    }
    accepted
}

fn verified_links(
    state: &TurnState,
    goal: &Goal,
    evidence: &[CriterionEvidence],
    verify: &Verifier,
) -> BTreeMap<CriterionEvidence, OperationId> {
    let operations = unique_calls(state);
    evidence
        .iter()
        .filter_map(|link| {
            let criterion = goal
                .objective()
                .criteria
                .get(usize::from(link.criterion.checked_sub(1)?))?;
            let operation = operations.get(&link.call).copied().flatten()?;
            verified(criterion, operation, verify)
                .then(|| (link.clone(), operation.record.id.clone()))
        })
        .collect()
}

fn unique_calls(state: &TurnState) -> BTreeMap<&ToolCallId, Option<&OperationState>> {
    let mut calls = BTreeMap::new();
    for operation in state.operations().values() {
        if let Some(call) = &operation.record.source_call {
            calls
                .entry(call)
                .and_modify(|value| *value = None)
                .or_insert(Some(operation));
        }
    }
    calls
}

fn verified(criterion: &str, operation: &OperationState, verify: &Verifier) -> bool {
    matches!(&operation.record.input, OperationInput::Tool(invocation)
        if !tools::is_goal_tool(&invocation.definition().id))
        && operation
            .outcome()
            .is_some_and(|outcome| outcome.is_success())
        && verify(criterion, operation)
}
