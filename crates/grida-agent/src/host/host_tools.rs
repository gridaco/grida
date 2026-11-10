//! GRIDA-SEC-004 — tool-host authority belongs to the captured endpoints and turn.

use super::{Host, problem};
use crate::editor_surfaces::{LIST_OPEN, READ_TEXT, REPLACE_TEXT};
use crate::mcp_client::McpClient;
use crate::surface_tools::{OPEN_SURFACE, headless_surface};
use crate::tool_host::{CapabilityGrant, ToolHost};
use agent_kit_core::authority::{
    AuthorityBinding, AuthorityRequest, AuthorityValidator, GrantSelection,
};
use agent_kit_core::tools::Inventory;
use agent_kit_core::turn::TurnBinding;
use agent_kit_core::{
    BindingId, BoxFuture, ErrorKind, Fingerprint, GrantId, PrincipalId, Result, ScopeId, ToolId,
};
use agent_kit_runtime::{AdmissionContext, ToolAdmission, ToolDecision, ToolGate};
use grida_agent_master::presentation;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::Arc;

const HEADLESS_BINDING: &str = "grida-headless-surface-v1";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(super) struct Capture {
    lease: BindingId,
    catalog: Fingerprint,
}

pub(super) struct HostTools {
    mcp: Option<McpClient>,
    surface: Option<ToolHost>,
    capture: Capture,
    grants: BTreeMap<ToolId, CapabilityGrant>,
    principal: &'static str,
}

impl Host {
    /// Adds the explicitly trusted local MCP client to new headless Act work.
    /// The caller must finish composition before admitting requests.
    pub fn with_mcp_client(self, client: McpClient) -> Result<Self> {
        self.with_tools(Some(client), None)
    }

    /// Offer the built-in headless presentation capability to Act work.
    pub fn with_headless_surface(self) -> Result<Self> {
        self.with_tools(None, Some(headless_surface()?))
    }

    fn with_tools(mut self, mcp: Option<McpClient>, surface: Option<ToolHost>) -> Result<Self> {
        self.execution()?;
        let (previous_mcp, previous_surface) = if let Some(owner) = self.host_tools.take() {
            let owner = Arc::try_unwrap(owner)
                .map_err(|_| problem(ErrorKind::Conflict, "host_tool_owner_already_shared"))?;
            (owner.mcp, owner.surface)
        } else {
            (None, None)
        };
        if mcp.is_some() && previous_mcp.is_some() {
            return Err(problem(ErrorKind::Conflict, "mcp_owner_already_configured"));
        }
        if surface.is_some() && previous_surface.is_some() {
            return Err(problem(
                ErrorKind::Conflict,
                "surface_owner_already_configured",
            ));
        }
        self.host_tools = Some(Arc::new(HostTools::new(
            mcp.or(previous_mcp),
            surface.or(previous_surface),
        )?));
        Ok(self)
    }

    pub(super) fn capture_host_tools(&self, allowed: bool) -> Result<Option<Capture>> {
        self.host_tools
            .as_ref()
            .filter(|_| allowed && self.side_context.is_none())
            .map(|owner| {
                owner.ensure_open()?;
                Ok(owner.capture.clone())
            })
            .transpose()
    }

    pub(super) fn retained_host_tools(&self, capture: &Capture) -> Result<Arc<HostTools>> {
        let owner = self
            .host_tools
            .as_ref()
            .filter(|owner| &owner.capture == capture)
            .ok_or_else(|| {
                problem(
                    ErrorKind::Unavailable,
                    if capture.lease.as_str() == HEADLESS_BINDING {
                        "retained_surface_definition_unavailable"
                    } else {
                        "retained_mcp_lease_unavailable"
                    },
                )
            })?;
        owner.ensure_open()?;
        Ok(owner.clone())
    }
}

impl HostTools {
    pub(super) fn has_local_surface(&self) -> bool {
        self.surface.is_some()
    }

    fn new(mcp: Option<McpClient>, surface: Option<ToolHost>) -> Result<Self> {
        let lease = mcp
            .as_ref()
            .map(|client| Ok(client.lease().clone()))
            .unwrap_or_else(|| BindingId::new(HEADLESS_BINDING))?;
        let principal = if mcp.is_some() {
            "local-mcp"
        } else {
            "local-headless"
        };
        Self::with_local(mcp, surface, &[OPEN_SURFACE], lease, principal)
    }

    pub(super) fn editor(
        surface: ToolHost,
        lease: BindingId,
        present: bool,
        svg_text: bool,
    ) -> Result<Self> {
        let mut capabilities = vec![LIST_OPEN];
        if present {
            capabilities.push(presentation::OPEN);
        }
        if svg_text {
            capabilities.extend([READ_TEXT, REPLACE_TEXT]);
        }
        Self::with_local(
            None,
            Some(surface),
            &capabilities,
            lease,
            presentation::PRINCIPAL,
        )
    }

    fn with_local(
        mcp: Option<McpClient>,
        surface: Option<ToolHost>,
        local_ids: &[&str],
        lease: BindingId,
        principal: &'static str,
    ) -> Result<Self> {
        let mut grants = BTreeMap::new();
        let mut definitions = BTreeMap::new();
        let selected = mcp
            .as_ref()
            .map(McpClient::selected_grants)
            .transpose()?
            .unwrap_or_default();
        let local = surface.iter().flat_map(|host| {
            local_ids
                .iter()
                .map(move |id| host.grant(&ToolId::new(*id)?))
        });
        for grant in selected.into_iter().map(Ok).chain(local) {
            let grant = grant?;
            let definition = grant.describe()?;
            let id = definition.tool.id.clone();
            if definitions
                .insert(id.clone(), Fingerprint::of(definition)?)
                .is_some()
            {
                return Err(problem(ErrorKind::Conflict, "duplicate_host_tool"));
            }
            grants.insert(id, grant);
        }
        let capture = Capture {
            lease,
            catalog: Fingerprint::of(&definitions)?,
        };
        Ok(Self {
            mcp,
            surface,
            capture,
            grants,
            principal,
        })
    }

    pub(super) fn close(&self) {
        if let Some(mcp) = &self.mcp {
            mcp.close();
        }
        if let Some(surface) = &self.surface {
            surface.close();
        }
    }

    fn ensure_open(&self) -> Result<()> {
        if let Some(mcp) = &self.mcp {
            mcp.ensure_open()?;
        }
        self.grants
            .values()
            .try_for_each(|grant| grant.describe().map(|_| ()))
    }

    pub(super) fn bind(self: Arc<Self>, turn: &TurnBinding) -> Result<Arc<TurnTools>> {
        let authority = AuthorityBinding {
            principal: PrincipalId::new(self.principal)?,
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
    owner: Arc<HostTools>,
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
                    "host_tool_authority_unavailable",
                ));
            }
            self.owner.ensure_open()
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
                    "host_tool_authority_unavailable",
                ));
            }
            self.owner.ensure_open()?;
            Ok(ToolDecision::Permit)
        })
    }
}
