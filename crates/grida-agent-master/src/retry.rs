use agent_kit_core::authority::GrantSelection;
use agent_kit_core::inference::{
    DispatchEvidence, FailureKind, InferenceFailure, InferenceOutcome, InferenceStatus,
    PreparedRequest, ProviderBinding,
};
use agent_kit_core::{Error, ErrorKind, Result};
use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const MIN_DELAY_MS: u64 = 250;
const MAX_DELAY_MS: u64 = 5_000;

/// A single retry reservation for the exact provider and grant of a rejected step.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub(super) struct AdmissionRetry {
    pub(super) step: u32,
    pub(super) not_before_ms: u64,
    binding: ProviderBinding,
    grants: GrantSelection,
}

impl AdmissionRetry {
    pub(super) fn schedule(
        step: u32,
        request: &PreparedRequest,
        grants: &GrantSelection,
        inference: &InferenceOutcome,
    ) -> Option<Self> {
        let failure = admission_rejection(inference)?;
        let delay = failure
            .retry_after_ms
            .unwrap_or(MIN_DELAY_MS)
            .max(MIN_DELAY_MS);
        if delay > MAX_DELAY_MS {
            return None;
        }
        Some(Self {
            step,
            not_before_ms: now_ms()?.checked_add(delay)?,
            binding: request.binding().clone(),
            grants: grants.clone(),
        })
    }

    pub(super) fn delay(&self, grants: &GrantSelection) -> Result<Duration> {
        if grants != &self.grants {
            return Err(authority_changed());
        }
        let now = now_ms().ok_or_else(clock_unavailable)?;
        let remaining = self.not_before_ms.saturating_sub(now);
        if remaining > MAX_DELAY_MS {
            return Err(clock_unavailable());
        }
        Ok(Duration::from_millis(remaining))
    }

    pub(super) fn verify_request(&self, request: &PreparedRequest) -> Result<()> {
        if request.binding() != &self.binding {
            return Err(authority_changed());
        }
        Ok(())
    }
}

pub(super) fn admission_rejection(inference: &InferenceOutcome) -> Option<&InferenceFailure> {
    inference.failure.as_ref().filter(|failure| {
        inference.status == InferenceStatus::Failed
            && inference.messages.is_empty()
            && failure.kind == FailureKind::RateLimit
            && failure.dispatch == Some(DispatchEvidence::RejectedBeforeExecution)
    })
}

fn now_ms() -> Option<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis()
        .try_into()
        .ok()
}

fn authority_changed() -> Error {
    Error::new(ErrorKind::Conflict, "retry_authority_changed")
}

fn clock_unavailable() -> Error {
    Error::new(ErrorKind::Unavailable, "retry_clock_unavailable")
}
