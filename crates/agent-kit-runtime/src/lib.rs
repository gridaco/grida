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
    /// Validate a key. The same key names the same logical work on replay.
    pub fn new(value: impl Into<String>) -> Result<Self> {
        Ok(Self(OperationId::new(value)?))
    }

    /// The key's text.
    pub fn as_str(&self) -> &str {
        self.0.as_str()
    }
}

/// Mechanism bounds for one runtime. Every value must be nonzero.
/// `Runtime::new` rejects invalid limits with `invalid_execution_limits`.
#[derive(Clone, Debug)]
pub struct ExecutionLimits {
    /// Maximum recorded operations in one turn, and separately the maximum
    /// interactions it can open. It also sizes a step's call channel.
    /// Exceeding it fails with `operation_limit` or `interaction_limit` before
    /// anything is recorded.
    pub max_operations: usize,
    /// Inference executions that may run at once across every turn opened
    /// from this runtime and its derived runtimes.
    pub max_concurrent_inferences: usize,
    /// Tool executions and recoveries that may run at once across every turn
    /// opened from this runtime and its derived runtimes.
    pub max_concurrent_tools: usize,
    /// Output byte allowance given to each provider attempt and executor.
    pub max_output_bytes: usize,
    /// Absolute deadline for one operation, measured from its admission.
    /// Waiting for capacity, authorization, and execution all count against it.
    pub operation_timeout: Duration,
    /// Updates an observer can fall behind before it receives a snapshot in
    /// place of the updates it missed.
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

/// Caller-owned bindings a runtime executes through.
pub struct ExecutionServices {
    /// Adapters by the provider identity a prepared request names.
    pub providers: BTreeMap<ProviderId, Arc<dyn Provider>>,
    /// Default captured tools for `invoke` and `recover_tool`.
    pub tools: InventorySnapshot,
    /// Validates the exact recorded action under current authority before
    /// any attempt begins.
    pub authority: Arc<dyn AuthorityValidator>,
    /// The caller's admission decision for each prepared tool operation.
    pub gate: Arc<dyn ToolGate>,
    /// Mechanism bounds.
    pub limits: ExecutionLimits,
}

/// A tool operation the caller has chosen to run.
#[derive(Clone, Debug)]
pub struct PlannedInvocation {
    /// The captured tool to run.
    pub tool: ToolId,
    /// Arguments the tool validates before preparation is recorded.
    pub arguments: ToolArguments,
    /// Host-issued authority selected before admission. A gate may activate the
    /// same pending grant, but cannot replace this recorded action's principal.
    pub grants: GrantSelection,
}

/// A prepared tool operation presented to the gate before dispatch.
#[derive(Clone)]
pub struct ToolAdmission {
    /// The recorded operation identity.
    pub operation: OperationId,
    /// The exact invocation that would run.
    pub invocation: agent_kit_core::tools::Invocation,
    /// The authority recorded with the operation.
    pub grants: GrantSelection,
}

/// What a gate can use while deciding.
#[derive(Clone)]
pub struct AdmissionContext {
    /// The turn's operations, for recorded work such as opening a question.
    pub operations: TurnOperations,
}

/// Caller-owned checks run before dispatch and after durable preparation.
/// Implementations may perform recorded work through the supplied operations.
/// The runtime still validates authority and current controls after a permit,
/// and records an error or denial as definite nonexecution.
pub trait ToolGate: Send + Sync {
    fn decide(
        &self,
        admission: ToolAdmission,
        context: AdmissionContext,
    ) -> BoxFuture<'_, Result<ToolDecision>>;
}

/// A gate's decision for one prepared tool operation.
#[derive(Clone, Debug)]
pub enum ToolDecision {
    /// Continue to authorization and dispatch.
    Permit,
    /// Record definite nonexecution with the denial's reason.
    Deny(Denial),
    /// Leave the operation prepared until the named recorded interaction is
    /// resolved. The wait must already be open.
    Defer(WaitId),
}

/// The result of one tool operation request.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum InvokeOutcome {
    /// The recorded outcome, including definite nonexecution.
    Complete(ToolOutcome),
    /// The gate deferred the prepared operation on this interaction.
    Deferred(WaitId),
    /// Actual turn Pause interrupted admission before the attempt committed.
    /// The prepared operation can be reconsidered under new controls.
    Paused,
}

