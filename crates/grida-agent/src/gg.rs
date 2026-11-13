//! GRIDA-SEC-006 / GRIDA-GG: token — invocation-scoped native GG chat authority.

use agent_client_protocol::JsonRpcResponse;
use agent_kit_core::authority::AuthorityBinding;
use agent_kit_core::inference::{
    DispatchEvidence, InferenceOutcome, ProviderBinding, RequestControl,
};
use agent_kit_core::turn::{OperationInput, OperationOutcome, OperationState, TurnState};
use agent_kit_core::{
    AttemptId, BindingId, BoxFuture, CancellationToken, ChangeId, Envelope, Error, ErrorKind,
    Fingerprint, ModelId, OperationId, PrincipalId, ProviderId, Result, SchemaId, ScopeId,
    SessionId,
};
use agent_kit_providers::{
    StreamingTransport, TerminalReceiptDecoder, TransportFailure, TransportOperation,
    TransportRequest, TransportResponse,
};
use agent_kit_sessions::InputDisposition;
use grida_auth::{GgGrant, GgGrantScope};
use reqwest::Url;
use reqwest::header::{ACCEPT, CONTENT_TYPE, HeaderMap, HeaderValue};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::watch;
use tokio::time::{Instant, timeout_at};
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::SupervisedProvider;

const RENEWAL_MARGIN_MS: i64 = 30_000;
const FAILED_RENEWAL_COOLDOWN: Duration = Duration::from_secs(1);
const BILLING_RECEIPT_SCHEMA: &str = "grida.gateway.billing-receipt";
const MAX_BILLING_RECEIPT_BYTES: usize = 512;
const MAX_SUMMARY_BILLING_ATTEMPTS: usize = 32;
const RETAINED_PNG_MODEL: &str = "openai/gpt-5.6-sol";
const RETAINED_PNG_TARGET: &str = "https://grida.co/api/v1/ai/chat/completions";

fn accepts_retained_png(target: &Url, model: &ModelId) -> bool {
    model.as_str() == RETAINED_PNG_MODEL
        && matches!(
            target.as_str(),
            RETAINED_PNG_TARGET | "http://localhost:3000/api/v1/ai/chat/completions"
        )
}

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
    pub(crate) scope: Fingerprint,
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

    pub(crate) fn accepts_retained_png(&self, model: &ModelId) -> bool {
        accepts_retained_png(&self.target, model)
    }

    /// Distinguish a missing attempt from an exact attempt without a dispatch ID.
    pub(crate) fn retained_attempt_request_id(
        &self,
        state: &TurnState,
        operation: &OperationId,
        attempt: &AttemptId,
    ) -> Option<Option<String>> {
        let operation = state.operations().get(operation)?;
        let attempt = operation.attempts.iter().find(|item| &item.id == attempt)?;
        Some(match &attempt.outcome {
            Some(OperationOutcome::Inference(outcome))
                if owns_retained_inference(&self.binding, operation) =>
            {
                attempt_request_id(outcome).map(str::to_owned)
            }
            _ => None,
        })
    }

    pub(crate) fn owns_retained_turn(&self, state: &TurnState) -> bool {
        state.operations().values().any(|operation| {
            !operation.attempts.is_empty() && owns_retained_inference(&self.binding, operation)
        })
    }

    pub(crate) fn retained_billing(&self, state: &TurnState) -> Option<GatewayBillingProjection> {
        retained_billing(&self.binding, self.scope, state, true)
    }

    pub(crate) fn send_capped<'a>(
        &'a self,
        request: TransportRequest,
        control: RequestControl,
        ceiling: &'a str,
    ) -> BoxFuture<'a, std::result::Result<TransportResponse, TransportFailure>> {
        Box::pin(async move {
            if request.binding != self.binding
                || request.operation != TransportOperation::ChatCompletions
                || !valid_decimal(ceiling)
            {
                return Err(TransportFailure::Unavailable);
            }
            let mut target = self.target.clone();
            target.set_path(&format!("{}/capped", self.target.path()));
            let mut headers = HeaderMap::new();
            headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
            headers.insert(ACCEPT, HeaderValue::from_static("text/event-stream"));
            headers.insert(
                "x-gg-max-cost-mills",
                HeaderValue::from_str(ceiling).map_err(|_| TransportFailure::Unavailable)?,
            );
            self.supervisor
                .send(
                    target,
                    headers,
                    request.body,
                    request.max_response_bytes,
                    control,
                    None,
                )
                .await
        })
    }
}

