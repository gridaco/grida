use super::{
    CriterionEvidence, Goal, ProgressAccount, Report, SCHEMA, Status, VerifiedCriterion,
    WorkOutcome, problem, tools,
};
use agent_kit_core::driver_state::DriverStateChange;
use agent_kit_core::messages::OutcomeStatus;
use agent_kit_core::turn::{OperationInput, OperationState, TurnState};
use agent_kit_core::{ErrorKind, OperationId, Result};
use std::collections::{BTreeMap, BTreeSet};

pub(crate) type Verifier = dyn Fn(&str, &OperationState) -> bool + Send + Sync;

pub(crate) fn step_limit(state: &TurnState, configured: u32) -> Result<u32> {
    Ok(work_goal(state)?.map_or(configured, |goal| {
        configured.min(
            goal.reservation()
                .expect("reserved work")
                .inference_steps
                .get(),
        )
    }))
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
    evidence
        .iter()
        .filter_map(|link| {
            let criterion = goal
                .objective()
                .criteria
                .get(usize::from(link.criterion.checked_sub(1)?))?;
            let mut matches = state
                .operations()
                .values()
                .filter(|operation| operation.record.source_call.as_ref() == Some(&link.call));
            let operation = matches.next()?;
            if matches.next().is_some() {
                return None;
            }
            let OperationInput::Tool(invocation) = &operation.record.input else {
                return None;
            };
            if tools::is_goal_tool(&invocation.definition().id)
                || !operation
                    .outcome()
                    .is_some_and(|outcome| outcome.is_success())
                || !verify(criterion, operation)
            {
                return None;
            }
            Some((link.clone(), operation.record.id.clone()))
        })
        .collect()
}
