use agent_kit_core::{ChangeId, Envelope, ErrorKind, OperationId, SchemaId, ToolCallId, TurnId};
use grida_agent_master::goals::{
    Allowance, Blocker, CompletionReview, CriterionEvidence, Goal, Objective, Report, Status,
    Usage, WorkOutcome,
};
use std::collections::BTreeSet;
use std::num::NonZeroU32;

fn limit(value: u32) -> NonZeroU32 {
    NonZeroU32::new(value).unwrap()
}

fn goal(turns: u32, steps: u32) -> Goal {
    Goal::start(
        ChangeId::new("goal-start").unwrap(),
        Objective {
            description: "Prepare the project for handoff".into(),
            criteria: vec!["The renderer tests pass".into(), "The export opens".into()],
        },
        Allowance {
            work_turns: limit(turns),
            inference_steps: limit(steps),
        },
    )
    .unwrap()
}

fn turn(name: &str) -> TurnId {
    TurnId::new(name).unwrap()
}

fn verified_checks() -> BTreeSet<CriterionEvidence> {
    [
        CriterionEvidence {
            criterion: 1,
            call: ToolCallId::new("test-result").unwrap(),
        },
        CriterionEvidence {
            criterion: 2,
            call: ToolCallId::new("opened-export").unwrap(),
        },
    ]
    .into_iter()
    .collect()
}

fn completion(checks: &BTreeSet<CriterionEvidence>) -> Report {
    Report::Completion {
        summary: "Handoff is ready".into(),
        evidence: checks.iter().cloned().collect(),
    }
}

#[test]
fn user_review_is_bound_to_the_work_basis_and_survives_the_final_allowance() {
    let original = goal(1, 2);
    let mut goal = Goal::start_with_review(
        original.basis().goal.clone(),
        original.objective().clone(),
        original.allowance(),
        true,
    )
    .unwrap();
    let basis = goal.basis().clone();
    let work = turn("reviewable-work");
    let request = ChangeId::new("user-confirmed").unwrap();
    goal.reserve(&basis, work.clone(), limit(2)).unwrap();
    goal.account(&work, WorkOutcome::Uncertain { observed_steps: 1 })
        .unwrap();
    assert_eq!(goal.status(), Status::Blocked(Blocker::UncertainWork));
    assert!(
        goal.confirm_completion(&basis, &work, request.clone())
            .is_err()
    );
    goal.account(
        &work,
        WorkOutcome::Settled {
            inference_steps: 2,
            report: Some(Report::ReadyForReview {
                summary: "Open the exported file".into(),
            }),
            verified_evidence: &BTreeSet::new(),
        },
    )
    .unwrap();
    assert_eq!(
        goal.status(),
        Status::Blocked(Blocker::UnverifiedCompletion)
    );
    assert_eq!(goal.remaining(), Usage::default());
    assert!(goal.continuation().is_none());
    let mut goal = Goal::decode(&goal.encode().unwrap()).unwrap();
    assert_eq!(
        goal.resume_idle(&basis).unwrap_err().code,
        "goal_allowance_exhausted"
    );
    assert!(
        goal.confirm_completion(&basis, &turn("different-work"), request.clone())
            .is_err()
    );
    let spent = goal.spent();
    goal.confirm_completion(&basis, &work, request.clone())
        .unwrap();
    assert_eq!(goal.status(), Status::Complete);
    assert_eq!(goal.spent(), spent);
    let reopened = Goal::decode(&goal.encode().unwrap()).unwrap();
    assert!(matches!(
        reopened.completion_review(),
        Some(CompletionReview::Confirmed { candidate, request: recorded })
            if candidate.basis == basis && candidate.turn == work && recorded == &request
    ));
}

