//! GRIDA-SEC-004 — named child work has an explicit, bounded allowance.

use agent_kit_core::authority::AuthorityBinding;
use agent_kit_core::driver_state::{DriverStateChange, DriverStateSnapshot};
use agent_kit_core::{
    ChangeId, Envelope, Error, ErrorKind, Fingerprint, PrincipalId, Result, SchemaId, ScopeId,
    SessionId, TurnId,
};
use serde::{Deserialize, Serialize};

const ALLOCATION_SCHEMA: &str = "grida.agent.subagent.allocation";
const MAX_WORK_TURNS: u8 = 8;
const MAX_NAME_BYTES: usize = 128;
pub const MAX_ASSIGNMENT_BYTES: usize = 64 * 1024;
pub const INFERENCE_STEPS_PER_ASSIGNMENT: u32 = 1;
pub const INSTRUCTIONS: &str = "You are a subagent. Work on the current assignment using the retained context of this child conversation. Return your findings in text.";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Profile {
    parent: SessionId,
    name: String,
    work_turns: u8,
    principal: PrincipalId,
    scope: ScopeId,
}

impl Profile {
    pub fn new(
        parent: SessionId,
        name: String,
        work_turns: u8,
        authority: &AuthorityBinding,
    ) -> Result<Self> {
        let profile = Self {
            parent,
            name: name.trim().to_owned(),
            work_turns,
            principal: authority.principal.clone(),
            scope: authority.scope.clone(),
        };
        profile.validate()?;
        Ok(profile)
    }

    pub fn validate(&self) -> Result<()> {
        if self.name.trim() != self.name
            || self.name.is_empty()
            || self.name.len() > MAX_NAME_BYTES
            || self.name.chars().any(char::is_control)
            || !(1..=MAX_WORK_TURNS).contains(&self.work_turns)
        {
            return Err(problem(ErrorKind::InvalidInput, "invalid_subagent_profile"));
        }
        Ok(())
    }

    pub fn parent(&self) -> &SessionId {
        &self.parent
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn require_authority(&self, current: &AuthorityBinding) -> Result<()> {
        if self.principal != current.principal || self.scope != current.scope {
            return Err(problem(ErrorKind::Conflict, "subagent_authority_changed"));
        }
        Ok(())
    }

    /// The creation request determines identity. Changing its profile still
    /// conflicts with the originally recorded creation.
    pub fn identity(&self, request: &ChangeId) -> Result<SessionId> {
        let digest = Fingerprint::of(&("grida-subagent", &self.parent, request))?;
        SessionId::new(format!("subagent/{}", crate::hex(digest)))
    }

    pub fn allocation(&self, state: &DriverStateSnapshot) -> Result<Allocation> {
        self.validate()?;
        let invalid = || problem(ErrorKind::InvalidState, "invalid_subagent_allocation");
        let reserved = match state.value() {
            None if state.is_initial() => 0,
            Some(value) if value.schema().as_str() == ALLOCATION_SCHEMA && value.version() == 1 => {
                serde_json::from_slice::<u8>(value.bytes()).map_err(|_| invalid())?
            }
            _ => return Err(invalid()),
        };
        if reserved > self.work_turns || u64::from(reserved) != state.revision().0 {
            return Err(invalid());
        }
        Ok(Allocation {
            work_turns: self.work_turns,
            reserved,
        })
    }

    /// Reserve one unit with the ordinary claim. This allowance has no refund
    /// path, so interrupted or unverified work cannot create fresh capacity.
    pub fn reserve(&self, state: &DriverStateSnapshot) -> Result<DriverStateChange> {
        let allocation = self.allocation(state)?;
        if allocation.reserved >= allocation.work_turns {
            return Err(problem(
                ErrorKind::LimitExceeded,
                "subagent_allocation_exhausted",
            ));
        }
        let next = serde_json::to_vec(&(allocation.reserved + 1))
            .map_err(|_| problem(ErrorKind::InvalidState, "invalid_subagent_allocation"))?;
        Ok(DriverStateChange {
            expected: state.revision(),
            value: Some(Envelope::new(SchemaId::new(ALLOCATION_SCHEMA)?, 1, next)?),
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Allocation {
    pub work_turns: u8,
    pub reserved: u8,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Assignment {
    pub parent_turn: TurnId,
}

pub fn validate_assignment(instructions: &str) -> Result<()> {
    if instructions.trim().is_empty() || instructions.len() > MAX_ASSIGNMENT_BYTES {
        return Err(problem(
            ErrorKind::InvalidInput,
            "invalid_subagent_assignment",
        ));
    }
    Ok(())
}

fn problem(kind: ErrorKind, code: &'static str) -> Error {
    Error::new(kind, code)
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_kit_core::BindingId;

    fn authority(principal: &str, binding: &str) -> AuthorityBinding {
        AuthorityBinding {
            principal: PrincipalId::new(principal).unwrap(),
            binding: BindingId::new(binding).unwrap(),
            scope: ScopeId::new("provider").unwrap(),
        }
    }

    #[test]
    fn identity_is_scoped_to_parent_and_creation_request() {
        let request = ChangeId::new("create-researcher").unwrap();
        let parent = SessionId::new("parent").unwrap();
        let original = Profile::new(
            parent.clone(),
            "Researcher".into(),
            2,
            &authority("owner", "live"),
        )
        .unwrap();
        let changed =
            Profile::new(parent, "Reviewer".into(), 3, &authority("owner", "live")).unwrap();
        let other = Profile::new(
            SessionId::new("other").unwrap(),
            "Researcher".into(),
            2,
            &authority("owner", "live"),
        )
        .unwrap();
        assert_eq!(
            original.identity(&request).unwrap(),
            changed.identity(&request).unwrap()
        );
        assert_ne!(
            original.identity(&request).unwrap(),
            other.identity(&request).unwrap()
        );
    }

    #[test]
    fn renewed_dispatch_binding_cannot_change_the_child_principal() {
        let profile = Profile::new(
            SessionId::new("parent").unwrap(),
            "Researcher".into(),
            2,
            &authority("owner", "first"),
        )
        .unwrap();
        assert!(
            profile
                .require_authority(&authority("owner", "renewed"))
                .is_ok()
        );
        assert_eq!(
            profile
                .require_authority(&authority("replacement", "renewed"))
                .unwrap_err()
                .code,
            "subagent_authority_changed"
        );
    }

    #[test]
    fn allocation_is_bounded_and_counts_each_claim_once() {
        let profile = Profile::new(
            SessionId::new("parent").unwrap(),
            "Researcher".into(),
            2,
            &authority("owner", "live"),
        )
        .unwrap();
        let mut state = DriverStateSnapshot::default();
        let first = profile.reserve(&state).unwrap();
        state.apply(first.clone()).unwrap();
        assert_eq!(
            state.apply(first).unwrap_err().code,
            "driver_state_revision_changed"
        );
        let second = profile.reserve(&state).unwrap();
        state.apply(second).unwrap();
        assert_eq!(profile.allocation(&state).unwrap().reserved, 2);
        assert_eq!(
            profile.reserve(&state).unwrap_err().code,
            "subagent_allocation_exhausted"
        );
    }
}
