//! GRIDA-SEC-006 / GRIDA-GG: token — invocation-scoped native GG chat authority.

use agent_kit_core::authority::AuthorityBinding;
use agent_kit_core::inference::{ProviderBinding, RequestControl};
use agent_kit_core::{
    BindingId, BoxFuture, CancellationToken, Error, ErrorKind, Fingerprint, PrincipalId,
    ProviderId, Result, ScopeId,
};
use agent_kit_providers::{
    StreamingTransport, TransportFailure, TransportOperation, TransportRequest, TransportResponse,
};
use grida_auth::{GgGrant, GgGrantScope};
use reqwest::Url;
use reqwest::header::{ACCEPT, CONTENT_TYPE, HeaderMap, HeaderValue};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::watch;
use tokio::time::{Instant, timeout_at};
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::SupervisedProvider;

const RENEWAL_MARGIN_MS: i64 = 30_000;
const FAILED_RENEWAL_COOLDOWN: Duration = Duration::from_secs(1);

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
    binding: ProviderBinding,
    scope: Fingerprint,
    credential: Arc<Mutex<Credential>>,
    renewal: Option<Arc<Renewal>>,
}

/// A private Desktop launch carries a verified scope label and delegates the
/// fixed request to its bearer owner without receiving a credential.
pub(crate) struct SupervisedGg {
    pub(crate) scope: Fingerprint,
    pub(crate) binding: ProviderBinding,
    target: Url,
    supervisor: SupervisedProvider,
}

impl SupervisedGg {
    pub(crate) fn new(endpoint: &str, scope: &str, supervisor: SupervisedProvider) -> Result<Self> {
        let mut target = Url::parse(endpoint).map_err(|_| invalid_origin())?;
        if target.host_str().is_none()
            || !target.username().is_empty()
            || target.password().is_some()
            || target.query().is_some()
            || target.fragment().is_some()
            || target.path() != "/api/v1/ai"
            || !(target.scheme() == "https"
                || (target.scheme() == "http"
                    && matches!(target.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))))
        {
            return Err(invalid_origin());
        }
        if scope.len() != 64
            || !scope
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            return Err(Error::new(ErrorKind::InvalidInput, "gg_scope_invalid"));
        }
        let scope = Fingerprint::of(&(
            "supervised-gg-chat-scope-v1",
            target.origin().ascii_serialization(),
            scope,
        ))?;
        target.set_path("/api/v1/ai/chat/completions");
        Ok(Self {
            scope,
            binding: gg_binding(scope)?,
            target,
            supervisor,
        })
    }

    pub(crate) fn validate(&self) -> Result<()> {
        self.supervisor.validate()
    }
}

impl StreamingTransport for SupervisedGg {
    fn send(
        &self,
        request: TransportRequest,
        control: RequestControl,
    ) -> BoxFuture<'_, std::result::Result<TransportResponse, TransportFailure>> {
        Box::pin(async move {
            if request.binding != self.binding
                || request.operation != TransportOperation::ChatCompletions
            {
                return Err(TransportFailure::Unavailable);
            }
            let mut headers = HeaderMap::new();
            headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
            headers.insert(ACCEPT, HeaderValue::from_static("text/event-stream"));
            self.supervisor
                .send(
                    self.target.clone(),
                    headers,
                    request.body,
                    request.max_response_bytes,
                    control,
                )
                .await
        })
    }
}

/// The account owner mints within the verified scope and completes any
/// in-flight custody transaction before returning. Closing cancels new
/// admission; accepted account custody follows its own bounded lifecycle.
pub trait GgGrantRenewal: Send + Sync {
    fn renew(
        &self,
        scope: GgGrantScope,
        closing: CancellationToken,
    ) -> BoxFuture<'_, Result<GgGrant>>;
}

struct Credential {
    header: HeaderValue,
    expires_at_ms: i64,
}

impl Credential {
    fn capture(token: &str, expires_at_ms: i64) -> Result<Self> {
        let bearer = Zeroizing::new(format!("Bearer {token}"));
        let mut header = HeaderValue::from_str(&bearer)
            .map_err(|_| Error::new(ErrorKind::Unavailable, "gg_grant_invalid"))?;
        header.set_sensitive(true);
        Ok(Self {
            header,
            expires_at_ms,
        })
    }