#[test]
fn changing_objective_or_resuming_goal_work_retires_the_old_review() {
    let original = goal(3, 6);
    let mut goal = Goal::start_with_review(
        original.basis().goal.clone(),
        original.objective().clone(),
        original.allowance(),
        true,
    )
    .unwrap();
    let basis = goal.basis().clone();
    let work = turn("old-goal-work");
    goal.reserve(&basis, work.clone(), limit(2)).unwrap();
    goal.account(
        &work,
        WorkOutcome::Settled {
            inference_steps: 2,
            report: Some(Report::ReadyForReview {
                summary: "Review the export".into(),
            }),
            verified_evidence: &BTreeSet::new(),
        },
    )
    .unwrap();
    let mut revised = goal.clone();
    let mut objective = revised.objective().clone();
    objective.criteria = vec!["The new export has both pages".into()];
    revised.revise(&basis, objective).unwrap();
    assert!(revised.completion_review().is_none());
    assert!(
        revised
            .confirm_completion(&basis, &work, ChangeId::new("stale-confirmation").unwrap())
            .is_err()
    );
    let mut cleared = goal.clone();
    cleared.clear(&basis).unwrap();
    assert!(cleared.completion_review().is_none());
    goal.resume_idle(&basis).unwrap();
    goal.reserve(&goal.basis().clone(), turn("new-goal-work"), limit(2))
        .unwrap();
    assert!(goal.completion_review().is_none());
    assert_eq!(
        goal.spent(),
        Usage {
            work_turns: 1,
            inference_steps: 2
        }
    );
}

#[test]
fn cumulative_allowance_cannot_be_replenished_by_a_new_turn_or_reload() {
    let mut goal = goal(2, 5);
    let basis = goal.basis().clone();
    let first = turn("first-work");
    goal.reserve(&basis, first.clone(), limit(4)).unwrap();
    let mut goal = Goal::decode(&goal.encode().unwrap()).unwrap();
    assert_eq!(
        goal.remaining(),
        Usage {
            work_turns: 1,
            inference_steps: 1
        }
    );
    assert_eq!(
        goal.reserve(&basis, turn("duplicate-work"), limit(1))
            .unwrap_err()
            .code,
        "goal_work_reserved"
    );
    goal.account(
        &first,
        WorkOutcome::Settled {
            inference_steps: 3,
            report: Some(Report::Progress {
                summary: "Tests pass".into(),
            }),
            verified_evidence: &BTreeSet::new(),
        },
    )
    .unwrap();
    assert_eq!(
        goal.spent(),
        Usage {
            work_turns: 1,
            inference_steps: 3
        }
    );
    let next = turn("next-work");
    assert_eq!(
        goal.reserve(&basis, next.clone(), limit(4))
            .unwrap()
            .inference_steps,
        limit(2)
    );
    goal.account(
        &next,
        WorkOutcome::Settled {
            inference_steps: 1,
            report: Some(Report::Progress {
                summary: "Export opened".into(),
            }),
            verified_evidence: &BTreeSet::new(),
        },
    )
    .unwrap();
    assert_eq!(goal.status(), Status::Exhausted);
    assert_eq!(goal.progress(), Some("Export opened"));
    assert_eq!(
        goal.account(&next, WorkOutcome::NotDispatched)
            .unwrap_err()
            .kind,
        ErrorKind::Conflict
    );
    assert_eq!(
        goal.spent(),
        Usage {
            work_turns: 2,
            inference_steps: 4
        }
    );
}

#[test]
fn completion_requires_a_verified_link_for_every_criterion() {
    let checks = verified_checks();
    let wrong_mapping = checks
        .iter()
        .cloned()
        .map(|mut check| {
            check.criterion = 3 - check.criterion;
            check
        })
        .collect();
    for (verified, expected) in [
        (
            BTreeSet::new(),
            Status::Blocked(Blocker::UnverifiedCompletion),
        ),
        (
            wrong_mapping,
            Status::Blocked(Blocker::UnverifiedCompletion),
        ),
        (checks.clone(), Status::Complete),
    ] {
        let mut goal = goal(2, 4);
        let work = turn("verification-turn");
        goal.reserve(&goal.basis().clone(), work.clone(), limit(2))
            .unwrap();
        goal.account(
            &work,
            WorkOutcome::Settled {
                inference_steps: 1,
                report: Some(completion(&checks)),
                verified_evidence: &verified,
            },
        )
        .unwrap();
        assert_eq!(goal.status(), expected);
        assert_eq!(Goal::decode(&goal.encode().unwrap()).unwrap(), goal);
    }
}

