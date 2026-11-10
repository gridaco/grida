use super::{
    ChildWork, CriterionEvidence, Goal, ProgressAccount, Report, SCHEMA, Status, VerifiedCriterion,
    WorkOutcome, inference_attempts, problem, tools,
};
use agent_kit_core::driver_state::DriverStateChange;
use agent_kit_core::messages::OutcomeStatus;
use agent_kit_core::turn::{OperationInput, OperationState, TurnState};
use agent_kit_core::{ErrorKind, OperationId, Result, ToolCallId};
use std::collections::{BTreeMap, BTreeSet};

pub(crate) type Verifier = dyn Fn(&str, &OperationState) -> bool + Send + Sync;

pub(crate) fn step_limit(state: &TurnState, configured: u32, child_steps: u32) -> Result<u32> {
    let Some(goal) = work_goal(state)? else {
        return Ok(configured);
    };
    let reservation = goal.reservation().expect("reserved work");
    let child = reservation
        .child_inference_steps
        .map_or(0, |steps| steps.get());
    if child != child_steps && !state.controls().cancelled {
        return Err(problem(
            ErrorKind::Unsupported,
            "goal_child_allowance_unavailable",
        ));
    }
    Ok(configured.min(reservation.inference_steps.get() - child))
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
    child: Option<ChildWork>,
) -> Result<Option<(DriverStateChange, ProgressAccount)>> {
    let Some(mut goal) = work_goal(state)? else {
        return Ok(None);
    };
    let reservation = goal.reservation().expect("reserved work");
    let turn = &state.binding().turn;
    let parent_steps = inference_attempts(state)?;
    let parent_limit = reservation.inference_steps.get()
        - reservation
            .child_inference_steps
            .map_or(0, |steps| steps.get());
    if parent_steps > parent_limit {
        return Err(problem(
            ErrorKind::InvalidState,
            "goal_step_account_mismatch",
        ));
    }
    let (child_steps, child_unsettled) = match reservation.child_inference_steps {
        None => (0, false),
        Some(limit) => match child {
            Some(ChildWork::Settled { observed_steps }) if observed_steps <= limit.get() => {
                (observed_steps, false)
            }
            Some(ChildWork::Unsettled { observed_steps }) if observed_steps <= limit.get() => {
                (observed_steps, true)
            }
            _ => (0, true),
        },
    };
    let inference_steps = parent_steps
        .checked_add(child_steps)
        .ok_or_else(|| problem(ErrorKind::LimitExceeded, "goal_step_account_limit"))?;
    let mut verified = BTreeMap::new();
    let confirmed: BTreeSet<_>;
    let outcome = if child_unsettled
        || status == OutcomeStatus::Uncertain
        || state
            .operations()
            .values()
            .any(OperationState::is_uncertain)
    {
        WorkOutcome::Uncertain {
            observed_steps: inference_steps,
        }
    } else if child_steps == 0
        && state
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

pub(crate) fn work_goal(state: &TurnState) -> Result<Option<Goal>> {
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
