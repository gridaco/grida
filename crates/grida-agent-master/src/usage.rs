//! Attempt-scoped inference usage derived from the execution record.

use agent_kit_core::inference::UsageObservation;
use agent_kit_core::turn::{OperationInput, OperationOutcome, TurnState};
use agent_kit_core::{AttemptId, Error, ErrorKind, Result};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct InferenceUsage {
    pub observations: Vec<UsageObservation>,
    pub unreported_attempts: Vec<AttemptId>,
}

impl InferenceUsage {
    /// Revisions replace earlier cumulative observations for one identity.
    /// Missing evidence stays explicit and never becomes zero consumption.
    pub fn from_turn(turn: &TurnState) -> Result<Self> {
        let mut result = Self::default();
        for operation in turn.operations().values() {
            if !matches!(&operation.record.input, OperationInput::Inference(_)) {
                continue;
            }
            for attempt in &operation.attempts {
                let mut latest = BTreeMap::new();
                for outcome in attempt.prior_outcomes.iter().chain(attempt.outcome.iter()) {
                    let OperationOutcome::Inference(outcome) = outcome else {
                        continue;
                    };
                    for observation in &outcome.usage {
                        retain(&mut latest, &attempt.id, observation)?;
                    }
                }
                if latest.is_empty() {
                    result.unreported_attempts.push(attempt.id.clone());
                }
                result.observations.extend(latest.into_values());
            }
        }
        Ok(result)
    }
}

fn retain(
    latest: &mut BTreeMap<(String, String, String), UsageObservation>,
    attempt: &AttemptId,
    observation: &UsageObservation,
) -> Result<()> {
    if &observation.attempt != attempt {
        return Err(Error::new(
            ErrorKind::InvalidState,
            "usage_attempt_mismatch",
        ));
    }
    let key = (
        observation.source.clone(),
        observation.category.clone(),
        observation.unit.clone(),
    );
    if let Some(previous) = latest.get(&key) {
        if previous.revision > observation.revision {
            return Ok(());
        }
        if previous.revision == observation.revision {
            return if previous == observation {
                Ok(())
            } else {
                Err(Error::new(
                    ErrorKind::InvalidState,
                    "usage_revision_conflict",
                ))
            };
        }
    }
    latest.insert(key, observation.clone());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_kit_core::inference::MeasurementKind;

    fn observation(revision: u64, quantity: u64) -> UsageObservation {
        UsageObservation {
            attempt: AttemptId::new("attempt").unwrap(),
            source: "provider".into(),
            category: "input_tokens".into(),
            unit: "tokens".into(),
            revision,
            quantity,
            certainty: MeasurementKind::Exact,
            final_value: revision > 1,
        }
    }

    #[test]
    fn cumulative_revisions_replace_and_repeated_delivery_is_idempotent() {
        let mut latest = BTreeMap::new();
        let first = observation(1, 5);
        let final_value = observation(2, 8);
        for value in [&first, &final_value, &first, &final_value] {
            retain(&mut latest, &first.attempt, value).unwrap();
        }
        assert_eq!(latest.into_values().collect::<Vec<_>>(), vec![final_value]);
    }

    #[test]
    fn categories_and_sources_remain_separate() {
        let mut latest = BTreeMap::new();
        let input = observation(1, 5);
        let mut cached = input.clone();
        cached.category = "cached_input_tokens".into();
        let mut estimated = input.clone();
        estimated.source = "local-estimator".into();
        estimated.certainty = MeasurementKind::Estimate;
        for value in [&input, &cached, &estimated] {
            retain(&mut latest, &input.attempt, value).unwrap();
        }
        assert_eq!(latest.len(), 3);
    }

    #[test]
    fn conflicting_revisions_and_misattributed_usage_are_rejected() {
        let mut latest = BTreeMap::new();
        let first = observation(1, 5);
        retain(&mut latest, &first.attempt, &first).unwrap();
        assert_eq!(
            retain(&mut latest, &first.attempt, &observation(1, 6))
                .unwrap_err()
                .code,
            "usage_revision_conflict"
        );
        assert_eq!(
            retain(
                &mut latest,
                &AttemptId::new("another-attempt").unwrap(),
                &first
            )
            .unwrap_err()
            .code,
            "usage_attempt_mismatch"
        );
        assert_eq!(latest.into_values().collect::<Vec<_>>(), vec![first]);
    }
}
