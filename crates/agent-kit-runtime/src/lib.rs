//! Live turns over caller-owned providers, executors, authority, and journals.
//!
//! The runtime owns operation identity and admission. Product strategy, tool
//! semantics, approval interpretation, and persistence remain supplied bindings.

mod execution;
mod step;

use agent_kit_core::authority::{AuthorityValidator, Denial, GrantSelection};
use agent_kit_core::history::HistoryPosition;
use agent_kit_core::inference::{InferenceOutcome, InferenceUpdate, PreparedRequest, Provider};
use agent_kit_core::messages::{ToolArguments, ToolCall};
use agent_kit_core::tools::{InventorySnapshot, ToolOutcome};
use agent_kit_core::turn::{ControlRevision, OperationState, TurnOutcome, TurnState};
use agent_kit_core::{
    BoxFuture, Envelope, Error, ErrorKind, OperationId, ProviderId, Result, ToolId, WaitId,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::Duration;

pub use execution::{OpenedTurn, Runtime, Turn, TurnObserver, TurnOperations};

/// A logical operation name supplied by the master and retained across restart.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct OperationKey(OperationId);

impl OperationKey {
    pub fn new(value: impl Into<String>) -> Result<Self> {
        Ok(Self(OperationId::new(value)?))
    }

    pub fn as_str(&self) -> &str {
        self.0.as_str()
    }
}

#[derive(Clone, Debug)]
pub struct ExecutionLimits {
    pub max_operations: usize,
    pub max_concurrent_inferences: usize,
    pub max_concurrent_tools: usize,
    pub max_output_bytes: usize,
    pub operation_timeout: Duration,
    pub observer_capacity: usize,
}

impl ExecutionLimits {
    fn validate(&self) -> Result<()> {
        if self.max_operations == 0
            || self.max_concurrent_inferences == 0
            || self.max_concurrent_tools == 0
            || self.max_output_bytes == 0
            || self.operation_timeout.is_zero()
            || self.observer_capacity == 0
            || self.max_operations > tokio::sync::Semaphore::MAX_PERMITS
            || self.max_concurrent_inferences > tokio::sync::Semaphore::MAX_PERMITS
            || self.max_concurrent_tools > tokio::sync::Semaphore::MAX_PERMITS
            || self.observer_capacity > tokio::sync::Semaphore::MAX_PERMITS
            || std::time::Instant::now()
                .checked_add(self.operation_timeout)
                .is_none()
        {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "invalid_execution_limits",
            ));
        }
        Ok(())
    }
}

pub struct ExecutionServices {
    pub providers: BTreeMap<ProviderId, Arc<dyn Provider>>,
    pub tools: InventorySnapshot,
    pub authority: Arc<dyn AuthorityValidator>,
    pub gate: Arc<dyn ToolGate>,
    pub limits: ExecutionLimits,
}

#[derive(Clone, Debug)]
pub struct PlannedInvocation {
    pub tool: ToolId,
    pub arguments: ToolArguments,
    /// Host-issued authority selected before admission. A gate may activate the
    /// same pending grant, but cannot replace this recorded action's principal.
    pub grants: GrantSelection,
}

#[derive(Clone)]
pub struct ToolAdmission {
    pub operation: OperationId,
    pub invocation: agent_kit_core::tools::Invocation,
    pub grants: GrantSelection,
}

#[derive(Clone)]
pub struct AdmissionContext {
    pub operations: TurnOperations,
}

/// Product-owned checks run before dispatch and after durable preparation.
/// Implementations may perform recorded work through the supplied operations.
pub trait ToolGate: Send + Sync {
    fn decide(
        &self,
        admission: ToolAdmission,
        context: AdmissionContext,
    ) -> BoxFuture<'_, Result<ToolDecision>>;
}

#[derive(Clone, Debug)]
pub enum ToolDecision {
    Permit,
    Deny(Denial),
    Defer(WaitId),
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum InvokeOutcome {
    Complete(ToolOutcome),
    Deferred(WaitId),
    /// Actual turn Pause interrupted admission before the attempt committed.
    /// The prepared operation can be reconsidered under new controls.
    Paused,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum WaitOutcome {
    Answered(Envelope),
    Withdrawn,
    Pending(WaitId),
}

#[derive(Clone, Debug)]
pub struct CompletionDraft {
    pub expected_control: ControlRevision,
    pub expected_history: HistoryPosition,
    pub outcome: TurnOutcome,
}

#[derive(Clone, Debug)]
pub struct SuspensionDraft {
    pub expected_control: ControlRevision,
    pub expected_history: HistoryPosition,
    pub checkpoint: Option<Envelope>,
}

#[derive(Clone, Debug)]
pub enum FinishOutcome {
    Settled(Box<agent_kit_core::turn::SettlementReceipt>),
    Continue(Error),
}

#[derive(Clone, Debug)]
pub enum SuspendOutcome {
    Suspended(agent_kit_core::turn::SuspensionReceipt),
    Continue(Error),
}

#[derive(Clone, Debug)]
pub struct TurnView {
    pub state: TurnState,
    pub active: Vec<OperationId>,
    pub admission_closed: bool,
}

impl TurnView {
    pub fn operation(&self, id: &OperationId) -> Option<&OperationState> {
        self.state.operations().get(id)
    }
}

#[derive(Clone, Debug)]
pub enum TurnUpdate {
    Snapshot(Box<TurnView>),
    Inference {
        operation: OperationId,
        update: InferenceUpdate,
    },
    Operation {
        operation: OperationId,
        outcome: agent_kit_core::turn::OperationOutcome,
    },
    Deferred {
        operation: OperationId,
        wait: WaitId,
    },
}

pub struct StepPlan {
    pub key: OperationKey,
    pub request: PreparedRequest,
    pub inference_grants: GrantSelection,
    pub tool_grants: BTreeMap<ToolId, GrantSelection>,
    pub tools: InventorySnapshot,
}

#[derive(Clone, Debug, PartialEq)]
pub struct StepToolOutcome {
    pub call: ToolCall,
    pub outcome: InvokeOutcome,
}

#[derive(Clone, Debug, PartialEq)]
pub struct StepOutcome {
    pub inference: InferenceOutcome,
    pub tools: Vec<StepToolOutcome>,
    /// Candidate transcript derived from durable outcomes. The master publishes
    /// it together with its continuation checkpoint when those results are ready.
    pub history: Vec<agent_kit_core::history::HistoryRecord>,
}