/// How a wait for an interaction ended.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum WaitOutcome {
    /// The recorded answer.
    Answered(Envelope),
    /// The interaction was withdrawn.
    Withdrawn,
    /// Admission closed or ownership ended while the interaction stayed open.
    /// The recorded interaction remains for a later owner.
    Pending(WaitId),
}

/// The caller's decision to settle a turn, valid only against the exact
/// control revision and history position it was made from.
#[derive(Clone, Debug)]
pub struct CompletionDraft {
    pub expected_control: ControlRevision,
    pub expected_history: HistoryPosition,
    pub outcome: TurnOutcome,
}

/// The caller's decision to suspend a turn, valid only against the exact
/// control revision and history position it was made from.
#[derive(Clone, Debug)]
pub struct SuspensionDraft {
    pub expected_control: ControlRevision,
    pub expected_history: HistoryPosition,
    /// Recorded with the suspension when present.
    pub checkpoint: Option<Envelope>,
}

/// The result of a settlement attempt.
#[derive(Clone, Debug)]
pub enum FinishOutcome {
    /// The turn settled and this controller released ownership.
    Settled(Box<agent_kit_core::turn::SettlementReceipt>),
    /// Settlement was refused and the controller stays usable. Codes include
    /// `work_still_running`, `work_unsettled` and `stale_completion_basis`.
    Continue(Error),
}

/// The result of a suspension attempt.
#[derive(Clone, Debug)]
pub enum SuspendOutcome {
    /// The turn suspended and this controller released ownership.
    Suspended(agent_kit_core::turn::SuspensionReceipt),
    /// Suspension was refused and the controller stays usable. Codes include
    /// `work_still_running` and `stale_completion_basis`.
    Continue(Error),
}

/// The latest known turn state with its local execution status.
#[derive(Clone, Debug)]
pub struct TurnView {
    /// The most recently loaded journal state.
    pub state: TurnState,
    /// Operations with a live local owner.
    pub active: Vec<OperationId>,
    /// Whether new work would be refused, because of durable controls or
    /// because this controller is closing, frozen or released.
    pub admission_closed: bool,
}

impl TurnView {
    /// The recorded state of one operation.
    pub fn operation(&self, id: &OperationId) -> Option<&OperationState> {
        self.state.operations().get(id)
    }
}

/// A live update for observers. Delivery is best effort: a lagging
/// observer receives a snapshot in place of the updates it missed.
#[derive(Clone, Debug)]
pub enum TurnUpdate {
    /// The state, active set or admission changed.
    Snapshot(Box<TurnView>),
    /// An item streamed by a running inference.
    Inference {
        operation: OperationId,
        update: InferenceUpdate,
    },
    /// An operation recorded its outcome.
    Operation {
        operation: OperationId,
        outcome: agent_kit_core::turn::OperationOutcome,
    },
    /// The gate deferred a tool operation on an interaction.
    Deferred {
        operation: OperationId,
        wait: WaitId,
    },
}

/// One response and the tools it may call.
pub struct StepPlan {
    /// Names the response; tool operations derive their keys from it.
    pub key: OperationKey,
    /// Its offered tools must equal `tools` on a first run.
    pub request: PreparedRequest,
    /// Authority for the provider request only.
    pub inference_grants: GrantSelection,
    /// Authority for each offered tool. A call to an offered tool without an
    /// entry fails the step with `tool_authority_missing`.
    pub tool_grants: BTreeMap<ToolId, GrantSelection>,
    /// The captured tools the response may call.
    pub tools: InventorySnapshot,
}

/// One declared call and its result.
#[derive(Clone, Debug, PartialEq)]
pub struct StepToolOutcome {
    pub call: ToolCall,
    pub outcome: InvokeOutcome,
}

/// A settled response and its calls.
#[derive(Clone, Debug, PartialEq)]
pub struct StepOutcome {
    pub inference: InferenceOutcome,
    /// Every declared call, ordered by call identity.
    pub tools: Vec<StepToolOutcome>,
    /// Candidate transcript derived from durable outcomes. The master publishes
    /// it together with its continuation checkpoint when those results are ready.
    pub history: Vec<agent_kit_core::history::HistoryRecord>,
}
