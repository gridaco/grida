//! GRIDA-SEC-004 — Account only the exact sponsored review's recorded attempts.

use super::{collection::CollectReview, delegation_definition, delegation_grant};
use agent_kit_core::messages::OutcomeStatus;
use agent_kit_core::turn::{OperationInput, TurnState};
use agent_kit_core::{BoxFuture, Result};
use agent_kit_store_sqlite::SqliteStore;
use grida_agent_master::goals::{ChildWork, ChildWorkObserver, inference_attempts};
use std::sync::Arc;
use std::time::Duration;

pub(in crate::host) struct GoalChildWork(pub Arc<SqliteStore>);

impl GoalChildWork {
    async fn read(&self, parent: &TurnState) -> Result<ChildWork> {
        let collection = CollectReview::new(self.0.clone(), parent.binding().clone())?;
        let Some(child) = collection.read().await? else {
            let grant = delegation_grant(parent.binding())?;
            let definition = delegation_definition()?;
            let may_have_launched = parent.operations().values().any(|entry| {
                entry.record.grants == grant
                    && matches!(&entry.record.input, OperationInput::Tool(invocation)
                        if invocation.definition() == &definition)
                    && (entry.is_running()
                        || entry.is_uncertain()
                        || entry.outcome().is_some_and(|outcome| outcome.is_success()))
            });
            return Ok(if may_have_launched {
                ChildWork::Unsettled { observed_steps: 0 }
            } else {
                ChildWork::Settled { observed_steps: 0 }
            });
        };
        self.0
            .inspect_turn_with(child.binding.session, child.binding.turn, |state| {
                let observed_steps = inference_attempts(state)?;
                let settled = state
                    .outcome()
                    .is_some_and(|outcome| outcome.status != OutcomeStatus::Uncertain)
                    && state.operations().values().all(|operation| {
                        operation.outcome().is_some() && !operation.is_uncertain()
                    });
                Ok(if settled {
                    ChildWork::Settled { observed_steps }
                } else {
                    ChildWork::Unsettled { observed_steps }
                })
            })
            .await
    }
}

impl ChildWorkObserver for GoalChildWork {
    fn observe<'a>(&'a self, parent: &'a TurnState) -> BoxFuture<'a, ChildWork> {
        Box::pin(async move {
            match tokio::time::timeout(Duration::from_millis(750), self.read(parent)).await {
                Ok(Ok(work)) => work,
                _ => ChildWork::Unsettled { observed_steps: 0 },
            }
        })
    }
}
