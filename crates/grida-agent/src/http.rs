//! Host-owned HTTP dispatch for an explicitly selected compatible endpoint.

use agent_kit_core::authority::AuthorityBinding;
use agent_kit_core::inference::{InferenceControl, ProviderBinding};
use agent_kit_core::{
    BindingId, BoxFuture, Error, ErrorKind, Fingerprint, ModelId, PrincipalId, ProviderId, Result,
    ScopeId,
};
use agent_kit_providers::{
    StreamingTransport, TransportFailure, TransportRequest, TransportResponse,
};
use futures_util::StreamExt;
use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, HeaderValue, RETRY_AFTER};
use reqwest::{Client, Url};
use serde::Serialize;
use std::net::IpAddr;
use std::time::Duration;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Serialize)]
pub struct ProviderOptions {
    pub endpoint: String,
    pub model: ModelId,
    pub credential_env: Option<String>,
    pub max_output_tokens: u64,
}

pub struct HttpTransport {
    binding: ProviderBinding,
    target: Url,
    credential: Option<EnvironmentCredential>,
    client: Client,
}

struct EnvironmentCredential {
    name: String,
    generation: Fingerprint,
}

impl HttpTransport {
    pub fn new(options: &ProviderOptions) -> Result<Self> {
        let target = completion_url(&options.endpoint)?;
        let credential = options
            .credential_env
            .as_ref()
            .map(|name| EnvironmentCredential::capture(name.clone()))
            .transpose()?;
        let binding = ProviderBinding {
            provider: ProviderId::new("openai-compatible")?,
            authority: AuthorityBinding {
                principal: PrincipalId::new(if credential.is_some() {
                    "host-environment"
                } else {
                    "anonymous"
                })?,
                // Persist an opaque generation identity. The credential and
                // its digest remain in this host, outside the journal.
                binding: BindingId::new(uuid::Uuid::new_v4().to_string())?,
                scope: ScopeId::new("configured-provider")?,
            },
        };
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .retry(reqwest::retry::never())
            .pool_max_idle_per_host(0)
            .no_proxy()
            .http1_only()
            .http1_max_headers(64)
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(|_| problem("provider_http_client_unavailable"))?;
        Ok(Self {
            binding,
            target,
            credential,
            client,
        })
    }

    pub fn binding(&self) -> &ProviderBinding {
        &self.binding
    }

    pub fn validate_credential(&self) -> Result<()> {
        self.authorization().map(|_| ())
    }

    fn authorization(&self) -> Result<Option<HeaderValue>> {
        self.credential
            .as_ref()
            .map(EnvironmentCredential::read)
            .transpose()
    }
}

impl StreamingTransport for HttpTransport {
    fn send(
        &self,
        request: TransportRequest,
        control: InferenceControl,
    ) -> BoxFuture<'_, std::result::Result<TransportResponse, TransportFailure>> {
        Box::pin(async move {
            if request.binding != self.binding || request.path != "chat/completions" {
                return Err(TransportFailure::Unavailable);
            }
            if control.cancellation.is_cancelled()
                || control
                    .deadline
                    .is_some_and(|deadline| deadline <= std::time::Instant::now())
            {
                return Err(TransportFailure::Unavailable);
            }
            let mut outbound = self
                .client
                .post(self.target.clone())
                .header(CONTENT_TYPE, "application/json")
                .header(ACCEPT, "text/event-stream")
                .body(request.body);
            if let Some(value) = self
                .authorization()
                .map_err(|_| TransportFailure::Unavailable)?
            {
                outbound = outbound.header(AUTHORIZATION, value);
            }
            if let Some(deadline) = control.deadline {
                outbound =
                    outbound.timeout(deadline.saturating_duration_since(std::time::Instant::now()));
            }
            let response = tokio::select! {
                biased;
                _ = control.cancellation.cancelled() => return Err(TransportFailure::Interrupted),
                response = outbound.send() => response.map_err(|_| TransportFailure::Interrupted)?,
            };
            let status = response.status().as_u16();
            let request_id = response
                .headers()
                .get("x-request-id")
                .and_then(|value| value.to_str().ok())
                .filter(|value| {
                    value.len() <= 128
                        && value.bytes().all(|byte| {
                            byte.is_ascii_alphanumeric()
                                || matches!(byte, b'_' | b'-' | b'.' | b':')
                        })
                })
                .map(str::to_owned);
            let retry_after_ms = response
                .headers()
                .get(RETRY_AFTER)
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.parse::<u64>().ok())
                .and_then(|seconds| seconds.checked_mul(1000));
            let maximum = request.max_response_bytes;
            if response
                .content_length()
                .is_some_and(|size| size > maximum as u64)
            {
                return Err(TransportFailure::Interrupted);
            }
            let body = futures_util::stream::try_unfold(
                (
                    Box::pin(response.bytes_stream()),
                    0usize,
                    control.cancellation,
                ),
                move |(mut body, consumed, cancellation)| async move {
                    let chunk = tokio::select! {
                        _ = cancellation.cancelled() => return Err(TransportFailure::Interrupted),
                        chunk = body.next() => chunk,
                    };
                    let Some(chunk) = chunk else {
                        return Ok(None);
                    };
                    let chunk = chunk.map_err(|_| TransportFailure::Interrupted)?;
                    let consumed = consumed
                        .checked_add(chunk.len())
                        .filter(|total| *total <= maximum)
                        .ok_or(TransportFailure::Interrupted)?;
                    Ok(Some((chunk.to_vec(), (body, consumed, cancellation))))
                },
            )
            .boxed();
            Ok(TransportResponse {
                status,
                request_id,
                retry_after_ms,
                body,
            })
        })
    }
}

impl EnvironmentCredential {
    fn capture(name: String) -> Result<Self> {
        if name.is_empty()
            || name.len() > 128
            || !name
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
        {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "invalid_credential_environment_name",
            ));
        }
        let secret = credential_value(&name)?;
        let generation = Fingerprint::of(&secret)?;
        let credential = Self { name, generation };
        credential.read()?;
        Ok(credential)
    }

    fn read(&self) -> Result<HeaderValue> {
        let secret = credential_value(&self.name)?;
        if Fingerprint::of(&secret)? != self.generation {
            return Err(problem("provider_credential_changed"));
        }
        let mut value = HeaderValue::from_str(&format!("Bearer {secret}"))
            .map_err(|_| problem("provider_credential_invalid"))?;
        value.set_sensitive(true);
        Ok(value)
    }
}

fn credential_value(name: &str) -> Result<String> {
    std::env::var(name)
        .ok()
        .filter(|secret| !secret.is_empty() && secret.len() <= 4096)
        .ok_or_else(|| problem("provider_credential_unavailable"))
}

fn completion_url(endpoint: &str) -> Result<Url> {
    let invalid = || Error::new(ErrorKind::InvalidInput, "invalid_provider_endpoint");
    let mut url = Url::parse(endpoint).map_err(|_| invalid())?;
    if url.host().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(invalid());
    }
    let loopback = url
        .host_str()
        .and_then(|host| host.trim_matches(['[', ']']).parse::<IpAddr>().ok())
        .is_some_and(|address| address.is_loopback());
    if url.scheme() != "https" && !(url.scheme() == "http" && loopback) {
        return Err(invalid());
    }
    url.path_segments_mut()
        .map_err(|_| invalid())?
        .pop_if_empty()
        .extend(["chat", "completions"]);
    Ok(url)
}

fn problem(code: &'static str) -> Error {
    Error::new(ErrorKind::Unavailable, code)
}