#[test]
fn revising_an_objective_invalidates_old_work_without_refunding_it() {
    let mut goal = goal(3, 6);
    let original = goal.basis().clone();
    let work = turn("work-before-revision");
    goal.reserve(&original, work.clone(), limit(3)).unwrap();
    goal.revise(
        &original,
        Objective {
            description: "Only verify the export".into(),
            criteria: vec!["The export opens".into()],
        },
    )
    .unwrap();
    assert_eq!(
        goal.reserve(&original, turn("stale-continuation"), limit(1))
            .unwrap_err()
            .code,
        "goal_revision_changed"
    );
    let checks = verified_checks();
    goal.account(
        &work,
        WorkOutcome::Settled {
            inference_steps: 2,
            report: Some(completion(&checks)),
            verified_evidence: &checks,
        },
    )
    .unwrap();
    assert_eq!(goal.status(), Status::Active);
    assert_eq!(goal.progress(), None);
    assert_eq!(
        goal.spent(),
        Usage {
            work_turns: 1,
            inference_steps: 2
        }
    );
}

#[test]
fn pause_resume_and_clear_never_revalidate_an_old_completion_report() {
    for clear in [false, true] {
        let mut goal = goal(3, 6);
        let basis = goal.basis().clone();
        let work = turn("paused-work");
        goal.reserve(&basis, work.clone(), limit(2)).unwrap();
        goal.set_paused(&basis, true).unwrap();
        let mut goal = Goal::decode(&goal.encode().unwrap()).unwrap();
        assert!(goal.paused());
        assert_eq!(
            goal.reserve(&goal.basis().clone(), turn("paused-continuation"), limit(1))
                .unwrap_err()
                .code,
            "goal_not_active"
        );
        if clear {
            goal.clear(&goal.basis().clone()).unwrap();
        } else {
            goal.set_paused(&goal.basis().clone(), false).unwrap();
        }
        let checks = verified_checks();
        goal.account(
            &work,
            WorkOutcome::Settled {
                inference_steps: 1,
                report: Some(completion(&checks)),
                verified_evidence: &checks,
            },
        )
        .unwrap();
        assert_eq!(
            goal.status(),
            if clear {
                Status::Cleared
            } else {
                Status::Active
            }
        );
        assert_eq!(goal.progress(), None);
        assert_eq!(
            goal.spent(),
            Usage {
                work_turns: 1,
                inference_steps: 1
            }
        );
    }
}

#[test]
fn uncertain_work_preserves_the_reserved_ceiling_until_reconciliation() {
    let mut goal = goal(3, 8);
    let basis = goal.basis().clone();
    let work = turn("uncertain-work");
    goal.reserve(&basis, work.clone(), limit(6)).unwrap();
    goal.account(&work, WorkOutcome::Uncertain { observed_steps: 2 })
        .unwrap();
    let mut goal = Goal::decode(&goal.encode().unwrap()).unwrap();
    assert_eq!(goal.status(), Status::Blocked(Blocker::UncertainWork));
    assert_eq!(
        goal.remaining(),
        Usage {
            work_turns: 2,
            inference_steps: 2
        }
    );
    assert_eq!(goal.reservation().unwrap().uncertain_steps, Some(2));
    assert_eq!(
        goal.account(&work, WorkOutcome::NotDispatched)
            .unwrap_err()
            .code,
        "goal_step_account_mismatch"
    );
    assert_eq!(
        goal.account(&work, WorkOutcome::Uncertain { observed_steps: 7 })
            .unwrap_err()
            .code,
        "goal_step_account_mismatch"
    );
    goal.account(
        &work,
        WorkOutcome::Settled {
            inference_steps: 4,
            report: Some(Report::Progress {
                summary: "Recovered the verified result".into(),
            }),
            verified_evidence: &BTreeSet::new(),
        },
    )
    .unwrap();
    assert_eq!(goal.status(), Status::Active);
    assert_eq!(
        goal.spent(),
        Usage {
            work_turns: 1,
            inference_steps: 4
        }
    );
    assert!(goal.reservation().is_none());
}

