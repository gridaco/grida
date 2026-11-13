//! GRIDA-SEC-004 — named child work has an explicit, bounded allowance.

use agent_kit_core::authority::AuthorityBinding;
use agent_kit_core::driver_state::{DriverStateChange, DriverStateSnapshot};
use agent_kit_core::{
    AttemptId, ChangeId, Envelope, Error, ErrorKind, Fingerprint, OperationId, PrincipalId, Result,
    SchemaId, ScopeId, SessionId, TurnId,
};
use serde::{Deserialize, Serialize};

const ALLOCATION_SCHEMA: &str = "grida.agent.subagent.allocation";
const SPONSORED_ALLOCATION_SCHEMA: &str = "grida.agent.subagent.sponsored-allocation";
const MAX_WORK_TURNS: u8 = 8;
const MAX_NAME_BYTES: usize = 128;
pub const MAX_ASSIGNMENT_BYTES: usize = 64 * 1024;
/// A new assignment can continue once after a dispatched generation is interrupted.
pub const INFERENCE_STEPS_PER_ASSIGNMENT: u32 = 2;
pub const INSTRUCTIONS: &str = "You are a subagent. Work on the current assignment using the retained context of this child conversation. Return your findings in text.";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Profile {
    parent: SessionId,
    name: String,
    work_turns: u8,
    principal: PrincipalId,
    scope: ScopeId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    sponsorship: Option<Sponsorship>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Sponsorship {
    pub parent_turn: TurnId,
    pub operation: OperationId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub admission: Option<Fingerprint>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attempt: Option<AttemptId>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PauseCause {
    Independent,
    Ancestor,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SponsoredPause {
    independent: bool,
    ancestor: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct NamedAllocation {
    reserved: u8,
    funded: Option<FundedTurn>,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct FundedTurn {
    turn: TurnId,
    pause: SponsoredPause,
}

impl SponsoredPause {
    pub fn effective(self) -> bool {
        self.independent || self.ancestor
    }

    pub fn held_by_ancestor(self) -> bool {
        self.ancestor
    }
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
            sponsorship: None,
        };
        profile.validate()?;
        Ok(profile)
    }

    pub fn sponsored(
        parent: SessionId,
        name: String,
        sponsorship: Sponsorship,
        authority: &AuthorityBinding,
    ) -> Result<Self> {
        let mut profile = Self::new(parent, name, 1, authority)?;
        profile.sponsorship = Some(sponsorship);
        Ok(profile)
    }

    pub fn validate(&self) -> Result<()> {
        if self.name.trim() != self.name
            || self.name.is_empty()
            || self.name.len() > MAX_NAME_BYTES
            || self.name.chars().any(char::is_control)
            || !(1..=MAX_WORK_TURNS).contains(&self.work_turns)
            || (self.sponsorship.is_some() && self.work_turns != 1)
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

    pub fn sponsorship(&self) -> Option<&Sponsorship> {
        self.sponsorship.as_ref()
    }

    pub fn require_assignment(&self, assignment: &Assignment, plan: bool) -> Result<()> {
        self.validate()?;
        if self.sponsorship.as_ref().map_or(plan, |sponsor| {
            sponsor.parent_turn != assignment.parent_turn || assignment.named_sponsorship.is_some()
        }) || assignment
            .named_sponsorship
            .as_ref()
            .is_some_and(|funding| {
                funding.sponsor.parent_turn != assignment.parent_turn
                    || funding.sponsor.admission.is_none()
                    || funding.sponsor.attempt.is_none()
            })
        {
            return Err(problem(ErrorKind::InvalidInput, "invalid_subagent_sponsor"));
        }
        Ok(())
    }

    pub fn require_authority(&self, current: &AuthorityBinding) -> Result<()> {
        if self.principal != current.principal || self.scope != current.scope {
            return Err(problem(ErrorKind::Conflict, "subagent_authority_changed"));
        }
        Ok(())
    }

    /// A manual child is identified by its creation request. Sponsored work
    /// uses the parent's single turn slot.
    pub fn identity(&self, request: &ChangeId) -> Result<SessionId> {
        if let Some(sponsor) = &self.sponsorship {
            return sponsored_identity(&self.parent, &sponsor.parent_turn);
        }
        let digest = Fingerprint::of(&("grida-subagent", &self.parent, request))?;
        SessionId::new(format!("subagent/{}", digest.to_hex()))
    }

    pub fn allocation(&self, state: &DriverStateSnapshot) -> Result<Allocation> {
        self.validate()?;
        if self.sponsorship.is_some() {
            let reserved = if state.is_initial() {
                0
            } else {
                self.sponsored_pause(state)?;
                1
            };
            return Ok(Allocation {
                work_turns: 1,
                reserved,
            });
        }
        Ok(Allocation {
            work_turns: self.work_turns,
            reserved: self.named_allocation(state)?.reserved,
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
        if self.sponsorship.is_some() {
            return sponsored_change(state, SponsoredPause::default());
        }
        if state.value().is_some_and(|value| value.version() == 2) {
            return named_change(
                state,
                NamedAllocation {
                    reserved: allocation.reserved + 1,
                    funded: None,
                },
            );
        }
        let next = serde_json::to_vec(&(allocation.reserved + 1))
            .map_err(|_| problem(ErrorKind::InvalidState, "invalid_subagent_allocation"))?;
        Ok(DriverStateChange {
            expected: state.revision(),
            value: Some(Envelope::new(SchemaId::new(ALLOCATION_SCHEMA)?, 1, next)?),
        })
    }

    pub fn reserve_named_funding(
        &self,
        state: &DriverStateSnapshot,
        turn: TurnId,
    ) -> Result<DriverStateChange> {
        let allocation = self.allocation(state)?;
        if self.sponsorship.is_some() || allocation.reserved >= allocation.work_turns {
            return Err(problem(
                ErrorKind::LimitExceeded,
                "subagent_allocation_exhausted",
            ));
        }
        named_change(
            state,
            NamedAllocation {
                reserved: allocation.reserved + 1,
                funded: Some(FundedTurn {
                    turn,
                    pause: SponsoredPause::default(),
                }),
            },
        )
    }

    pub fn funded_turn(&self, state: &DriverStateSnapshot, turn: &TurnId) -> Result<bool> {
        if self.sponsorship.is_some() {
            return Ok(true);
        }
        Ok(self
            .named_allocation(state)?
            .funded
            .is_some_and(|funding| &funding.turn == turn))
    }

    fn named_allocation(&self, state: &DriverStateSnapshot) -> Result<NamedAllocation> {
        let revision = state.revision().0;
        let allocation = match state.value() {
            None if state.is_initial() => NamedAllocation {
                reserved: 0,
                funded: None,
            },
            Some(value) if value.schema().as_str() == ALLOCATION_SCHEMA => match value.version() {
                1 => {
                    let reserved: u8 =
                        serde_json::from_slice(value.bytes()).map_err(|_| invalid_allocation())?;
                    if u64::from(reserved) != revision {
                        return Err(invalid_allocation());
                    }
                    NamedAllocation {
                        reserved,
                        funded: None,
                    }
                }
                2 => serde_json::from_slice(value.bytes()).map_err(|_| invalid_allocation())?,
                _ => return Err(invalid_allocation()),
            },
            _ => return Err(invalid_allocation()),
        };
        if allocation.reserved > self.work_turns
            || u64::from(allocation.reserved) > revision
            || (!state.is_initial() && allocation.reserved == 0)
        {
            return Err(invalid_allocation());
        }
        Ok(allocation)
    }

    pub fn sponsored_pause(&self, state: &DriverStateSnapshot) -> Result<SponsoredPause> {
        self.validate()?;
        if self.sponsorship.is_none() {
            return self
                .named_allocation(state)?
                .funded
                .map(|funding| funding.pause)
                .ok_or_else(invalid_sponsored_allocation);
        }
        let value = state
            .value()
            .filter(|value| {
                self.sponsorship.is_some()
                    && state.revision().0 > 0
                    && value.schema().as_str() == SPONSORED_ALLOCATION_SCHEMA
                    && value.version() == 1
            })
            .ok_or_else(invalid_sponsored_allocation)?;
        serde_json::from_slice(value.bytes()).map_err(|_| invalid_sponsored_allocation())
    }

    /// Retain one pause cause while preserving the other and the work allowance.
    /// The caller commits this change with the exact active-turn control.
    pub fn set_sponsored_pause(
        &self,
        state: &DriverStateSnapshot,
        cause: PauseCause,
        paused: bool,
    ) -> Result<(DriverStateChange, SponsoredPause)> {
        let mut next = self.sponsored_pause(state)?;
        match cause {
            PauseCause::Independent => next.independent = paused,
            PauseCause::Ancestor => next.ancestor = paused,
        }
        if self.sponsorship.is_none() {
            let mut allocation = self.named_allocation(state)?;
            allocation
                .funded
                .as_mut()
                .ok_or_else(invalid_sponsored_allocation)?
                .pause = next;
            return Ok((named_change(state, allocation)?, next));
        }
        Ok((sponsored_change(state, next)?, next))
    }
}

/// The parent turn owns one slot, independently of which tool call reserves it.
pub fn sponsored_identity(parent: &SessionId, turn: &TurnId) -> Result<SessionId> {
    let digest = Fingerprint::of(&("grida-sponsored-subagent", parent, turn))?;
    SessionId::new(format!("subagent/{}", digest.to_hex()))
}

fn sponsored_change(
    state: &DriverStateSnapshot,
    pause: SponsoredPause,
) -> Result<DriverStateChange> {
    let bytes = serde_json::to_vec(&pause).map_err(|_| invalid_sponsored_allocation())?;
    Ok(DriverStateChange {
        expected: state.revision(),
        value: Some(Envelope::new(
            SchemaId::new(SPONSORED_ALLOCATION_SCHEMA)?,
            1,
            bytes,
        )?),
    })
}

fn invalid_sponsored_allocation() -> Error {
    problem(
        ErrorKind::InvalidState,
        "invalid_sponsored_subagent_allocation",
    )
}

fn named_change(
    state: &DriverStateSnapshot,
    allocation: NamedAllocation,
) -> Result<DriverStateChange> {
    let bytes = serde_json::to_vec(&allocation).map_err(|_| invalid_allocation())?;
    Ok(DriverStateChange {
        expected: state.revision(),
        value: Some(Envelope::new(SchemaId::new(ALLOCATION_SCHEMA)?, 2, bytes)?),
    })
}

fn invalid_allocation() -> Error {
    problem(ErrorKind::InvalidState, "invalid_subagent_allocation")
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub named_sponsorship: Option<NamedSponsorship>,
}

impl Assignment {
    pub fn new(parent_turn: TurnId) -> Self {
        Self {
            parent_turn,
            named_sponsorship: None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NamedSponsorship {
    pub goal: crate::goals::Basis,
    pub sponsor: Sponsorship,
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
    fn one_sponsored_slot_per_parent_turn_preserves_exact_assignment_authority() {
        let parent = SessionId::new("parent").unwrap();
        let turn = TurnId::new("review").unwrap();
        let sponsor = |operation: &str| Sponsorship {
            parent_turn: turn.clone(),
            operation: OperationId::new(operation).unwrap(),
            admission: None,
            attempt: None,
        };
        let owner = authority("owner", "initial");
        let first =
            Profile::sponsored(parent.clone(), "Review".into(), sponsor("first"), &owner).unwrap();
        let repeated = Profile::sponsored(
            parent.clone(),
            "Alternate".into(),
            sponsor("different"),
            &owner,
        )
        .unwrap();
        assert_eq!(
            first.identity(&ChangeId::new("first").unwrap()).unwrap(),
            repeated
                .identity(&ChangeId::new("alternate").unwrap())
                .unwrap()
        );
        assert_ne!(first.sponsorship(), repeated.sponsorship());
        assert_ne!(
            sponsored_identity(&parent, &turn).unwrap(),
            sponsored_identity(&parent, &TurnId::new("other-turn").unwrap()).unwrap(),
        );
        let assignment = Assignment::new(turn);
        assert!(first.require_assignment(&assignment, true).is_ok());
        assert!(first.require_assignment(&assignment, false).is_ok());
        assert!(
            first
                .require_assignment(&Assignment::new(TurnId::new("other-turn").unwrap()), false)
                .is_err()
        );
        let manual = Profile::new(parent, "Manual review".into(), 1, &owner).unwrap();
        assert!(manual.require_assignment(&assignment, false).is_ok());
        assert!(manual.require_assignment(&assignment, true).is_err());
        assert!(
            first
                .require_authority(&authority("replacement", "new"))
                .is_err()
        );
        assert!(
            first
                .require_authority(&authority("owner", "renewed"))
                .is_ok()
        );
    }

    #[test]
    fn retained_pause_causes_do_not_refund_sponsored_work() {
        let profile = Profile::sponsored(
            SessionId::new("parent").unwrap(),
            "Review".into(),
            Sponsorship {
                parent_turn: TurnId::new("turn").unwrap(),
                operation: OperationId::new("operation").unwrap(),
                admission: None,
                attempt: None,
            },
            &authority("owner", "binding"),
        )
        .unwrap();
        let mut state = DriverStateSnapshot::default();
        assert_eq!(profile.allocation(&state).unwrap().reserved, 0);
        state.apply(profile.reserve(&state).unwrap()).unwrap();
        assert!(!profile.sponsored_pause(&state).unwrap().effective());
        for (cause, paused, effective) in [
            (PauseCause::Ancestor, true, true),
            (PauseCause::Independent, true, true),
            (PauseCause::Ancestor, false, true),
            (PauseCause::Independent, false, false),
        ] {
            let (change, next) = profile.set_sponsored_pause(&state, cause, paused).unwrap();
            assert_eq!(next.effective(), effective);
            state.apply(change).unwrap();
            state = serde_json::from_slice(&serde_json::to_vec(&state).unwrap()).unwrap();
            assert_eq!(
                profile.sponsored_pause(&state).unwrap().effective(),
                effective
            );
            assert_eq!(profile.allocation(&state).unwrap().reserved, 1);
            assert_eq!(
                profile.reserve(&state).unwrap_err().code,
                "subagent_allocation_exhausted"
            );
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
