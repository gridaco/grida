//! GRIDA-SEC-004 — one exact assignment in a reusable child owns the funded share.

use super::*;
use agent_kit_core::turn::TurnState;
use agent_kit_store_sqlite::InputObservation;
use grida_agent_master::goals::{Basis, Goal};

#[derive(Clone)]
pub(super) struct Target {
    pub(super) child: SessionId,
    pub(super) input: ChangeId,
    pub(super) turn: TurnId,
    pub(super) goal: Basis,
}

pub(super) struct AssignmentRecord {
    pub(super) view: SessionView,
    pub(super) profile: Profile,
    pub(super) accepted: InputObservation,
    pub(super) stored: StoredPrompt,
    pub(super) sponsor: Sponsorship,
}

impl Target {
    pub(super) fn from_state(state: &TurnState) -> Result<Option<Self>> {
        let Some(reservation) = Goal::reservation_for_turn(state)? else {
            return Ok(None);
        };
        let Some(child) = reservation.named_child else {
            return Ok(None);
        };
        let parent = state.binding();
        let digest = Fingerprint::of(&("goal-named-child", &parent.session, &parent.turn))?;
        let id =
            uuid::Uuid::from_bytes(digest.bytes()[..16].try_into().expect("fingerprint prefix"));
        Ok(Some(Self {
            child,
            input: ChangeId::new(format!("funded/{id}"))?,
            turn: TurnId::new(format!("funded/{id}"))?,
            goal: reservation.basis,
        }))
    }

    pub(super) async fn load(
        store: &SqliteStore,
        parent: &SessionId,
        turn: &TurnId,
    ) -> Result<Option<Self>> {
        match store
            .inspect_turn_with(parent.clone(), turn.clone(), Self::from_state)
            .await
        {
            Err(error) if error.code == "turn_missing" => Ok(None),
            result => result,
        }
    }

    pub(super) fn profile(&self, parent: &SessionId, view: &SessionView) -> Result<Profile> {
        session_configuration(view)?
            .subagent
            .filter(|profile| profile.parent() == parent && profile.sponsorship().is_none())
            .ok_or_else(related_changed)
    }

    pub(super) async fn read(
        &self,
        store: &SqliteStore,
        parent: &SessionId,
        parent_turn: &TurnId,
    ) -> Result<Option<AssignmentRecord>> {
        let (view, accepted) = match store
            .inspect_with_input(self.child.clone(), self.input.clone())
            .await
        {
            Ok(result) => result,
            Err(error) if error.code == "session_missing" => return Ok(None),
            Err(error) => return Err(error),
        };
        let profile = self.profile(parent, &view)?;
        let Some(accepted) = accepted else {
            return Ok(None);
        };
        if !accepted.turn.as_ref().is_some_and(|turn| {
            turn.binding.session == self.child && turn.binding.turn == self.turn
        }) {
            return Ok(None);
        }
        let stored: StoredPrompt = decode_input(&accepted.input.input)?;
        let assignment = stored.subagent.as_ref().ok_or_else(related_changed)?;
        profile.require_assignment(assignment, false)?;
        let sponsor = assignment
            .named_sponsorship
            .as_ref()
            .filter(|funding| funding.goal == self.goal && &assignment.parent_turn == parent_turn)
            .map(|funding| funding.sponsor.clone())
            .ok_or_else(related_changed)?;
        Ok(Some(AssignmentRecord {
            view,
            profile,
            accepted,
            stored,
            sponsor,
        }))
    }
}
