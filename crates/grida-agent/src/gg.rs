//! GRIDA-SEC-006 / GRIDA-GG: token — invocation-scoped native GG chat authority.

use agent_kit_core::authority::AuthorityBinding;
use agent_kit_core::inference::ProviderBinding;
use agent_kit_core::{
    BindingId, Error, ErrorKind, Fingerprint, PrincipalId, ProviderId, Result, ScopeId,
};
use agent_kit_providers::{TransportOperation, TransportRequest};
use grida_auth::GgGrant;
use reqwest::Url;
use reqwest::header::HeaderValue;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use uuid::Uuid;
use zeroize::Zeroizing;

/// Secret-bearing input for a trusted host HTTP adapter. It has no debug or
/// serialization projection. The transport checks expiry again before sending.
#[non_exhaustive]
pub struct GgChatRequest {
    pub target: String,
    pub authorization: HeaderValue,
    pub body: Vec<u8>,
    pub max_response_bytes: usize,
    pub expires_at: SystemTime,
}

/// A native GG grant projected into a fixed text-inference connection.
pub struct GgConnection {
    target: Url,
    header: HeaderValue,
    expires_at_ms: i64,
    binding: ProviderBinding,
    scope: Fingerprint,
}

impl GgConnection {
    /// Bounded in-memory handoff suitable for AuthClient::request_gg_with.
    pub fn from_grant(grant: &GgGrant) -> Result<Self> {
        let connection = Self::bind(
            grant.api_origin(),
            grant.account_subject(),
            grant.organization_id(),
            grant.expires_at_ms(),
            grant.token(),
        )?;
        connection.validate()?;
        Ok(connection)
    }

    fn bind(
        api_origin: &str,
        account_subject: &str,
        organization_id: i64,
        expires_at_ms: i64,
        token: &str,
    ) -> Result<Self> {
        let mut target = Url::parse(api_origin).map_err(|_| invalid_origin())?;
        if target.host_str().is_none()
            || !target.username().is_empty()
            || target.password().is_some()
            || target.query().is_some()
            || target.fragment().is_some()
            || target.path() != "/"
            || !(target.scheme() == "https"
                || (target.scheme() == "http" && target.host_str() == Some("127.0.0.1")))
        {
            return Err(invalid_origin());
        }
        let origin = target.origin().ascii_serialization();
        target.set_path("/api/v1/ai/chat/completions");
        let scope =
            Fingerprint::of(&("gg-chat-scope-v1", origin, account_subject, organization_id))?;
        let principal =
            Uuid::from_bytes(scope.bytes()[..16].try_into().expect("fingerprint prefix"));
        let binding = ProviderBinding {
            provider: ProviderId::new("gg")?,
            authority: AuthorityBinding {
                principal: PrincipalId::new(format!("gg:{principal}"))?,
                binding: BindingId::new(Uuid::new_v4().to_string())?,
                scope: ScopeId::new("gg-chat-completions")?,
            },
        };
        let bearer = Zeroizing::new(format!("Bearer {token}"));
        let mut header = HeaderValue::from_str(&bearer)
            .map_err(|_| Error::new(ErrorKind::Unavailable, "gg_grant_invalid"))?;
        header.set_sensitive(true);
        Ok(Self {
            target,
            header,
            expires_at_ms,
            binding,
            scope,
        })
    }

    /// The configured account API origin, with no path or credential.
    pub fn api_origin(&self) -> String {
        self.target.origin().ascii_serialization()
    }

    /// Authorize a request addressed to this live chat binding.
    pub fn chat_request(&self, request: TransportRequest) -> Result<GgChatRequest> {
        if request.binding != self.binding
            || request.operation != TransportOperation::ChatCompletions
        {
            return Err(Error::new(ErrorKind::Conflict, "gg_authority_changed"));
        }
        let expires_at = u64::try_from(self.expires_at_ms)
            .ok()
            .and_then(|milliseconds| UNIX_EPOCH.checked_add(Duration::from_millis(milliseconds)))
            .ok_or_else(|| Error::new(ErrorKind::Unavailable, "gg_grant_invalid"))?;
        Ok(GgChatRequest {
            target: self.target.as_str().into(),
            authorization: self.authorization(&self.target)?,
            body: request.body,
            max_response_bytes: request.max_response_bytes,
            expires_at,
        })
    }

    fn target(&self) -> &Url {
        &self.target
    }

    pub(crate) fn binding(&self) -> &ProviderBinding {
        &self.binding
    }

    pub(crate) fn scope_fingerprint(&self) -> Fingerprint {
        self.scope
    }

    pub(crate) fn validate(&self) -> Result<()> {
        self.validate_at(now_ms()?)
    }

    fn authorization(&self, target: &Url) -> Result<HeaderValue> {
        if target != self.target() {
            return Err(Error::new(ErrorKind::Conflict, "gg_destination_changed"));
        }
        self.validate()?;
        Ok(self.header.clone())
    }

    fn validate_at(&self, now_ms: i64) -> Result<()> {
        if now_ms >= self.expires_at_ms {
            return Err(Error::new(ErrorKind::Unavailable, "gg_token_expired"));
        }
        Ok(())
    }
}

fn invalid_origin() -> Error {
    Error::new(ErrorKind::InvalidInput, "gg_origin_invalid")
}

