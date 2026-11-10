//! GRIDA-SEC-004 — capability grants are bound to one host endpoint lifetime.

use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{OutcomeStatus, ToolArguments};
use agent_kit_core::tools::{
    Invocation, InvocationContext, RecoveryKind, Tool, ToolDefinition, ToolOutcome,
};
use agent_kit_core::{
    BindingId, BoxFuture, CancellationToken, Envelope, Error, ErrorKind, Result, SchemaId, ToolId,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use uuid::Uuid;

const MAX_CONCURRENT_CALLS: usize = 8;
const MAX_CALL_DURATION: Duration = Duration::from_secs(120);
const MAX_CAPABILITY_BYTES: usize = 512 * 1024;
const CALL_EVIDENCE_SCHEMA: &str = "grida.agent.tool-host.call";

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct CapabilityDefinition {
    pub tool: ToolDefinition,
    pub output_schema: Value,
    pub effect: CapabilityEffect,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CapabilityEffect {
    Read,
    Presentation,
    Mutation,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CallBinding {
    pub id: BindingId,
    pub endpoint: BindingId,
}

pub struct CapabilityCall {
    pub binding: CallBinding,
    pub capability: ToolId,
    pub version: u32,
    pub arguments: Value,
    pub cancellation: CancellationToken,
    pub deadline: Instant,
    pub max_output_bytes: usize,
}

pub struct CapabilityReply {
    pub binding: CallBinding,
    pub outcome: ToolOutcome,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct CallEvidence {
    binding: CallBinding,
    reply_verified: bool,
    owner_receipt: Option<Envelope>,
}

pub(crate) fn verified_owner_receipt(outcome: &ToolOutcome) -> Option<Envelope> {
    let receipt = outcome.receipt.as_ref()?;
    if receipt.schema().as_str() != CALL_EVIDENCE_SCHEMA
        || receipt.version() != 1
        || receipt.bytes().len() > 4096
    {
        return None;
    }
    let evidence: CallEvidence = serde_json::from_slice(receipt.bytes()).ok()?;
    evidence.owner_receipt.filter(|_| evidence.reply_verified)
}

/// The owning implementation validates its domain schema and supplies outcome
/// evidence. A bridge verifies its sender and captured endpoint again before
/// dispatching. A reply echoes the call binding it actually handled.
pub trait CapabilityExecutor: Send + Sync {
    fn validate(&self, arguments: &Value) -> Result<()>;
    fn invoke(&self, call: CapabilityCall) -> BoxFuture<'_, CapabilityReply>;
}

struct Capability {
    definition: CapabilityDefinition,
    executor: Arc<dyn CapabilityExecutor>,
}

/// One registered endpoint generation. Dropping or closing it invalidates all
/// grants issued from this owner, including grants held by active turns.
pub struct ToolHost {
    endpoint: BindingId,
    capabilities: BTreeMap<ToolId, Arc<Capability>>,
    lifetime: CancellationToken,
    concurrency: Arc<tokio::sync::Semaphore>,
}

impl ToolHost {
    pub fn new(
        capabilities: impl IntoIterator<Item = (CapabilityDefinition, Arc<dyn CapabilityExecutor>)>,
    ) -> Result<Self> {
        let mut catalog = BTreeMap::new();
        for (definition, executor) in capabilities {
            definition.tool.validate()?;
            if !matches!(&definition.tool.input, InputFormat::Json(schema) if schema.is_object())
                || !definition.output_schema.is_object()
                || definition.tool.recovery != RecoveryKind::Unavailable
                || definition.tool.max_input_bytes > MAX_CAPABILITY_BYTES
                || definition.tool.max_output_bytes > MAX_CAPABILITY_BYTES
            {
                return Err(Error::new(
                    ErrorKind::InvalidInput,
                    "invalid_host_capability",
                ));
            }
            let id = definition.tool.id.clone();
            if catalog
                .insert(
                    id,
                    Arc::new(Capability {
                        definition,
                        executor,
                    }),
                )
                .is_some()
            {
                return Err(Error::new(ErrorKind::Conflict, "duplicate_host_capability"));
            }
        }
        Ok(Self {
            endpoint: BindingId::new(Uuid::new_v4().to_string())?,
            capabilities: catalog,
            lifetime: CancellationToken::new(),
            concurrency: Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT_CALLS)),
        })
    }

    pub fn endpoint(&self) -> &BindingId {
        &self.endpoint
    }

    pub fn close(&self) {
        self.lifetime.cancel();
    }

    /// Only trusted composition issues this lease after authorizing the caller
    /// for the selected capability. The lease cannot change its destination.
    pub fn grant(&self, id: &ToolId) -> Result<CapabilityGrant> {
        if self.lifetime.is_cancelled() {
            return Err(endpoint_unavailable());
        }
        let capability = self.capabilities.get(id).ok_or_else(endpoint_unavailable)?;
        Ok(CapabilityGrant {
            endpoint: self.endpoint.clone(),
            capability: Arc::clone(capability),
            lifetime: self.lifetime.child_token(),
            concurrency: Arc::clone(&self.concurrency),
        })
    }
}

impl Drop for ToolHost {
    fn drop(&mut self) {
        self.close();
    }
}

#[derive(Clone)]
pub struct CapabilityGrant {
    endpoint: BindingId,
    capability: Arc<Capability>,
    lifetime: CancellationToken,
    concurrency: Arc<tokio::sync::Semaphore>,
}

impl CapabilityGrant {
    pub fn describe(&self) -> Result<&CapabilityDefinition> {
        if self.lifetime.is_cancelled() {
            return Err(endpoint_unavailable());
        }
        Ok(&self.capability.definition)
    }

    pub fn revoke(&self) {
        self.lifetime.cancel();
    }

    /// Shared by trusted native and external-client adapters. The caller's
    /// grant and the executor's call identifier never come from arguments.
    pub async fn invoke(
        &self,
        version: u32,
        arguments: Value,
        cancellation: CancellationToken,
        deadline: Instant,
        max_output_bytes: usize,
    ) -> Result<ToolOutcome> {
        let definition = self.describe()?;
        if definition.tool.version != version {
            return Err(Error::new(ErrorKind::Conflict, "host_capability_changed"));
        }
        if serde_json::to_vec(&arguments).map_or(usize::MAX, |bytes| bytes.len())
            > definition.tool.max_input_bytes
        {
            return Err(Error::new(
                ErrorKind::LimitExceeded,
                "host_capability_input_limit",
            ));
        }
        self.capability.executor.validate(&arguments)?;
        let _slot = self.concurrency.try_acquire().map_err(|_| {
            Error::new(
                ErrorKind::LimitExceeded,
                "host_capability_concurrency_limit",
            )
        })?;
        let deadline = deadline.min(Instant::now() + MAX_CALL_DURATION);
        if cancellation.is_cancelled() || deadline <= Instant::now() {
            return Ok(cancelled());
        }
        self.describe()?;
        let binding = CallBinding {
            id: BindingId::new(Uuid::new_v4().to_string())?,
            endpoint: self.endpoint.clone(),
        };
        let cancellation = cancellation.child_token();
        let _cancel = cancellation.clone().drop_guard();
        let max_output_bytes = max_output_bytes.min(definition.tool.max_output_bytes);
        let request = CapabilityCall {
            binding: binding.clone(),
            capability: definition.tool.id.clone(),
            version,
            arguments,
            cancellation,
            deadline,
            max_output_bytes,
        };
        let reply = tokio::select! {
            biased;
            () = self.lifetime.cancelled() => None,
            () = tokio::time::sleep_until(deadline.into()) => None,
            reply = self.capability.executor.invoke(request) => Some(reply),
        };
        let reply = reply.filter(|reply| reply.binding == binding);
        let reply_verified = reply.is_some();
        let mut outcome = reply.map_or_else(ToolOutcome::uncertain, |reply| reply.outcome);
        if serde_json::to_vec(&(&outcome.content, &outcome.structured, &outcome.receipt))
            .map_or(usize::MAX, |bytes| bytes.len())
            > max_output_bytes
        {
            outcome.content.clear();
            outcome.structured = None;
            outcome.receipt = None;
            outcome.truncated = true;
        }
        let evidence = CallEvidence {
            binding,
            reply_verified,
            owner_receipt: outcome.receipt.take(),
        };
        outcome.receipt = Some(Envelope::new(
            SchemaId::new(CALL_EVIDENCE_SCHEMA)?,
            1,
            serde_json::to_vec(&evidence)
                .map_err(|_| Error::new(ErrorKind::Uncertain, "host_call_evidence_unavailable"))?,
        )?);
        Ok(outcome)
    }
}

impl Tool for CapabilityGrant {
    fn definition(&self) -> &ToolDefinition {
        &self.capability.definition.tool
    }

    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        self.describe()?;
        self.capability
            .executor
            .validate(json_arguments(arguments)?)
    }

    fn invoke(
        &self,
        invocation: Invocation,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            if invocation.definition() != self.definition() {
                return ToolOutcome::failed("host_capability_changed");
            }
            let Ok(arguments) = json_arguments(invocation.arguments()) else {
                return ToolOutcome::failed("host_capability_requires_json");
            };
            match self
                .invoke(
                    invocation.definition().version,
                    arguments.clone(),
                    context.cancellation,
                    context
                        .deadline
                        .unwrap_or_else(|| Instant::now() + MAX_CALL_DURATION),
                    context.max_output_bytes,
                )
                .await
            {
                Ok(outcome) => outcome,
                Err(error) if error.kind == ErrorKind::Uncertain => ToolOutcome::uncertain(),
                Err(error) => ToolOutcome::failed(&error.code),
            }
        })
    }
}

fn json_arguments(arguments: &ToolArguments) -> Result<&Value> {
    match arguments {
        ToolArguments::Json(value) => Ok(value),
        ToolArguments::Text(_) => Err(Error::new(
            ErrorKind::InvalidInput,
            "host_capability_requires_json",
        )),
    }
}

fn endpoint_unavailable() -> Error {
    Error::new(ErrorKind::Unavailable, "tool_endpoint_unavailable")
}

fn cancelled() -> ToolOutcome {
    ToolOutcome {
        status: OutcomeStatus::Cancelled,
        content: Vec::new(),
        structured: None,
        receipt: None,
        truncated: false,
    }
}