#[test]
fn no_progress_blocks_automatic_continuation_without_releasing_confirmed_usage() {
    let mut goal = goal(4, 10);
    let basis = goal.basis().clone();
    for (id, summary) in [
        ("first", "Prepared the export"),
        ("second", " Prepared the export "),
    ] {
        let work = turn(id);
        goal.reserve(&basis, work.clone(), limit(2)).unwrap();
        goal.account(
            &work,
            WorkOutcome::Settled {
                inference_steps: 1,
                report: Some(Report::Progress {
                    summary: summary.into(),
                }),
                verified_evidence: &BTreeSet::new(),
            },
        )
        .unwrap();
    }
    assert_eq!(goal.status(), Status::Blocked(Blocker::NoProgress));
    goal.set_paused(&basis, true).unwrap();
    goal.set_paused(&goal.basis().clone(), false).unwrap();
    assert_eq!(goal.status(), Status::Blocked(Blocker::NoProgress));
    assert_eq!(
        goal.spent(),
        Usage {
            work_turns: 2,
            inference_steps: 2
        }
    );
}

#[test]
fn corrupt_or_future_state_cannot_reauthorize_a_goal() {
    let mut goal = goal(1, 4);
    let basis = goal.basis().clone();
    goal.reserve(&basis, turn("retained-work"), limit(3))
        .unwrap();
    let original = goal.encode().unwrap();
    let mut value: serde_json::Value = serde_json::from_slice(original.bytes()).unwrap();
    value["spent"]["inference_steps"] = 3.into();
    let invalid = Envelope::new(
        SchemaId::new("grida.agent.goal").unwrap(),
        1,
        serde_json::to_vec(&value).unwrap(),
    )
    .unwrap();
    assert_eq!(
        Goal::decode(&invalid).unwrap_err().kind,
        ErrorKind::InvalidState
    );
    let future = Envelope::new(
        SchemaId::new("grida.agent.goal").unwrap(),
        2,
        original.bytes().to_vec(),
    )
    .unwrap();
    assert_eq!(
        Goal::decode(&future).unwrap_err().kind,
        ErrorKind::Unsupported
    );
}

