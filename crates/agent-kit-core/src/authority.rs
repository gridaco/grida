use crate::{
    BindingId, BoxFuture, Error, Fingerprint, GrantId, OperationId, PrincipalId, Result, ScopeId,
};
use serde::{Deserialize, Serialize};

/// Opaque identifiers interpreted and revalidated by the authority owner.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuthorityBinding {
    pub principal: PrincipalId,
    pub binding: BindingId,
    pub scope: ScopeId,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct GrantSelection {
    pub authority: AuthorityBinding,
    pub grants: Vec<GrantId>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuthorityRequest {
    pub operation: OperationId,
    pub action: Fingerprint,
    pub selection: GrantSelection,
}

/// The host determines whether the supplied grants currently authorize the operation.
pub trait AuthorityValidator: Send + Sync {
    fn validate(&self, request: AuthorityRequest) -> BoxFuture<'_, Result<()>>;
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Denial {
    pub reason: Error,
}