pub(crate) fn spending_receipt(
    scope: Fingerprint,
    receipt: &Envelope,
) -> Option<GatewayBillingRead> {
    let retained: RetainedGatewayBilling = serde_json::from_slice(receipt.bytes()).ok()?;
    retained_billing_receipt(scope, &retained.request_id, receipt)
}

fn owns_retained_inference(owner: &ProviderBinding, operation: &OperationState) -> bool {
    let OperationInput::Inference(request) = &operation.record.input else {
        return false;
    };
    let binding = request.binding();
    binding.provider == owner.provider
        && binding.authority == operation.record.grants.authority
        && binding.authority.principal == owner.authority.principal
        && binding.authority.scope == owner.authority.scope
}

fn retained_billing(
    owner: &ProviderBinding,
    scope: Fingerprint,
    state: &TurnState,
    allow_refresh: bool,
) -> Option<GatewayBillingProjection> {
    let mut attempts = Vec::new();
    let mut omitted_attempts = 0;
    // The operation map and each operation's attempt order are retained.
    for operation in state
        .operations()
        .values()
        .filter(|operation| owns_retained_inference(owner, operation))
    {
        for attempt in &operation.attempts {
            if attempts.len() >= MAX_SUMMARY_BILLING_ATTEMPTS {
                omitted_attempts += 1;
                continue;
            }
            let retained = match &attempt.outcome {
                Some(OperationOutcome::Inference(outcome)) => {
                    attempt_request_id(outcome).map(|id| (id, outcome))
                }
                _ => None,
            };
            let billing = retained
                .and_then(|(id, outcome)| {
                    retained_billing_receipt(scope, id, outcome.terminal_receipt.as_ref()?)
                })
                .unwrap_or(GatewayBillingRead::Unavailable);
            attempts.push(GatewayBillingAttempt {
                operation_id: operation.record.id.clone(),
                attempt_id: attempt.id.clone(),
                refreshable: allow_refresh
                    && retained.is_some()
                    && !matches!(billing, GatewayBillingRead::Settled { .. }),
                billing,
            });
        }
    }
    (!attempts.is_empty()).then_some(GatewayBillingProjection {
        attempts,
        omitted_attempts,
    })
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
                    None,
                )
                .await
        })
    }

    fn terminal_receipt_decoder(&self) -> Option<Arc<TerminalReceiptDecoder>> {
        Some(terminal_receipt_decoder(self.scope))
    }
}

fn terminal_receipt_decoder(scope: Fingerprint) -> Arc<TerminalReceiptDecoder> {
    Arc::new(move |request, frame| gateway_billing_receipt(scope, request, frame))
}

