use crate::inference::{InputFormat, ToolOffer, accepts_arguments};
use crate::messages::{OutcomeStatus, ResultContent, ToolArguments};
use crate::{
    AttemptId, BoxFuture, CancellationToken, Envelope, Error, ErrorKind, Fingerprint, OperationId,
    Result, ToolId,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;
use std::time::Instant;
use tokio_util::sync::DropGuard;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub id: ToolId,
    pub version: u32,
    pub description: String,
    pub input: InputFormat,
    pub max_input_bytes: usize,
    pub max_output_bytes: usize,
    pub recovery: RecoveryKind,
}

impl ToolDefinition {
    pub fn validate(&self) -> Result<()> {
        if self.version == 0 || self.max_input_bytes == 0 || self.max_output_bytes == 0 {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "invalid_tool_definition",
            ));
        }
        Ok(())
    }
    pub fn offer(&self) -> Result<ToolOffer> {
        self.validate()?;
        Ok(ToolOffer {
            id: self.id.clone(),
            version: self.version,
            description: self.description.clone(),
            input: self.input.clone(),
            fingerprint: Fingerprint::of(self)?,
        })
    }
}

/// What an executor declares it can do for an attempt whose outcome is unknown.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecoveryKind {
    /// The executor cannot establish what happened; the attempt stays uncertain.
    Unavailable,
    /// Executing the same invocation again has the same effect as executing
    /// it once.
    Repeatable,
    /// The executor's `recover` can retrieve or reconcile the prior attempt
    /// from its checkpoint and receipts without executing new work.
    Reconcile,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ToolOutcome {
    pub status: OutcomeStatus,
    pub content: Vec<ResultContent>,
    pub structured: Option<serde_json::Value>,
    pub receipt: Option<Envelope>,
    pub truncated: bool,
}

impl ToolOutcome {
    pub fn failed(code: &str) -> Self {
        Self {
            status: OutcomeStatus::Failed,
            content: vec![ResultContent::Text(code.into())],
            structured: None,
            receipt: None,
            truncated: false,
        }
    }
    fn bound_output(mut self, maximum: usize) -> Self {
        let size = serde_json::to_vec(&(&self.content, &self.structured))
            .map_or(usize::MAX, |bytes| bytes.len());
        if size > maximum {
            self.content.clear();
            self.structured = None;
            self.truncated = true;
        }
        self
    }
    pub fn uncertain() -> Self {
        Self {
            status: OutcomeStatus::Uncertain,
            content: vec![],
            structured: None,
            receipt: None,
            truncated: false,
        }
    }
}

/// The scope of one tool execution. `invoke` and `recover` replace the
/// cancellation with a child token and clamp `max_output_bytes` to the
/// definition before the executor sees it.
#[derive(Clone, Debug)]
pub struct InvocationContext {
    pub attempt: AttemptId,
    pub cancellation: CancellationToken,
    pub deadline: Option<Instant>,
    pub max_output_bytes: usize,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Invocation {
    id: OperationId,
    definition: ToolDefinition,
    arguments: ToolArguments,
    fingerprint: Fingerprint,
}

impl Invocation {
    fn new(id: OperationId, definition: ToolDefinition, arguments: ToolArguments) -> Result<Self> {
        definition.validate()?;
        if !accepts_arguments(&definition.input, &arguments) {
            return Err(Error::new(ErrorKind::InvalidInput, "tool_argument_format"));
        }
        if serde_json::to_vec(&arguments)
            .map_err(|_| Error::new(ErrorKind::InvalidInput, "tool_argument_encoding"))?
            .len()
            > definition.max_input_bytes
        {
            return Err(Error::new(ErrorKind::LimitExceeded, "tool_input_limit"));
        }
        let fingerprint = Fingerprint::of(&(&definition, &arguments))?;
        Ok(Self {
            id,
            definition,
            arguments,
            fingerprint,
        })
    }
    pub fn id(&self) -> &OperationId {
        &self.id
    }
    pub fn definition(&self) -> &ToolDefinition {
        &self.definition
    }
    pub fn arguments(&self) -> &ToolArguments {
        &self.arguments
    }
    pub fn fingerprint(&self) -> Fingerprint {
        self.fingerprint
    }
}

impl<'de> Deserialize<'de> for Invocation {
    fn deserialize<D: serde::Deserializer<'de>>(
        deserializer: D,
    ) -> std::result::Result<Self, D::Error> {
        #[derive(Deserialize)]
        struct Data {
            id: OperationId,
            definition: ToolDefinition,
            arguments: ToolArguments,
            fingerprint: Fingerprint,
        }
        let data = Data::deserialize(deserializer)?;
        let value = Self::new(data.id, data.definition, data.arguments)
            .map_err(serde::de::Error::custom)?;
        if value.fingerprint != data.fingerprint {
            return Err(serde::de::Error::custom("invocation fingerprint mismatch"));
        }
        Ok(value)
    }
}

#[derive(Clone, Debug)]
pub struct InvocationRecovery {
    pub invocation: Invocation,
    pub checkpoint: Option<Envelope>,
    pub receipts: Vec<Envelope>,
}