    fn validate_at(&self, now: i64) -> Result<()> {
        if now >= self.expires_at_ms {
            return Err(Error::new(ErrorKind::Unavailable, "gg_token_expired"));
        }
        Ok(())
    }
}

struct Renewal {
    scope: GgGrantScope,
    source: Arc<dyn GgGrantRenewal>,
    closing: CancellationToken,
    flight: Mutex<Option<Flight>>,
}

type Flight = watch::Receiver<Option<CompletedRenewal>>;

#[derive(Clone)]
struct CompletedRenewal {
    at: Instant,
    result: Result<()>,
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

    /// Keep this live binding across grant rotations within the verified
    /// account, origin, and organization captured at startup.
    pub fn from_renewable_grant(grant: &GgGrant, source: Arc<dyn GgGrantRenewal>) -> Result<Self> {
        let mut connection = Self::from_grant(grant)?;
        connection.renewal = Some(Arc::new(Renewal {
            scope: grant.scope().clone(),
            source,
            closing: CancellationToken::new(),
            flight: Mutex::new(None),
        }));
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
        Ok(Self {
            target,
            binding: gg_binding(scope)?,
            scope,
            credential: Arc::new(Mutex::new(Credential::capture(token, expires_at_ms)?)),
            renewal: None,
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
        let credential = self.authorized_credential(&self.target)?;
        let expires_at = u64::try_from(credential.expires_at_ms)
            .ok()
            .and_then(|milliseconds| UNIX_EPOCH.checked_add(Duration::from_millis(milliseconds)))
            .ok_or_else(|| Error::new(ErrorKind::Unavailable, "gg_grant_invalid"))?;
        Ok(GgChatRequest {
            target: self.target.as_str().into(),
            authorization: credential.header.clone(),
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

    fn authorized_credential(&self, target: &Url) -> Result<MutexGuard<'_, Credential>> {
        if target != self.target() {
            return Err(Error::new(ErrorKind::Conflict, "gg_destination_changed"));
        }
        if let Some(renewal) = &self.renewal {
            renewal.ensure_open()?;
        }
        let credential = locked(&self.credential)?;
        credential.validate_at(now_ms()?)?;
        Ok(credential)
    }

    fn validate_at(&self, now_ms: i64) -> Result<()> {
        locked(&self.credential)?.validate_at(now_ms)
    }

    /// Authorize the current live binding before starting a provider attempt.
    /// Dropping this waiter leaves the single accepted renewal owned by Host.
    pub(crate) async fn ensure_current(&self) -> Result<()> {
        let Some(renewal) = &self.renewal else {
            return self.validate();
        };
        let flight = {
            let mut active = locked(&renewal.flight)?;
            renewal.ensure_open()?;
            let expires_at_ms = locked(&self.credential)?.expires_at_ms;
            if expires_at_ms > now_ms()?.saturating_add(RENEWAL_MARGIN_MS) {
                return Ok(());
            }
            match active.as_ref() {
                Some(flight) if flight.borrow().is_none() => flight.clone(),
                Some(flight)
                    if flight.borrow().as_ref().is_some_and(|completed| {
                        completed.result.is_err()
                            && completed.at.elapsed() < FAILED_RENEWAL_COOLDOWN
                    }) =>
                {
                    flight.clone()
                }
                _ => {
                    let flight = renewal.start(Arc::clone(&self.credential));
                    *active = Some(flight.clone());
                    flight
                }
            }
        };
        completed(flight).await?.result
    }

    pub(crate) async fn shutdown(&self, deadline: Instant) -> Result<()> {
        let Some(renewal) = &self.renewal else {
            return Ok(());
        };
        self.close();
        let flight = locked(&renewal.flight)?.clone();
        if let Some(flight) = flight {
            let completion = timeout_at(deadline, completed(flight))
                .await
                .map_err(|_| unverified_renewal())??;
            if let Err(error) = completion.result
                && error.kind == ErrorKind::Uncertain
            {
                return Err(error);
            }
        }
        Ok(())
    }

    pub(crate) fn close(&self) {
        if let Some(renewal) = &self.renewal {
            renewal.closing.cancel();
        }
    }
}

fn gg_binding(scope: Fingerprint) -> Result<ProviderBinding> {
    let principal = Uuid::from_bytes(scope.bytes()[..16].try_into().expect("fingerprint prefix"));
    Ok(ProviderBinding {
        provider: ProviderId::new("gg")?,
        authority: AuthorityBinding {
            principal: PrincipalId::new(format!("gg:{principal}"))?,
            binding: BindingId::new(Uuid::new_v4().to_string())?,
            scope: ScopeId::new("gg-chat-completions")?,
        },
    })
}

impl Renewal {
    fn ensure_open(&self) -> Result<()> {
        if self.closing.is_cancelled() {
            return Err(Error::new(ErrorKind::Unavailable, "gg_authority_closed"));
        }
        Ok(())
    }

    fn start(self: &Arc<Self>, credential: Arc<Mutex<Credential>>) -> Flight {
        let renewal = Arc::clone(self);
        let (sender, receiver) = watch::channel(None);
        tokio::spawn(async move {
            let result = renewal.replace_credential(credential).await;
            // The account owner has finished its custody transaction before
            // the host can observe this completion.
            sender.send_replace(Some(CompletedRenewal {
                at: Instant::now(),
                result,
            }));
        });
        receiver
    }

    async fn replace_credential(&self, credential: Arc<Mutex<Credential>>) -> Result<()> {
        self.ensure_open()?;
        let grant = self
            .source
            .renew(self.scope.clone(), self.closing.clone())
            .await?;
        if grant.scope() != &self.scope {
            return Err(Error::new(ErrorKind::Conflict, "gg_scope_changed"));
        }
        let replacement = Credential::capture(grant.token(), grant.expires_at_ms())?;
        if replacement.expires_at_ms <= now_ms()?.saturating_add(RENEWAL_MARGIN_MS) {
            return Err(Error::new(
                ErrorKind::Unavailable,
                "gg_renewal_expiry_too_short",
            ));
        }
        self.ensure_open()?;
        *locked(&credential)? = replacement;
        Ok(())
    }
}

async fn completed(mut flight: Flight) -> Result<CompletedRenewal> {
    flight
        .wait_for(Option::is_some)
        .await
        .map_err(|_| unverified_renewal())
        .map(|value| value.clone().expect("renewal completion predicate"))
}

fn locked<T>(mutex: &Mutex<T>) -> Result<MutexGuard<'_, T>> {
    mutex.lock().map_err(|_| unverified_renewal())
}

fn unverified_renewal() -> Error {
    Error::new(ErrorKind::Uncertain, "gg_renewal_cleanup_unverified")
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
    fn desktop_scope_retains_identity_without_a_bearer() {
        let endpoint = "https://grida.example/api/v1/ai";
        let scope = "a".repeat(64);
        let capture = |endpoint: &str, scope: &str| {
            SupervisedGg::new(endpoint, scope, SupervisedProvider::default())
        };
        let first = capture(endpoint, &scope).unwrap();
        let restart = capture(endpoint, &scope).unwrap();
        let other = capture(endpoint, &"b".repeat(64)).unwrap();
        assert_eq!(first.scope, restart.scope);
        assert_eq!(
            first.binding.authority.principal,
            restart.binding.authority.principal
        );
        assert_ne!(
            first.binding.authority.binding,
            restart.binding.authority.binding
        );
        assert_ne!(
            first.binding.authority.principal,
            other.binding.authority.principal
        );
        assert_eq!(first.target.path(), "/api/v1/ai/chat/completions");
        assert!(first.validate().is_err());
        for invalid in [
            "https://grida.example/v1",
            "https://grida.example/api/v1/ai?forward=1",
            "http://grida.example/api/v1/ai",
        ] {
            assert!(capture(invalid, &scope).is_err());
        }
        assert!(capture(endpoint, "scope-label").is_err());
    }

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
        let header = connection
            .authorized_credential(connection.target())
            .unwrap()
            .header
            .clone();
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
                    .authorized_credential(&Url::parse(target).unwrap())
                    .err()
                    .unwrap()
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
            expired
                .authorized_credential(expired.target())
                .err()
                .unwrap()
                .code,
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