#[derive(Deserialize)]
struct GatewayBillingFrame {
    grida_billing: GatewayBillingObservation,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct GatewayBillingObservation {
    version: u32,
    request_id: String,
    status: GatewayBillingStatus,
    charged_mills: serde_json::Value,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum GatewayBillingStatus {
    Pending,
    Settled,
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonRpcResponse)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub(crate) enum GatewayBillingRead {
    Pending,
    Settled { charged_mills: String },
    Unavailable,
}

impl GatewayBillingRead {
    pub(crate) fn checked(self) -> Self {
        match &self {
            Self::Settled { charged_mills } if !valid_decimal(charged_mills) => Self::Unavailable,
            _ => self,
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GatewayBillingProjection {
    attempts: Vec<GatewayBillingAttempt>,
    omitted_attempts: usize,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct GatewayTurnBilling {
    #[serde(flatten)]
    direct: GatewayBillingProjection,
    #[serde(skip_serializing_if = "Option::is_none")]
    review: Option<GatewayBillingProjection>,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<GatewayChildBillingPage>,
}

impl GatewayTurnBilling {
    pub(crate) fn new(
        direct: GatewayBillingProjection,
        review: Option<GatewayBillingProjection>,
    ) -> Self {
        let review = review.filter(|review| {
            !review.attempts.iter().any(|child| {
                direct.attempts.iter().any(|parent| {
                    child.operation_id == parent.operation_id
                        && child.attempt_id == parent.attempt_id
                })
            })
        });
        Self {
            direct,
            review,
            children: None,
        }
    }

    pub(crate) fn with_children(mut self, children: Option<GatewayChildBillingPage>) -> Self {
        self.children = children;
        self
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct GatewayChildBillingRef {
    pub(crate) child_id: SessionId,
    pub(crate) input_id: ChangeId,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GatewayChildBillingPage {
    pub(crate) assignments: Vec<GatewayChildBilling>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) next_after: Option<GatewayChildBillingRef>,
    pub(crate) coverage_incomplete: bool,
}

impl GatewayChildBillingPage {
    pub(crate) fn with_read_coverage(
        page: Result<Option<Self>>,
        after: bool,
    ) -> Result<Option<Self>> {
        match page {
            Err(_) if !after => Ok(Some(Self {
                coverage_incomplete: true,
                ..Self::default()
            })),
            page => page,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GatewayChildBilling {
    pub(crate) child_id: SessionId,
    pub(crate) input_id: ChangeId,
    pub(crate) name: String,
    pub(crate) disposition: InputDisposition,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) billing: Option<GatewayBillingProjection>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct GatewayBillingAttempt {
    operation_id: OperationId,
    attempt_id: AttemptId,
    refreshable: bool,
    #[serde(flatten)]
    billing: GatewayBillingRead,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RetainedGatewayBilling {
    scope: Fingerprint,
    request_id: String,
    status: GatewayBillingStatus,
    charged_mills: serde_json::Value,
}

fn retained_billing_receipt(
    scope: Fingerprint,
    id: &str,
    receipt: &Envelope,
) -> Option<GatewayBillingRead> {
    if receipt.schema().as_str() != BILLING_RECEIPT_SCHEMA
        || receipt.version() != 1
        || receipt.bytes().len() > MAX_BILLING_RECEIPT_BYTES
    {
        return None;
    }
    let record: RetainedGatewayBilling = serde_json::from_slice(receipt.bytes()).ok()?;
    if record.scope != scope || record.request_id != id {
        return None;
    }
    match (record.status, record.charged_mills) {
        (GatewayBillingStatus::Pending, serde_json::Value::Null) => {
            Some(GatewayBillingRead::Pending)
        }
        (GatewayBillingStatus::Settled, serde_json::Value::String(charged_mills))
            if valid_decimal(&charged_mills) =>
        {
            Some(GatewayBillingRead::Settled { charged_mills })
        }
        _ => None,
    }
}

fn gateway_billing_receipt(
    scope: Fingerprint,
    request: &Envelope,
    frame: &[u8],
) -> Option<Envelope> {
    let request_id = gateway_request_id(request)?;
    let observation = serde_json::from_slice::<GatewayBillingFrame>(frame)
        .ok()?
        .grida_billing;
    if observation.version != 1 || observation.request_id != request_id {
        return None;
    }
    let amount = match (&observation.status, &observation.charged_mills) {
        (GatewayBillingStatus::Pending, serde_json::Value::Null) => None,
        (GatewayBillingStatus::Settled, serde_json::Value::String(value))
            if valid_decimal(value) =>
        {
            Some(value)
        }
        _ => return None,
    };
    Envelope::new(
        SchemaId::new(BILLING_RECEIPT_SCHEMA).ok()?,
        1,
        serde_json::to_vec(&serde_json::json!({
            "scope": scope,
            "request_id": request_id,
            "status": observation.status,
            "charged_mills": amount,
        }))
        .ok()?,
    )
    .ok()
}

fn attempt_request_id(outcome: &InferenceOutcome) -> Option<&str> {
    if outcome
        .failure
        .as_ref()
        .and_then(|failure| failure.dispatch)
        == Some(DispatchEvidence::RejectedBeforeExecution)
    {
        return None;
    }
    gateway_request_id(outcome.receipt.as_ref()?)
}

fn gateway_request_id(request: &Envelope) -> Option<&str> {
    if request.schema().as_str() != "http.request-id" || request.version() != 1 {
        return None;
    }
    let request_id = std::str::from_utf8(request.bytes()).ok()?;
    let suffix = request_id.strip_prefix("req_")?;
    if suffix.is_empty()
        || suffix.len() > 124
        || !suffix
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
    {
        return None;
    }
    Some(request_id)
}

fn valid_decimal(value: &str) -> bool {
    fn digits(value: &str) -> bool {
        !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit())
    }
    value.len() <= 64
        && value.split_once('.').map_or_else(
            || digits(value),
            |(whole, part)| digits(whole) && digits(part),
        )
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

    pub(crate) fn accepts_retained_png(&self, model: &ModelId) -> bool {
        accepts_retained_png(self.target(), model)
    }

    /// Decode billing evidence carried by the fixed chat response for this scope.
    pub fn terminal_receipt_decoder(&self) -> Arc<TerminalReceiptDecoder> {
        terminal_receipt_decoder(self.scope)
    }

    pub(crate) fn retained_billing(&self, state: &TurnState) -> Option<GatewayBillingProjection> {
        retained_billing(&self.binding, self.scope, state, false)
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
    fn unavailable_child_page_preserves_the_direct_and_funded_billing() {
        let base = GatewayTurnBilling::new(Default::default(), Some(Default::default()));
        let before = serde_json::to_value(&base).unwrap();
        let failure = Error::new(ErrorKind::Unavailable, "turn_snapshot_unavailable");
        let partial =
            GatewayChildBillingPage::with_read_coverage(Err(failure.clone()), false).unwrap();
        let after = serde_json::to_value(base.with_children(partial)).unwrap();
        for key in ["attempts", "omittedAttempts", "review"] {
            assert_eq!(after[key], before[key]);
        }
        assert_eq!(
            after["children"],
            serde_json::json!({"assignments":[],"coverageIncomplete":true})
        );
        assert_eq!(
            GatewayChildBillingPage::with_read_coverage(Err(failure.clone()), true).unwrap_err(),
            failure
        );
    }

    #[test]
    fn selected_gateway_png_requires_the_product_or_local_editor_route() {
        let model = ModelId::new(RETAINED_PNG_MODEL).unwrap();
        for (origin, direct, supervised) in [
            ("https://grida.co", true, true),
            ("http://localhost:3000", false, true),
            ("http://127.0.0.1:3000", false, false),
            ("http://localhost:3001", false, false),
            ("https://grida.co:444", false, false),
            ("https://other.example", false, false),
        ] {
            assert_eq!(
                GgConnection::bind(origin, "fixture-owner", 7, i64::MAX, "synthetic.gg.grant")
                    .is_ok_and(|connection| connection.accepts_retained_png(&model)),
                direct,
                "{origin}"
            );
            let endpoint = format!("{origin}/api/v1/ai");
            let connection =
                SupervisedGg::new(&endpoint, &"a".repeat(64), SupervisedProvider::default())
                    .unwrap();
            assert_eq!(
                connection.accepts_retained_png(&model),
                supervised,
                "{origin}"
            );
        }
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    #[tokio::test]
    async fn selected_gateway_png_stays_on_the_exact_chat_connection() {
        use crate::host::{GgOptions, Host, ImageUpload, PromptPart, PromptRequest, RunResult};
        use agent_kit_core::messages::OutcomeStatus;
        use base64::{Engine, engine::general_purpose::STANDARD};
        use futures_util::StreamExt;
        use grida_agent_master::read_account;
        use serde_json::{Value, json};
        use std::fs;

        struct ChatFixture {
            connection: Arc<GgConnection>,
            requests: Arc<Mutex<Vec<Value>>>,
        }

        impl StreamingTransport for ChatFixture {
            fn send(
                &self,
                request: TransportRequest,
                _control: RequestControl,
            ) -> BoxFuture<'_, std::result::Result<TransportResponse, TransportFailure>>
            {
                Box::pin(async move {
                    let request = self.connection.chat_request(request).unwrap();
                    assert_eq!(request.target, RETAINED_PNG_TARGET);
                    assert_eq!(request.authorization, "Bearer synthetic.gg.grant");
                    self.requests
                        .lock()
                        .unwrap()
                        .push(serde_json::from_slice(&request.body).unwrap());
                    Ok(TransportResponse {
                        status: 200,
                        request_id: None,
                        retry_after_ms: None,
                        body: futures_util::stream::iter([Ok(concat!(
                            "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Seen.\"},",
                            "\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n"
                        )
                        .as_bytes()
                        .to_vec())])
                        .boxed(),
                    })
                })
            }
        }

        const PNG: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPg/88AAAIvAQ+3s0AMAAAAAElFTkSuQmCC";
        let temporary = tempfile::tempdir().unwrap();
        let state = temporary.path().join("state");
        let workspace = temporary.path().join("workspace");
        fs::create_dir(&workspace).unwrap();
        let selected = workspace.join("selected.png");
        let bytes = STANDARD.decode(PNG).unwrap();
        fs::write(&selected, &bytes).unwrap();
        let requests = Arc::new(Mutex::new(Vec::new()));
        let open = |origin, model, account, organization| {
            let connection = Arc::new(
                GgConnection::bind(
                    origin,
                    account,
                    organization,
                    i64::MAX,
                    "synthetic.gg.grant",
                )
                .unwrap(),
            );
            Host::open_gg(
                &state,
                GgOptions {
                    model: ModelId::new(model).unwrap(),
                    max_output_tokens: 1024,
                },
                connection.clone(),
                Arc::new(ChatFixture {
                    connection,
                    requests: requests.clone(),
                }),
            )
            .unwrap()
        };
        let request = |session, parts| PromptRequest {
            id: crate::host::change_id().unwrap(),
            session,
            parts,
            questions: false,
            operating_regime: None,
            effort: None,
            reasoning: Default::default(),
        };
        let png = || PromptPart::Image {
            image: ImageUpload::read_selected_png(&selected).unwrap(),
        };
        let text = || PromptPart::Text {
            text: "Describe the selected image.".into(),
        };

        for (origin, model) in [
            ("https://grida.co", "openai/gpt-5.6-terra"),
            ("https://elsewhere.example", RETAINED_PNG_MODEL),
        ] {
            let host = open(origin, model, "fixture-account", 7);
            assert!(!host.accepts_images());
            let session = host.new_session(workspace.clone()).await.unwrap();
            let error = host
                .start_prompt(request(session, vec![text(), png()]))
                .await
                .err()
                .unwrap();
            assert_eq!(error.code, "image_input_unavailable");
            host.shutdown().await.unwrap();
        }
        assert!(requests.lock().unwrap().is_empty());
        assert!(!state.join("retained-inputs").exists());

        let host = open("https://grida.co", RETAINED_PNG_MODEL, "fixture-account", 7);
        assert!(host.accepts_images());
        let session = host.new_session(workspace.clone()).await.unwrap();
        let sent = host
            .start_prompt(request(session.clone(), vec![text(), png()]))
            .await
            .unwrap();
        let RunResult::Settled(first) = sent.completion.await.unwrap().unwrap() else {
            panic!("expected selected PNG to settle");
        };
        assert_eq!(first.status, OutcomeStatus::Succeeded);
        host.shutdown().await.unwrap();
        drop(host);

        for (account, organization) in [("different-account", 7), ("fixture-account", 8)] {
            let host = open(
                "https://grida.co",
                RETAINED_PNG_MODEL,
                account,
                organization,
            );
            let error = host
                .start_prompt(request(session.clone(), vec![text()]))
                .await
                .err()
                .unwrap();
            assert_eq!(error.code, "session_execution_configuration_changed");
            host.shutdown().await.unwrap();
        }
        assert_eq!(requests.lock().unwrap().len(), 1);

        // The source path is independent of the image already accepted in chat.
        fs::write(&selected, b"changed source").unwrap();
        let host = open("https://grida.co", RETAINED_PNG_MODEL, "fixture-account", 7);
        let sent = host
            .start_prompt(request(session.clone(), vec![text()]))
            .await
            .unwrap();
        let RunResult::Settled(followup) = sent.completion.await.unwrap().unwrap() else {
            panic!("expected selected PNG history to settle");
        };
        assert_eq!(followup.status, OutcomeStatus::Succeeded);
        host.shutdown().await.unwrap();
        drop(host);
        {
            let requests = requests.lock().unwrap();
            assert_eq!(requests.len(), 2);
            for body in requests.iter() {
                assert_eq!(body["model"], RETAINED_PNG_MODEL);
                assert!(body["tools"].is_null());
                assert_eq!(
                    body["messages"][1]["content"][1],
                    json!({
                        "type":"image_url", "image_url":{"url":format!("data:image/png;base64,{PNG}")}
                    })
                );
            }
        }

        let retained = fs::read_dir(state.join("retained-inputs"))
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .find(|path| path.is_dir())
            .unwrap()
            .join("sources");
        let original = fs::read_dir(retained)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .find(|path| {
                path.extension()
                    .is_some_and(|extension| extension == "asset")
            })
            .unwrap();
        for missing in [false, true] {
            if missing {
                fs::remove_file(&original).unwrap();
            } else {
                fs::write(&original, vec![0; bytes.len()]).unwrap();
            }
            let host = open("https://grida.co", RETAINED_PNG_MODEL, "fixture-account", 7);
            let sent = host
                .start_prompt(request(session.clone(), vec![text()]))
                .await
                .unwrap();
            let RunResult::Settled(blocked) = sent.completion.await.unwrap().unwrap() else {
                panic!("expected unavailable retained bytes to stop the turn");
            };
            assert_eq!(blocked.status, OutcomeStatus::Failed);
            let account = read_account(blocked.account.as_ref().unwrap()).unwrap();
            assert_eq!(
                account.inference_failure.unwrap().code,
                "retained_image_unavailable"
            );
            assert_eq!(requests.lock().unwrap().len(), 2);
            host.shutdown().await.unwrap();
        }
    }

    #[test]
    fn projects_exact_scoped_billing_and_bounded_attempts() {
        use agent_kit_core::authority::GrantSelection;
        use agent_kit_core::inference::{
            InferenceRequest, InferenceStatus, ModelCapabilities, PreparedRequest,
        };
        use agent_kit_core::turn::{JournalAction, JournalChange, OperationRecord, TurnBinding};
        use agent_kit_core::{ChangeId, ModelId, SessionId, TurnId};
        use serde_json::json;

        let open = |scope: char| {
            SupervisedGg::new(
                "https://grida.example/api/v1/ai",
                &scope.to_string().repeat(64),
                SupervisedProvider::default(),
            )
            .unwrap()
        };
        let original = open('a');
        let reopened = open('a');
        let foreign = open('b');
        let turn = TurnBinding {
            session: SessionId::new("session").unwrap(),
            turn: TurnId::new("turn").unwrap(),
            epoch: 1,
        };
        let mut state = TurnState::new(turn.clone()).unwrap();
        let dispatch = |id: &str| {
            Envelope::new(
                SchemaId::new("http.request-id").unwrap(),
                1,
                id.as_bytes().to_vec(),
            )
            .unwrap()
        };
        let terminal = |id: &str, status: &str, amount: serde_json::Value| {
            gateway_billing_receipt(original.scope, &dispatch(id), &serde_json::to_vec(&json!({
                "grida_billing":{"version":1,"request_id":id,"status":status,"charged_mills":amount}
            })).unwrap()).unwrap()
        };
        let mut add = |index: usize, gateway: &SupervisedGg, receipt, terminal_receipt| {
            let operation = OperationId::new(format!("operation-{index:02}")).unwrap();
            let attempt = AttemptId::new(format!("attempt-{index:02}")).unwrap();
            let request = PreparedRequest::from_validated(
                InferenceRequest {
                    model: ModelId::new("fixture").unwrap(),
                    messages: vec![],
                    tools: vec![],
                    max_output_tokens: None,
                    extension: None,
                    reasoning: Default::default(),
                },
                gateway.binding.clone(),
                ModelCapabilities {
                    revision: BindingId::new("fixture").unwrap(),
                    input_modalities: Default::default(),
                    json_tools: false,
                    text_tools: false,
                    max_output_tokens: None,
                    reasoning: Default::default(),
                },
            )
            .unwrap();
            let actions = vec![
                JournalAction::prepare(OperationRecord {
                    id: operation.clone(),
                    input: OperationInput::Inference(request),
                    grants: GrantSelection {
                        authority: gateway.binding.authority.clone(),
                        grants: vec![],
                    },
                    origin: None,
                    source_call: None,
                }),
                JournalAction::StartAttempt {
                    operation: operation.clone(),
                    attempt: attempt.clone(),
                },
                JournalAction::CompleteAttempt {
                    operation,
                    attempt,
                    outcome: OperationOutcome::Inference(InferenceOutcome {
                        status: InferenceStatus::Completed,
                        messages: vec![],
                        usage: vec![],
                        failure: None,
                        receipt,
                        terminal_receipt,
                    }),
                },
            ];
            state
                .apply(
                    JournalChange::new(
                        ChangeId::new(format!("record-{index}")).unwrap(),
                        turn.clone(),
                        state.position(),
                        state.controls().revision,
                        actions,
                    )
                    .unwrap(),
                )
                .unwrap();
        };
        add(
            0,
            &original,
            Some(dispatch("req_exact")),
            Some(terminal("req_exact", "settled", json!("0"))),
        );
        add(
            1,
            &original,
            Some(dispatch("req_pending")),
            Some(terminal("req_pending", "pending", json!(null))),
        );
        add(2, &original, Some(dispatch("req_unknown")), None);
        add(3, &original, None, None);
        add(
            4,
            &original,
            Some(dispatch("req_mismatch")),
            Some(terminal("req_other", "settled", json!("7"))),
        );
        for index in 5..34 {
            add(index, &original, None, None);
        }
        add(34, &foreign, None, None);

        let projection = serde_json::to_value(reopened.retained_billing(&state).unwrap()).unwrap();
        let attempts = projection["attempts"].as_array().unwrap();
        assert_eq!(attempts.len(), 32);
        assert_eq!(projection["omittedAttempts"], 2);
        assert_eq!(
            attempts[0],
            json!({"operationId":"operation-00","attemptId":"attempt-00","kind":"settled","chargedMills":"0","refreshable":false})
        );
        assert_eq!(
            attempts[1],
            json!({"operationId":"operation-01","attemptId":"attempt-01","kind":"pending","refreshable":true})
        );
        assert_eq!(
            attempts[2],
            json!({"operationId":"operation-02","attemptId":"attempt-02","kind":"unavailable","refreshable":true})
        );
        assert_eq!(
            attempts[3],
            json!({"operationId":"operation-03","attemptId":"attempt-03","kind":"unavailable","refreshable":false})
        );
        assert_eq!(
            attempts[4],
            json!({"operationId":"operation-04","attemptId":"attempt-04","kind":"unavailable","refreshable":true})
        );
        assert_eq!(foreign.retained_billing(&state).unwrap().attempts.len(), 1);
        assert!(open('c').retained_billing(&state).is_none());
        let direct: GatewayBillingProjection = serde_json::from_value(projection.clone()).unwrap();
        assert_eq!(
            serde_json::to_value(GatewayTurnBilling::new(direct.clone(), None)).unwrap(),
            projection
        );
        let mut review = direct.clone();
        review.attempts.truncate(1);
        review.omitted_attempts = 0;
        assert_eq!(
            serde_json::to_value(GatewayTurnBilling::new(
                direct.clone(),
                Some(review.clone())
            ))
            .unwrap(),
            projection
        );
        review.attempts[0].operation_id = OperationId::new("review-operation").unwrap();
        review.attempts[0].attempt_id = AttemptId::new("review-attempt").unwrap();
        let combined = serde_json::to_value(GatewayTurnBilling::new(direct, Some(review))).unwrap();
        assert_eq!(combined["attempts"], projection["attempts"]);
        assert_eq!(
            combined["review"],
            json!({"attempts":[{"operationId":"review-operation","attemptId":"review-attempt","kind":"settled","chargedMills":"0","refreshable":false}],"omittedAttempts":0})
        );
        serde_json::from_value::<GatewayTurnBilling>(combined).unwrap();
    }

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
