use agent_kit_core::authority::{AuthorityBinding, GrantSelection};
use agent_kit_core::inference::{
    DispatchEvidence, FailureKind, InferenceFailure, InferenceOutcome, InferenceStatus,
    PreparedRequest, ProviderBinding,
};
use agent_kit_core::{Error, ErrorKind, Result};
use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const MIN_DELAY_MS: u64 = 250;
const MAX_DELAY_MS: u64 = 5_000;

/// A single retry reservation for the rejected step's provider, scope and grants.
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
        let delay = failure.retry_after_ms?.max(MIN_DELAY_MS);
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
        if grants.grants != self.grants.grants
            || !same_scope(&grants.authority, &self.grants.authority)
        {
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
        let binding = request.binding();
        if binding.provider != self.binding.provider
            || !same_scope(&binding.authority, &self.binding.authority)
        {
            return Err(authority_changed());
        }
        Ok(())
    }
}

fn same_scope(current: &AuthorityBinding, captured: &AuthorityBinding) -> bool {
    // A reopened host issues a new live binding. New dispatch still requires
    // that exact live request/grant pair and runtime authorization.
    current.principal == captured.principal && current.scope == captured.scope
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

#[cfg(test)]
mod tests {
    use super::*;
    use agent_kit_core::{BindingId, GrantId, PrincipalId, ProviderId, ScopeId};

    #[test]
    fn a_retry_does_not_take_a_different_grant_under_the_same_scope() {
        let authority = AuthorityBinding {
            principal: PrincipalId::new("principal").unwrap(),
            binding: BindingId::new("live").unwrap(),
            scope: ScopeId::new("scope").unwrap(),
        };
        let mut grants = GrantSelection {
            authority: authority.clone(),
            grants: vec![GrantId::new("original").unwrap()],
        };
        let retry = AdmissionRetry {
            step: 1,
            not_before_ms: 0,
            binding: ProviderBinding {
                provider: ProviderId::new("fixture").unwrap(),
                authority,
            },
            grants: grants.clone(),
        };
        grants.authority.binding = BindingId::new("reopened").unwrap();
        assert_eq!(retry.delay(&grants).unwrap(), Duration::ZERO);
        grants.grants = vec![GrantId::new("different").unwrap()];
        assert_eq!(
            retry.delay(&grants).unwrap_err().code,
            "retry_authority_changed"
        );
    }
}