fn now_ms() -> Result<i64> {
    let unavailable = || Error::new(ErrorKind::Unavailable, "gg_clock_unavailable");
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| unavailable())?;
    i64::try_from(elapsed.as_millis()).map_err(|_| unavailable())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn separates_current_authority_from_conversation_scope() {
        let connection = |origin, subject, org, token| {
            GgConnection::bind(origin, subject, org, i64::MAX, token).unwrap()
        };
        let original = connection(
            "https://api.example",
            "fixture-owner",
            7,
            "synthetic.gg.grant0",
        );
        let renewal = connection(
            "https://api.example",
            "fixture-owner",
            7,
            "synthetic.gg.grant1",
        );
        let other_org = connection(
            "https://api.example",
            "fixture-owner",
            8,
            "synthetic.gg.grant2",
        );
        let other_account = connection(
            "https://api.example",
            "other-owner",
            7,
            "synthetic.gg.grant3",
        );
        let other_origin = connection(
            "https://other.example",
            "fixture-owner",
            7,
            "synthetic.gg.grant4",
        );

        assert_eq!(original.scope_fingerprint(), renewal.scope_fingerprint());
        assert_eq!(
            original.binding().authority.principal,
            renewal.binding().authority.principal
        );
        assert_ne!(
            original.binding().authority.binding,
            renewal.binding().authority.binding
        );
        assert_ne!(original.scope_fingerprint(), other_org.scope_fingerprint());
        assert_ne!(
            original.scope_fingerprint(),
            other_account.scope_fingerprint()
        );
        assert_ne!(
            original.scope_fingerprint(),
            other_origin.scope_fingerprint()
        );
        assert_eq!(original.binding().provider.as_str(), "gg");
    }

    #[test]
    fn injects_a_sensitive_bearer_only_into_the_fixed_current_route() {
        let connection = GgConnection::bind(
            "https://api.example",
            "fixture-owner",
            7,
            i64::MAX,
            "synthetic.gg.grant",
        )
        .unwrap();
        assert_eq!(
            connection.target().as_str(),
            "https://api.example/api/v1/ai/chat/completions"
        );
        let header = connection.authorization(connection.target()).unwrap();
        assert!(header.is_sensitive());
        assert_eq!(header.to_str().unwrap(), "Bearer synthetic.gg.grant");
        assert!(!format!("{header:?}").contains("synthetic.gg.grant"));
        for target in [
            "https://api.example/api/v1/ai/operations",
            "https://other.example/api/v1/ai/chat/completions",
            "https://api.example/api/v1/ai/chat/completions?extra=value",
        ] {
            assert_eq!(
                connection
                    .authorization(&Url::parse(target).unwrap())
                    .unwrap_err()
                    .code,
                "gg_destination_changed"
            );
        }
        assert!(connection.validate_at(i64::MAX - 1).is_ok());
        assert_eq!(
            connection.validate_at(i64::MAX).unwrap_err().code,
            "gg_token_expired"
        );

        let expired = GgConnection::bind(
            "https://api.example",
            "fixture-owner",
            7,
            1,
            "synthetic.gg.expired",
        )
        .unwrap();
        assert_eq!(
            expired.authorization(expired.target()).unwrap_err().code,
            "gg_token_expired"
        );
    }

    #[test]
    fn authorizes_only_the_live_chat_operation() {
        let connection = GgConnection::bind(
            "https://api.example",
            "fixture-owner",
            7,
            i64::MAX,
            "synthetic.gg.grant",
        )
        .unwrap();
        let request = || TransportRequest {
            binding: connection.binding().clone(),
            operation: TransportOperation::ChatCompletions,
            body: b"{}".to_vec(),
            max_response_bytes: 4096,
        };
        let approved = connection.chat_request(request()).unwrap();
        assert_eq!(
            approved.target,
            "https://api.example/api/v1/ai/chat/completions"
        );
        assert!(approved.authorization.is_sensitive());
        assert_eq!(approved.body, b"{}");
        let mut changed = request();
        changed.operation = TransportOperation::OpenAiResponses;
        assert_eq!(
            connection.chat_request(changed).err().unwrap().code,
            "gg_authority_changed"
        );
        let mut changed = request();
        changed.binding.authority.binding = BindingId::new("stale").unwrap();
        assert_eq!(
            connection.chat_request(changed).err().unwrap().code,
            "gg_authority_changed"
        );
    }

    #[test]
    fn refuses_ambiguous_and_unapproved_origins_before_formatting_authority() {
        for origin in [
            "https://api.example/another",
            "https://api.example/?query=value",
            "https://api.example/#fragment",
            "https://user:pass@api.example",
            "http://api.example",
        ] {
            assert_eq!(
                GgConnection::bind(origin, "fixture-owner", 7, i64::MAX, "synthetic.gg.grant")
                    .err()
                    .unwrap()
                    .code,
                "gg_origin_invalid"
            );
        }
        let local = GgConnection::bind(
            "http://127.0.0.1:3041",
            "fixture-owner",
            7,
            i64::MAX,
            "synthetic.gg.grant",
        )
        .unwrap();
        assert_eq!(
            local.target().as_str(),
            "http://127.0.0.1:3041/api/v1/ai/chat/completions"
        );
    }
}