#[tokio::test]
async fn goal_tools_are_scoped_and_a_report_only_records_a_proposal() {
    use agent_kit_core::authority::{AuthorityBinding, GrantSelection};
    use agent_kit_core::messages::{OutcomeStatus, ToolArguments};
    use agent_kit_core::tools::{Inventory, InvocationContext};
    use agent_kit_core::turn::{
        AttemptRecord, OperationInput, OperationOutcome, OperationRecord, OperationState,
    };
    use agent_kit_core::{AttemptId, BindingId, CancellationToken, PrincipalId, ScopeId};
    use grida_agent_master::goals::tools;
    use serde_json::json;

    let mut goal = goal(3, 8);
    let basis = goal.basis().clone();
    let work = turn("reserved-work");
    assert!(tools::for_work(&goal, &work).is_err());
    goal.reserve(&basis, work.clone(), limit(3)).unwrap();
    assert!(tools::for_work(&goal, &turn("unrelated")).is_err());

    let mut inventory = Inventory::new();
    let [inspect, report] = tools::for_work(&goal, &work).unwrap();
    let inspect_id = inspect.definition().id.clone();
    let report_id = report.definition().id.clone();
    inventory.insert(inspect).unwrap();
    inventory.insert(report).unwrap();
    let snapshot = inventory
        .snapshot(&[inspect_id.clone(), report_id.clone()])
        .unwrap();

    let context = |id, max_output_bytes| InvocationContext {
        attempt: AttemptId::new(id).unwrap(),
        cancellation: CancellationToken::new(),
        deadline: None,
        max_output_bytes,
    };
    let read = snapshot
        .prepare(
            OperationId::new("inspect").unwrap(),
            &inspect_id,
            ToolArguments::Json(json!({})),
        )
        .unwrap();
    let inspected = read.invoke(context("read-attempt", 64 * 1024)).await;
    assert_eq!(inspected.status, OutcomeStatus::Succeeded);
    let observed = inspected.structured.unwrap();
    assert_eq!(
        observed["objective"]["description"],
        goal.objective().description
    );
    assert_eq!(observed["remaining"]["inference_steps"], 5);
    assert!(inspected.receipt.is_none());

    let claim = completion(&verified_checks());
    let operation = OperationId::new("propose").unwrap();
    let proposal = snapshot
        .prepare(
            operation.clone(),
            &report_id,
            ToolArguments::Json(json!({"report": claim})),
        )
        .unwrap();
    let invocation = proposal.invocation().clone();
    let tool_context = context("report-attempt", 1);
    let attempt = tool_context.attempt.clone();
    let result = proposal.invoke(tool_context).await;
    assert_eq!(result.status, OutcomeStatus::Succeeded);
    assert!(result.truncated);
    assert_eq!(goal.status(), Status::Active);
    assert!(goal.progress().is_none());
    let recorded = OperationState {
        record: OperationRecord {
            id: operation,
            input: OperationInput::Tool(invocation),
            grants: GrantSelection {
                authority: AuthorityBinding {
                    principal: PrincipalId::new("test-host").unwrap(),
                    binding: BindingId::new("test-binding").unwrap(),
                    scope: ScopeId::new("test-scope").unwrap(),
                },
                grants: vec![],
            },
            origin: None,
            source_call: None,
        },
        attempts: vec![AttemptRecord {
            id: attempt,
            outcome: Some(OperationOutcome::Tool(result)),
            prior_outcomes: vec![],
        }],
        rejection: None,
    };
    assert_eq!(
        tools::read_report(&recorded, &work, &basis).unwrap(),
        Some(claim)
    );
    assert_eq!(
        tools::read_report(&recorded, &turn("different-work"), &basis).unwrap(),
        None
    );
    goal.set_paused(&basis, true).unwrap();
    assert_eq!(
        tools::read_report(&recorded, &work, goal.basis()).unwrap(),
        None
    );
    assert!(tools::for_work(&goal, &work).is_err());
}

#[test]
fn goal_report_refuses_objective_mutation_and_incomplete_criteria() {
    use agent_kit_core::messages::ToolArguments;
    use grida_agent_master::goals::tools;
    use serde_json::json;

    let mut goal = goal(2, 4);
    let work = turn("reserved");
    goal.reserve(&goal.basis().clone(), work.clone(), limit(2))
        .unwrap();
    let [_, report] = tools::for_work(&goal, &work).unwrap();
    let unauthorized = ToolArguments::Json(json!({
        "report":{"kind":"progress","summary":"Checked the output"},
        "allowance":{"work_turns":100}
    }));
    assert_eq!(
        report.validate(&unauthorized).unwrap_err().code,
        "goal_tool_arguments_invalid"
    );
    let incomplete = ToolArguments::Json(json!({
        "report":{"kind":"completion","summary":"Done","evidence":[
            {"criterion":1,"call":"only-one-check"}
        ]}
    }));
    assert_eq!(
        report.validate(&incomplete).unwrap_err().code,
        "goal_report_criteria_incomplete"
    );
}