pub trait Tool: Send + Sync {
    fn definition(&self) -> &ToolDefinition;
    /// Validate the declared input schema without effects. Execution preconditions remain with the tool.
    fn validate(&self, arguments: &ToolArguments) -> Result<()>;
    fn invoke(
        &self,
        invocation: Invocation,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome>;
    fn recover(
        &self,
        _recovery: InvocationRecovery,
        _context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async { ToolOutcome::uncertain() })
    }
}

#[derive(Default)]
pub struct Inventory {
    tools: BTreeMap<ToolId, Arc<dyn Tool>>,
}

impl Inventory {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn insert(&mut self, tool: Arc<dyn Tool>) -> Result<()> {
        tool.definition().validate()?;
        let id = tool.definition().id.clone();
        if self.tools.contains_key(&id) {
            return Err(Error::new(ErrorKind::Conflict, "duplicate_tool"));
        }
        self.tools.insert(id, tool);
        Ok(())
    }
    pub fn snapshot(&self, selected: &[ToolId]) -> Result<InventorySnapshot> {
        let mut tools = BTreeMap::new();
        let mut seen = BTreeSet::new();
        for id in selected {
            if !seen.insert(id) {
                return Err(Error::new(
                    ErrorKind::InvalidInput,
                    "duplicate_tool_selection",
                ));
            }
            let tool = self
                .tools
                .get(id)
                .ok_or_else(|| Error::new(ErrorKind::Unavailable, "tool_unavailable"))?;
            tools.insert(
                id.clone(),
                CapturedTool {
                    definition: tool.definition().clone(),
                    executor: Arc::clone(tool),
                },
            );
        }
        Ok(InventorySnapshot { tools })
    }
}

#[derive(Clone)]
struct CapturedTool {
    definition: ToolDefinition,
    executor: Arc<dyn Tool>,
}

#[derive(Clone)]
pub struct InventorySnapshot {
    tools: BTreeMap<ToolId, CapturedTool>,
}

impl InventorySnapshot {
    pub fn offers(&self) -> Result<Vec<ToolOffer>> {
        self.tools
            .values()
            .map(|tool| tool.definition.offer())
            .collect()
    }
    pub fn prepare(
        &self,
        id: OperationId,
        tool: &ToolId,
        arguments: ToolArguments,
    ) -> Result<PreparedInvocation> {
        let captured = self
            .tools
            .get(tool)
            .ok_or_else(|| Error::new(ErrorKind::Unavailable, "tool_unavailable"))?;
        let invocation = Invocation::new(id, captured.definition.clone(), arguments)?;
        self.restore(invocation)
    }
    pub fn restore(&self, invocation: Invocation) -> Result<PreparedInvocation> {
        let captured = self
            .tools
            .get(&invocation.definition.id)
            .ok_or_else(|| Error::new(ErrorKind::Unavailable, "tool_unavailable"))?;
        if captured.definition != invocation.definition
            || captured.executor.definition() != &captured.definition
        {
            return Err(Error::new(ErrorKind::Conflict, "tool_definition_changed"));
        }
        captured.executor.validate(&invocation.arguments)?;
        Ok(PreparedInvocation {
            invocation,
            executor: Arc::clone(&captured.executor),
        })
    }
}

pub struct PreparedInvocation {
    invocation: Invocation,
    executor: Arc<dyn Tool>,
}

impl PreparedInvocation {
    pub fn invocation(&self) -> &Invocation {
        &self.invocation
    }

    /// Scope `context` to this one execution: a child cancellation that ends
    /// when the returned guard drops, and an output allowance within the
    /// definition's bound. The flag reports that the work can no longer
    /// start because it was cancelled or its deadline passed.
    fn scope(&self, context: &mut InvocationContext) -> (DropGuard, bool) {
        context.cancellation = context.cancellation.child_token();
        let guard = context.cancellation.clone().drop_guard();
        context.max_output_bytes = context
            .max_output_bytes
            .min(self.invocation.definition.max_output_bytes);
        let closed = context.cancellation.is_cancelled()
            || context
                .deadline
                .is_some_and(|deadline| deadline <= Instant::now());
        (guard, closed)
    }
    pub async fn invoke(self, mut context: InvocationContext) -> ToolOutcome {
        let (_cancel, closed) = self.scope(&mut context);
        if closed {
            return ToolOutcome {
                status: OutcomeStatus::Cancelled,
                content: vec![],
                structured: None,
                receipt: None,
                truncated: false,
            };
        }
        if self.executor.definition() != &self.invocation.definition {
            return ToolOutcome::failed("tool_definition_changed");
        }
        let maximum = context.max_output_bytes;
        self.executor
            .invoke(self.invocation, context)
            .await
            .bound_output(maximum)
    }

    pub async fn recover(
        self,
        recovery: InvocationRecovery,
        mut context: InvocationContext,
    ) -> ToolOutcome {
        if recovery.invocation != self.invocation
            || self.executor.definition() != &self.invocation.definition
        {
            return ToolOutcome::failed("recovery_binding_mismatch");
        }
        let (_cancel, closed) = self.scope(&mut context);
        if closed {
            return ToolOutcome::uncertain();
        }
        let maximum = context.max_output_bytes;
        self.executor
            .recover(recovery, context)
            .await
            .bound_output(maximum)
    }
}
