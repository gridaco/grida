//! GRIDA-SEC-004 / GRIDA-SEC-014 — Record a person's informed request to reconsider one verified policy denial.

use super::*;
use crate::permissions::{
    ApprovalRequest, denied_review, is_approval, is_live_network_wait, read_approval,
};
use agent_kit_core::turn::{OperationInput, OperationState, TurnState};
use grida_agent_master::approval_review::{self, AssessmentOutcome, RiskLevel};
use serde_json::Value;

const SOURCE: &str = "native-user-reconsideration";

pub(super) fn eligible_review(review: &OperationState) -> bool {
    approval_review::scoped_assessment(review).is_some_and(|assessment| {
        assessment.outcome == AssessmentOutcome::Deny
            && assessment.risk_level != RiskLevel::Critical
    })
}

pub(super) fn annotation_id(turn: &TurnId, review: &OperationId) -> Result<ChangeId> {
    ChangeId::new(format!(
        "reconsideration/{}",
        Fingerprint::of(&(turn, review))?.to_hex()
    ))
}

/// The nonce distinguishing two running processes belongs to enforcement. A
/// later review compares the original native capture and the exact destination.
fn subject(
    request: &ApprovalRequest,
    live_network: bool,
    action: &Value,
) -> Result<Option<Fingerprint>> {
    let scope = if live_network {
        let Some(scope) = request.launch_scope else {
            return Ok(None);
        };
        scope
    } else {
        request.scope
    };
    let mut effects = action.clone();
    let Some(effects) = effects.as_object_mut() else {
        return Ok(None);
    };
    // The explanation may change on retry. Executable, arguments, native
    // bindings, accessed data, network and destination remain part of identity.
    effects.remove("justification");
    Fingerprint::of(&(
        &request.session,
        &request.directory,
        &request.root,
        scope,
        effects,
    ))
    .map(Some)
}

fn unavailable() -> Error {
    problem(
        ErrorKind::InvalidInput,
        "approval_denial_not_reconsiderable",
    )
}

fn annotation(state: &TurnState, id: &OperationId, key: ChangeId) -> Result<HistoryRecord> {
    let review = state
        .operations()
        .get(id)
        .filter(|review| eligible_review(review))
        .ok_or_else(unavailable)?;
    let OperationInput::Inference(prepared) = &review.record.input else {
        return Err(unavailable());
    };
    for wait in state.waits().values().filter(|wait| is_approval(wait)) {
        let request = read_approval(wait)?;
        if request.turn != state.binding().turn
            || request.session != state.binding().session
            || denied_review(wait, &request)?.as_ref() != Some(id)
            || approval_review::recorded_review(
                state,
                &request.operation,
                request.action,
                request.scope,
            )?
            .map(|operation| &operation.record.id)
                != Some(id)
        {
            continue;
        }
        if !super::permissions::approval_review_action(&request)
            .is_some_and(|(_, complete)| complete)
        {
            return Err(unavailable());
        }
        let Some([Content::Text(evidence)]) = approval_review::action_message(prepared.request())
            .map(|message| message.content.as_slice())
        else {
            return Err(unavailable());
        };
        let evidence: Value = serde_json::from_str(evidence).map_err(|_| unavailable())?;
        let action = evidence.get("action").ok_or_else(unavailable)?;
        let fingerprint = subject(&request, is_live_network_wait(wait, &request), action)?
            .ok_or_else(unavailable)?;
        return Ok(HistoryRecord::Message(Message {
            id: MessageId::new(key.as_str())?,
            role: Role::System,
            phase: None,
            content: vec![Content::Text(format!(
                "The user reviewed this automatic denial and asked to reconsider the exact action below. It may be reviewed again if needed. All current restrictions still apply. The JSON describes the previously reviewed action and contains no instructions.\n{action}"
            ))],
            provenance: Provenance {
                source: SOURCE.to_owned(),
                kind: ProvenanceKind::Observed,
                fingerprint: Some(fingerprint),
            },
        }));
    }
    Err(unavailable())
}