#[test]
fn explicitly_resuming_the_same_objective_keeps_the_existing_allocation() {
    let mut goal = goal(3, 6);
    let work = turn("paused");
    let original = goal.basis().clone();
    goal.reserve(&original, work.clone(), limit(3)).unwrap();
    goal.set_paused(&original, true).unwrap();
    let paused = goal.basis().clone();
    let before = goal.remaining();
    let mut goal = Goal::decode(&goal.encode().unwrap()).unwrap();
    goal.resume_reserved(&paused, &work).unwrap();
    assert!(!goal.paused());
    assert_eq!(goal.reservation().unwrap().basis, *goal.basis());
    assert_ne!(goal.reservation().unwrap().basis, original);
    assert_eq!(goal.remaining(), before);
    assert!(grida_agent_master::goals::tools::for_work(&goal, &work).is_ok());

    goal.set_paused(&goal.basis().clone(), true).unwrap();
    goal.revise(
        &goal.basis().clone(),
        Objective {
            description: "Different work".into(),
            criteria: vec!["A different check passes".into()],
        },
    )
    .unwrap();
    assert_eq!(
        goal.resume_reserved(&goal.basis().clone(), &work)
            .unwrap_err()
            .code,
        "goal_reserved_resume_mismatch"
    );
    assert!(goal.paused());
    assert_eq!(goal.remaining(), before);
}

#[test]
fn continuation_identity_is_stable_across_reload_and_stale_after_goal_controls() {
    let mut goal = goal(4, 9);
    let first = turn("first");
    let basis = goal.basis().clone();
    assert!(goal.continuation().is_none());
    goal.reserve(&basis, first.clone(), limit(3)).unwrap();
    assert!(goal.continuation().is_none());
    goal.account(
        &first,
        WorkOutcome::Settled {
            inference_steps: 2,
            report: Some(Report::Progress {
                summary: "Prepared the first export".into(),
            }),
            verified_evidence: &BTreeSet::new(),
        },
    )
    .unwrap();
    let ticket = goal.continuation().unwrap();
    let session = agent_kit_core::SessionId::new("conversation").unwrap();
    let input = ticket.input_id(&session).unwrap();
    assert_eq!(ticket.after, first);
    assert_eq!(
        Goal::decode(&goal.encode().unwrap())
            .unwrap()
            .continuation()
            .unwrap()
            .input_id(&session)
            .unwrap(),
        input
    );
    goal.set_paused(&basis, true).unwrap();
    assert!(goal.continuation().is_none());
    goal.resume_idle(&goal.basis().clone()).unwrap();
    assert_ne!(
        goal.continuation().unwrap().input_id(&session).unwrap(),
        input
    );
    assert_eq!(
        goal.spent(),
        Usage {
            work_turns: 1,
            inference_steps: 2
        }
    );
}

#[test]
fn explicit_continuation_is_cleared_when_the_goal_basis_changes_or_work_is_reserved() {
    let mut goal = goal(4, 9);
    let first = turn("first");
    goal.reserve(&goal.basis().clone(), first.clone(), limit(3))
        .unwrap();
    goal.account(&first, WorkOutcome::NotDispatched).unwrap();
    goal.resume_idle_once(&goal.basis().clone()).unwrap();
    let mut goal = Goal::decode(&goal.encode().unwrap()).unwrap();
    assert!(goal.explicit_continuation());

    let old_basis = goal.basis().clone();
    goal.set_paused(&old_basis, true).unwrap();
    assert!(!goal.explicit_continuation());
    assert_eq!(
        goal.resume_idle_once(&old_basis).unwrap_err().code,
        "goal_revision_changed"
    );
    goal.resume_idle_once(&goal.basis().clone()).unwrap();
    goal.revise(
        &goal.basis().clone(),
        Objective {
            description: "Verify a different export".into(),
            criteria: vec!["The new export opens".into()],
        },
    )
    .unwrap();
    assert!(!goal.explicit_continuation());

    goal.resume_idle_once(&goal.basis().clone()).unwrap();
    goal.reserve(&goal.basis().clone(), turn("next"), limit(3))
        .unwrap();
    assert!(!goal.explicit_continuation());
}
