//! GRIDA-SEC-004 — outbound MCP authority belongs to one captured host lease and turn.

use super::{Host, problem};
use crate::mcp_client::McpClient;
use crate::tool_host::CapabilityGrant;
use agent_kit_core::authority::{
    AuthorityBinding, AuthorityRequest, AuthorityValidator, GrantSelection,
};
use agent_kit_core::tools::Inventory;
use agent_kit_core::turn::TurnBinding;
use agent_kit_core::{
    BindingId, BoxFuture, ErrorKind, Fingerprint, GrantId, PrincipalId, Result, ScopeId, ToolId,
};
use agent_kit_runtime::{AdmissionContext, ToolAdmission, ToolDecision, ToolGate};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::Arc;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(super) struct Capture {
    lease: BindingId,
    catalog: Fingerprint,
}

pub(super) struct McpTools {
    client: McpClient,
    capture: Capture,
    grants: BTreeMap<ToolId, CapabilityGrant>,
}

impl Host {
    /// Adds the explicitly trusted local MCP client to new headless Act work.
    /// The caller must finish composition before admitting requests.
    pub fn with_mcp_client(mut self, client: McpClient) -> Result<Self> {
        self.execution()?;
        if self.mcp_tools.is_some() {
            return Err(problem(ErrorKind::Conflict, "mcp_owner_already_configured"));
        }
        self.mcp_tools = Some(Arc::new(McpTools::new(client)?));
        Ok(self)
    }

    pub(super) fn capture_mcp(&self, allowed: bool) -> Result<Option<Capture>> {
        self.mcp_tools
            .as_ref()
            .filter(|_| allowed && self.side_context.is_none())
            .map(|owner| {
                owner.client.ensure_open()?;
                Ok(owner.capture.clone())
            })
            .transpose()
    }

    pub(super) fn retained_mcp(&self, capture: &Capture) -> Result<Arc<McpTools>> {
        let owner = self
            .mcp_tools
            .as_ref()
            .filter(|owner| &owner.capture == capture)
            .ok_or_else(|| problem(ErrorKind::Unavailable, "retained_mcp_lease_unavailable"))?;
        owner.client.ensure_open()?;
        Ok(owner.clone())
    }
}

impl McpTools {
    fn new(client: McpClient) -> Result<Self> {
        let mut grants = BTreeMap::new();
        let mut definitions = BTreeMap::new();
        for grant in client.selected_grants()? {
            let definition = grant.describe()?;
            let id = definition.tool.id.clone();
            definitions.insert(id.clone(), Fingerprint::of(definition)?);
            grants.insert(id, grant);
        }
        let capture = Capture {
            lease: client.lease().clone(),
            catalog: Fingerprint::of(&definitions)?,
        };
        Ok(Self {
            client,
            capture,
            grants,
        })
    }

    pub(super) fn close(&self) {
        self.client.close();
    }

    pub(super) fn bind(self: Arc<Self>, turn: &TurnBinding) -> Result<Arc<TurnTools>> {
        let authority = AuthorityBinding {
            principal: PrincipalId::new("local-mcp")?,
            binding: self.capture.lease.clone(),
            // A resumed turn can still use the exact same live owner.
            scope: ScopeId::new(turn.turn.as_str())?,
        };
        let selections = self
            .grants
            .keys()
            .map(|id| {
                Ok((
                    id.clone(),
                    GrantSelection {
                        authority: authority.clone(),
                        grants: vec![GrantId::new(id.as_str())?],
                    },
                ))
            })
            .collect::<Result<_>>()?;
        Ok(Arc::new(TurnTools {
            owner: self,
            turn: turn.clone(),
            selections,
        }))
    }
}

pub(super) struct TurnTools {
    owner: Arc<McpTools>,
    turn: TurnBinding,
    selections: BTreeMap<ToolId, GrantSelection>,
}

impl TurnTools {
    pub(super) fn handles(&self, selection: &GrantSelection) -> bool {
        self.selections.values().any(|entry| entry == selection)
    }

    pub(super) fn insert(
        &self,
        inventory: &mut Inventory,
        selections: &mut BTreeMap<ToolId, GrantSelection>,
    ) -> Result<()> {
        for (id, selection) in &self.selections {
            inventory.insert(Arc::new(self.owner.grants[id].clone()))?;
            selections.insert(id.clone(), selection.clone());
        }
        Ok(())
    }
}

impl AuthorityValidator for TurnTools {
    fn validate(&self, request: AuthorityRequest) -> BoxFuture<'_, Result<()>> {
        Box::pin(async move {
            if !self.handles(&request.selection) {
                return Err(problem(
                    ErrorKind::Unavailable,
                    "mcp_tool_authority_unavailable",
                ));
            }
            self.owner.client.ensure_open()
        })
    }
}

impl ToolGate for TurnTools {
    fn decide(
        &self,
        admission: ToolAdmission,
        context: AdmissionContext,
    ) -> BoxFuture<'_, Result<ToolDecision>> {
        Box::pin(async move {
            let definition = admission.invocation.definition();
            if self.selections.get(&definition.id) != Some(&admission.grants)
                || context.operations.view().state.binding() != &self.turn
                || admission.invocation.id() != &admission.operation
                || &self.owner.grants[&definition.id].describe()?.tool != definition
            {
                return Err(problem(
                    ErrorKind::Unavailable,
                    "mcp_tool_authority_unavailable",
                ));
            }
            self.owner.client.ensure_open()?;
            Ok(ToolDecision::Permit)
        })
    }
}