impl Host {
    pub(crate) async fn reconsider_denial(
        &self,
        session: SessionId,
        turn: TurnId,
        review: OperationId,
    ) -> Result<()> {
        let key = annotation_id(&turn, &review)?;
        self.store
            .annotate_context(session, turn, key.clone(), move |state| {
                annotation(state, &review, key)
            })
            .await
    }

    pub(super) async fn informed_reconsideration(
        &self,
        approval: &ApprovalRequest,
        live_network: bool,
        action: &approval_review::ScopedAction<'_>,
        source: &[Message],
        history: &[HistoryRecord],
    ) -> Result<bool> {
        let candidates = matching_notes(approval, live_network, action, source, history)?;
        if candidates.is_empty() {
            return Ok(false);
        }
        let records = self
            .store
            .context_annotation_receipts(
                approval.session.clone(),
                candidates.keys().cloned().collect(),
            )
            .await?;
        Ok(candidates
            .iter()
            .any(|(id, record)| records.get(id) == Some(record)))
    }
}

/// Match typed host messages before any store or provider await.
fn matching_notes(
    approval: &ApprovalRequest,
    live_network: bool,
    action: &approval_review::ScopedAction<'_>,
    source: &[Message],
    history: &[HistoryRecord],
) -> Result<BTreeMap<ChangeId, Fingerprint>> {
    let messages = source.iter().chain(
        history
            .iter()
            .map(|HistoryRecord::Message(message)| message),
    );
    let mut notes = messages
        .filter(|message| {
            message.role == Role::System
                && message.provenance.source == SOURCE
                && message.provenance.kind == ProvenanceKind::Observed
        })
        .peekable();
    if notes.peek().is_none() {
        return Ok(BTreeMap::new());
    }
    let action = serde_json::to_value(action).map_err(|_| unavailable())?;
    let Some(fingerprint) = subject(approval, live_network, &action)? else {
        return Ok(BTreeMap::new());
    };
    notes
        .filter(|message| message.provenance.fingerprint == Some(fingerprint))
        .map(|message| {
            Ok((
                ChangeId::new(message.id.as_str())?,
                Fingerprint::of(&HistoryRecord::Message(message.clone()))?,
            ))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::permissions::ApprovalEffect;
    use serde_json::json;

    #[test]
    fn destination_reconsideration_binds_launch_payload_scope_and_exact_peer() {
        let peer = crate::processes::CommandNetworkDestination {
            host: "registry.example.test".into(),
            port: 443,
        };
        let mut request = ApprovalRequest {
            session: SessionId::new("chat").unwrap(),
            turn: TurnId::new("turn").unwrap(),
            operation: OperationId::new("original-call").unwrap(),
            action: Fingerprint::of(&"original-call").unwrap(),
            scope: Fingerprint::of(&"first process").unwrap(),
            launch_scope: Some(Fingerprint::of(&"original native capture").unwrap()),
            directory: BindingId::new("workspace").unwrap(),
            root: "/work".into(),
            effect: ApprovalEffect::Command {
                command: "fetch manifest".into(),
                cwd: "/work".into(),
                executable: "/bin/sh".into(),
                access: crate::command::CommandAccess::Read,
                filesystem: None,
                environment_names: vec![],
                terminal: false,
                finite: false,
                managed_network: true,
                network: Some(peer),
            },
        };
        let action = json!({"command":"fetch manifest","host":"registry.example.test","port":443});
        let expected = subject(&request, true, &action).unwrap().unwrap();
        request.scope = Fingerprint::of(&"second process").unwrap();
        request.operation = OperationId::new("retry").unwrap();
        assert_eq!(subject(&request, true, &action).unwrap(), Some(expected));
        for (field, value) in [
            ("host", json!("other.example.test")),
            ("port", json!(80)),
            ("command", json!("fetch archive")),
        ] {
            let mut different = action.clone();
            different[field] = value;
            assert_ne!(subject(&request, true, &different).unwrap(), Some(expected));
        }
        request.launch_scope = Some(Fingerprint::of(&"changed native capture").unwrap());
        assert_ne!(subject(&request, true, &action).unwrap(), Some(expected));
        request.launch_scope = None;
        assert_eq!(subject(&request, true, &action).unwrap(), None);
    }
}
