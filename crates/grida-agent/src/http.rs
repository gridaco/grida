//! GRIDA-SEC-014 — host-owned dispatch for explicitly selected provider endpoints.

use crate::custody::{CapturedCredential, CredentialFormat, CredentialSource};
use crate::supervised_provider::SupervisedProvider;

use agent_kit_core::authority::AuthorityBinding;
use agent_kit_core::inference::{ProviderBinding, RequestControl};
use agent_kit_core::{
    BindingId, BoxFuture, Error, ErrorKind, Fingerprint, ModelId, PrincipalId, ProviderId, Result,
    ScopeId,
};
use agent_kit_providers::{
    StreamingTransport, TransportFailure, TransportOperation, TransportRequest, TransportResponse,
};
use futures_util::StreamExt;
use reqwest::header::{
    ACCEPT, AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderName, HeaderValue, RETRY_AFTER,
};
use reqwest::{Client, Url};
use serde::Serialize;
use std::collections::BTreeMap;
use std::net::{IpAddr, SocketAddr};
use std::num::NonZeroU64;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::Duration;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProviderProtocol {
    #[default]
    OpenAiCompatible,
    Responses,
    Anthropic,
    Gemini,
}

impl ProviderProtocol {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::OpenAiCompatible => "openai-compatible",
            Self::Responses => "responses",
            Self::Anthropic => "anthropic",
            Self::Gemini => "gemini",
        }
    }

    fn is_compatible(&self) -> bool {
        *self == Self::OpenAiCompatible
    }
}

impl std::str::FromStr for ProviderProtocol {
    type Err = Error;

    fn from_str(value: &str) -> Result<Self> {
        match value {
            "openai-compatible" => Ok(Self::OpenAiCompatible),
            "responses" => Ok(Self::Responses),
            "anthropic" => Ok(Self::Anthropic),
            "gemini" => Ok(Self::Gemini),
            _ => Err(invalid("unknown_provider_protocol")),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CompatibleOutputLimitField {
    MaxCompletionTokens,
    MaxTokens,
}

#[derive(Serialize)]
pub struct ProviderOptions {
    pub endpoint: String,
    pub model: ModelId,
    pub credential_env: Option<String>,
    pub max_output_tokens: u64,
    // Preserve the launch fingerprint of existing compatible sessions.
    #[serde(skip_serializing_if = "ProviderProtocol::is_compatible")]
    pub protocol: ProviderProtocol,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credential_home: Option<PathBuf>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compatible_output_limit_field: Option<CompatibleOutputLimitField>,
}

pub struct HttpTransport {
    binding: ProviderBinding,
    protocol: ProviderProtocol,
    operation: TransportOperation,
    target: Url,
    credential: Option<CapturedCredential>,
    replay_binding: Option<BindingId>,
    selection: Fingerprint,
    dispatch: Dispatch,
}

enum Dispatch {
    Direct(Client),
    Supervised(SupervisedProvider),
}

impl HttpTransport {
    pub fn new(
        state_dir: &Path,
        options: &ProviderOptions,
        supervised: Option<SupervisedProvider>,
    ) -> Result<Self> {
        if !options.protocol.is_compatible() && options.compatible_output_limit_field.is_some() {
            return Err(invalid(
                "compatible_output_limit_field_requires_compatible_provider",
            ));
        }
        let base = provider_base(&options.endpoint)?;
        let (target, operation) = provider_route(base.clone(), options.protocol, &options.model)?;
        let source = credential_source(options, &base)?;
        let source_identity = match &source {
            Some(CredentialSource::Environment { name }) => {
                serde_json::json!(["environment", name])
            }
            Some(CredentialSource::Stored { home, provider }) => {
                serde_json::json!(["stored", home, provider])
            }
            None => serde_json::json!(["anonymous"]),
        };
        let provider = options.protocol.as_str();
        let lineage = Fingerprint::of(&(
            "provider-lineage-v1",
            provider,
            base.as_str().strip_suffix('/').unwrap_or(base.as_str()),
            source_identity,
        ))?;
        let selection = match options.compatible_output_limit_field {
            Some(CompatibleOutputLimitField::MaxTokens) => {
                Fingerprint::of(&(lineage, &options.model, "max_tokens"))?
            }
            Some(CompatibleOutputLimitField::MaxCompletionTokens) | None => {
                Fingerprint::of(&(lineage, &options.model))?
            }
        };
        let credential = source.map(CapturedCredential::capture).transpose()?;
        let source = credential
            .as_ref()
            .map_or("anonymous", CapturedCredential::source_kind);
        let scope = uuid::Uuid::from_bytes(
            lineage.bytes()[..16]
                .try_into()
                .expect("fingerprint prefix"),
        );
        let continuity = match &credential {
            None => BindingId::new(scope.to_string())?,
            Some(credential)
                if cfg!(any(target_os = "linux", target_os = "macos"))
                    || options.protocol == ProviderProtocol::Gemini =>
            {
                let state_dir = state_dir
                    .canonicalize()
                    .map_err(|_| problem("state_directory_unavailable"))?;
                credential.replay_binding(&state_dir, lineage)?
            }
            // On a platform without protected continuity storage, a fresh
            // environment credential can still authorize this host's work.
            Some(_) => BindingId::new(uuid::Uuid::new_v4().to_string())?,
        };
        let binding = ProviderBinding {
            provider: ProviderId::new(provider)?,
            authority: AuthorityBinding {
                principal: PrincipalId::new(format!("{provider}/{source}/{continuity}"))?,
                binding: BindingId::new(uuid::Uuid::new_v4().to_string())?,
                scope: ScopeId::new(format!("provider/{scope}"))?,
            },
        };
        let replay_binding = matches!(
            options.protocol,
            ProviderProtocol::Gemini | ProviderProtocol::Responses
        )
        .then_some(continuity);
        let dispatch = match supervised {
            Some(supervised) => Dispatch::Supervised(supervised),
            None => Dispatch::Direct(direct_client(&base)?),
        };
        Ok(Self {
            binding,
            protocol: options.protocol,
            operation,
            target,
            credential,
            replay_binding,
            selection,
            dispatch,
        })
    }

    pub fn binding(&self) -> &ProviderBinding {
        &self.binding
    }

    pub fn selection(&self) -> Fingerprint {
        self.selection
    }

    pub fn replay_binding(&self) -> Option<&BindingId> {
        self.replay_binding.as_ref()
    }

    pub(crate) fn supports_exact_input_counting(&self) -> bool {
        self.protocol == ProviderProtocol::Responses
    }

    pub(crate) fn verified_context_window(&self, model: &ModelId) -> Option<NonZeroU64> {
        if !self.supports_exact_input_counting() {
            return None;
        }
        responses_context_window(&self.target, model)
    }

    pub async fn validate_credential(&self) -> Result<()> {
        if let Some(credential) = &self.credential {
            credential.validate().await?;
        }
        Ok(())
    }

    fn request_target(
        &self,
        operation: &TransportOperation,
    ) -> std::result::Result<Url, TransportFailure> {
        if operation == &self.operation {
            return Ok(self.target.clone());
        }
        if self.supports_exact_input_counting()
            && operation == &TransportOperation::OpenAiResponsesInputTokens
        {
            let mut target = self.target.clone();
            target
                .path_segments_mut()
                .map_err(|_| TransportFailure::Unavailable)?
                .push("input_tokens");
            return Ok(target);
        }
        Err(TransportFailure::Unavailable)
    }
}

fn responses_context_window(target: &Url, model: &ModelId) -> Option<NonZeroU64> {
    if target.as_str() != "https://api.openai.com/v1/responses" {
        return None;
    }
    #[derive(serde::Deserialize)]
    struct Facts {
        windows: BTreeMap<String, NonZeroU64>,
    }
    static FACTS: OnceLock<Facts> = OnceLock::new();
    let facts = FACTS.get_or_init(|| {
        serde_json::from_str(include_str!("../data/responses-context-windows.json"))
            .expect("generated model context facts")
    });
    facts.windows.get(model.as_str()).copied()
}

impl StreamingTransport for HttpTransport {
    fn send(
        &self,
        request: TransportRequest,
        control: RequestControl,
    ) -> BoxFuture<'_, std::result::Result<TransportResponse, TransportFailure>> {
        Box::pin(async move {
            if request.binding != self.binding {
                return Err(TransportFailure::Unavailable);
            }
            let target = self.request_target(&request.operation)?;
            if control.cancellation.is_cancelled()
                || control
                    .deadline
                    .is_some_and(|deadline| deadline <= std::time::Instant::now())
            {
                return Err(TransportFailure::Unavailable);
            }
            let mut headers = HeaderMap::new();
            headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
            headers.insert(
                ACCEPT,
                HeaderValue::from_static(match request.operation {
                    TransportOperation::OpenAiResponsesInputTokens => "application/json",
                    _ => "text/event-stream",
                }),
            );
            if self.protocol == ProviderProtocol::Anthropic {
                headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
            }
            if let Some(credential) = &self.credential {
                let (name, format) = match self.protocol {
                    ProviderProtocol::OpenAiCompatible | ProviderProtocol::Responses => {
                        (AUTHORIZATION, CredentialFormat::Bearer)
                    }
                    ProviderProtocol::Anthropic => (
                        HeaderName::from_static("x-api-key"),
                        CredentialFormat::ApiKey,
                    ),
                    ProviderProtocol::Gemini => (
                        HeaderName::from_static("x-goog-api-key"),
                        CredentialFormat::ApiKey,
                    ),
                };
                let value = credential
                    .header(format)
                    .await
                    .map_err(|_| TransportFailure::Unavailable)?;
                headers.insert(name, value);
            }
            if control.cancellation.is_cancelled()
                || control
                    .deadline
                    .is_some_and(|deadline| deadline <= std::time::Instant::now())
            {
                return Err(TransportFailure::Unavailable);
            }
            let client = match &self.dispatch {
                Dispatch::Direct(client) => client,
                Dispatch::Supervised(supervised) => {
                    return supervised
                        .send(
                            target,
                            headers,
                            request.body,
                            request.max_response_bytes,
                            control,
                        )
                        .await;
                }
            };
            let mut outbound = client.post(target).headers(headers).body(request.body);
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
                .get(match self.protocol {
                    ProviderProtocol::Anthropic => "request-id",
                    ProviderProtocol::OpenAiCompatible
                    | ProviderProtocol::Responses
                    | ProviderProtocol::Gemini => "x-request-id",
                })
                .and_then(|value| value.to_str().ok())
                .filter(|value| {
                    value.len() <= 128
                        && value.bytes().all(|byte| {
                            byte.is_ascii_alphanumeric()
                                || matches!(byte, b'_' | b'-' | b'.' | b':')
                        })
                })
                .map(str::to_owned);
            let retry_after = response.headers().get_all(RETRY_AFTER);
            let mut advice = retry_after.iter();
            let retry_after_ms = advice
                .next()
                .filter(|_| advice.next().is_none())
                .and_then(|value| value.to_str().ok())
                .filter(|value| value.bytes().all(|byte| byte.is_ascii_digit()))
                .and_then(|value| value.parse::<u64>().ok())
                .and_then(|seconds| seconds.checked_mul(1000));
            let maximum = request.max_response_bytes;
            let body = if response
                .content_length()
                .is_some_and(|size| size > maximum as u64)
            {
                // Preserve the already-observed response headers while
                // declining to read the oversized body.
                drop(response);
                futures_util::stream::once(async { Err(TransportFailure::Interrupted) }).boxed()
            } else {
                futures_util::stream::try_unfold(
                (
                    Box::pin(response.bytes_stream()),
                    0usize,
                    control.cancellation,
                ),
                move |(mut body, consumed, cancellation)| async move {
                    let chunk = loop {
                        let chunk = tokio::select! {
                            _ = cancellation.cancelled() => return Err(TransportFailure::Interrupted),
                            chunk = body.next() => chunk,
                        };
                        let Some(chunk) = chunk else {
                            return Ok(None);
                        };
                        let chunk = chunk.map_err(|_| TransportFailure::Interrupted)?;
                        if !chunk.is_empty() {
                            break chunk;
                        }
                    };
                    let consumed = consumed
                        .checked_add(chunk.len())
                        .filter(|total| *total <= maximum)
                        .ok_or(TransportFailure::Interrupted)?;
                    Ok(Some((chunk.to_vec(), (body, consumed, cancellation))))
                },
            )
            .boxed()
            };
            Ok(TransportResponse {
                status,
                request_id,
                retry_after_ms,
                body,
            })
        })
    }
}

fn direct_client(base: &Url) -> Result<Client> {
    let mut client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .retry(reqwest::retry::never())
        .pool_max_idle_per_host(0)
        .http1_only()
        .http1_max_headers(64)
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT);
    if base.host_str().is_some_and(is_loopback_host) {
        // A proxy must not intercept a loopback provider.
        client = client.no_proxy();
    }
    if base.host_str() == Some("localhost") {
        client = client.resolve_to_addrs(
            "localhost",
            &[
                SocketAddr::from(([127, 0, 0, 1], 0)),
                SocketAddr::from(([0, 0, 0, 0, 0, 0, 0, 1], 0)),
            ],
        );
    }
    client
        .build()
        .map_err(|_| problem("provider_http_client_unavailable"))
}

fn credential_source(options: &ProviderOptions, base: &Url) -> Result<Option<CredentialSource>> {
    match (&options.credential_env, &options.credential_home) {
        (Some(_), Some(_)) => Err(invalid("provider_credential_source_conflict")),
        (Some(name), None) => Ok(Some(CredentialSource::Environment { name: name.clone() })),
        (None, Some(home)) => {
            let provider = stored_provider(options.protocol, base)
                .ok_or_else(|| invalid("stored_credential_endpoint_mismatch"))?;
            if !home.is_absolute() {
                return Err(invalid("credential_home_must_be_absolute"));
            }
            let home = home
                .canonicalize()
                .map_err(|_| problem("credential_home_unavailable"))?;
            Ok(Some(CredentialSource::Stored {
                home,
                provider: provider.into(),
            }))
        }
        (None, None) => Ok(None),
    }
}

fn stored_provider(protocol: ProviderProtocol, base: &Url) -> Option<&'static str> {
    if base.scheme() != "https" || base.port().is_some() {
        return None;
    }
    let path = base.path().strip_suffix('/').unwrap_or(base.path());
    match (protocol, base.host_str()?, path) {
        (
            ProviderProtocol::OpenAiCompatible | ProviderProtocol::Responses,
            "api.openai.com",
            "/v1",
        ) => Some("openai"),
        (ProviderProtocol::OpenAiCompatible, "openrouter.ai", "/api/v1") => Some("openrouter"),
        (ProviderProtocol::OpenAiCompatible, "ai-gateway.vercel.sh", "/v1") => Some("vercel"),
        (ProviderProtocol::Anthropic, "api.anthropic.com", "/v1") => Some("anthropic"),
        (ProviderProtocol::Gemini, "generativelanguage.googleapis.com", "/v1beta") => {
            Some("google")
        }
        _ => None,
    }
}

fn provider_base(endpoint: &str) -> Result<Url> {
    let invalid_endpoint = || invalid("invalid_provider_endpoint");
    let url = Url::parse(endpoint).map_err(|_| invalid_endpoint())?;
    let host = url.host_str().ok_or_else(invalid_endpoint)?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(invalid_endpoint());
    }
    if !(url.scheme() == "https" || (url.scheme() == "http" && is_loopback_host(host))) {
        return Err(invalid_endpoint());
    }
    Ok(url)
}

fn is_loopback_host(host: &str) -> bool {
    host == "localhost"
        || host
            .trim_matches(['[', ']'])
            .parse::<IpAddr>()
            .is_ok_and(|address| address.to_canonical().is_loopback())
}

fn provider_route(
    mut target: Url,
    protocol: ProviderProtocol,
    model: &ModelId,
) -> Result<(Url, TransportOperation)> {
    let mut segments = target
        .path_segments_mut()
        .map_err(|_| invalid("invalid_provider_endpoint"))?;
    segments.pop_if_empty();
    let operation = match protocol {
        ProviderProtocol::OpenAiCompatible => {
            segments.extend(["chat", "completions"]);
            TransportOperation::ChatCompletions
        }
        ProviderProtocol::Responses => {
            segments.push("responses");
            TransportOperation::OpenAiResponses
        }
        ProviderProtocol::Anthropic => {
            segments.push("messages");
            TransportOperation::AnthropicMessages
        }
        ProviderProtocol::Gemini => {
            if !model
                .as_str()
                .bytes()
                .next()
                .is_some_and(|byte| byte.is_ascii_alphanumeric())
                || !model
                    .as_str()
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
            {
                return Err(invalid("invalid_gemini_model_path"));
            }
            segments.extend(["models", &format!("{model}:streamGenerateContent")]);
            TransportOperation::GeminiStreamGenerateContent {
                model: model.clone(),
            }
        }
    };
    drop(segments);
    if protocol == ProviderProtocol::Gemini {
        target.query_pairs_mut().append_pair("alt", "sse");
    }
    Ok((target, operation))
}

fn invalid(code: &'static str) -> Error {
    Error::new(ErrorKind::InvalidInput, code)
}

fn problem(code: &'static str) -> Error {
    Error::new(ErrorKind::Unavailable, code)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn options(protocol: ProviderProtocol) -> ProviderOptions {
        ProviderOptions {
            endpoint: "http://127.0.0.1:1/v1".into(),
            model: ModelId::new("fixture-model").unwrap(),
            credential_env: None,
            max_output_tokens: 128,
            protocol,
            credential_home: None,
            compatible_output_limit_field: None,
        }
    }

    #[test]
    fn verified_context_window_requires_the_canonical_route_and_exact_model() {
        let canonical = Url::parse("https://api.openai.com/v1/responses").unwrap();
        let model = ModelId::new("gpt-6.1-sol").unwrap();
        assert_eq!(
            responses_context_window(&canonical, &model).unwrap().get(),
            1_050_000
        );
        for target in [
            "https://api.openai.com/v1/other/responses",
            "https://api.openai.com:444/v1/responses",
            "https://openai.example.test/v1/responses",
            "http://127.0.0.1:1/v1/responses",
        ] {
            assert!(responses_context_window(&Url::parse(target).unwrap(), &model).is_none());
        }
        let unregistered = ModelId::new("openai/gpt-6.1-sol").unwrap();
        assert!(responses_context_window(&canonical, &unregistered).is_none());
    }

    #[test]
    fn responses_can_count_only_under_the_same_fixed_api_route() {
        let state = tempfile::tempdir().unwrap();
        let transport =
            HttpTransport::new(state.path(), &options(ProviderProtocol::Responses), None).unwrap();
        assert_eq!(
            transport
                .request_target(&TransportOperation::OpenAiResponses)
                .unwrap()
                .as_str(),
            "http://127.0.0.1:1/v1/responses"
        );
        assert_eq!(
            transport
                .request_target(&TransportOperation::OpenAiResponsesInputTokens)
                .unwrap()
                .as_str(),
            "http://127.0.0.1:1/v1/responses/input_tokens"
        );
        assert_eq!(
            transport.request_target(&TransportOperation::ChatCompletions),
            Err(TransportFailure::Unavailable)
        );
        let compatible = HttpTransport::new(
            state.path(),
            &options(ProviderProtocol::OpenAiCompatible),
            None,
        )
        .unwrap();
        assert_eq!(
            compatible.request_target(&TransportOperation::OpenAiResponsesInputTokens),
            Err(TransportFailure::Unavailable)
        );
    }

    #[test]
    fn responses_stored_credentials_require_the_reviewed_vendor_destination() {
        assert_eq!(
            stored_provider(
                ProviderProtocol::Responses,
                &Url::parse("https://api.openai.com/v1").unwrap()
            ),
            Some("openai")
        );
        for address in [
            "https://api.openai.com/elsewhere",
            "https://api.openai.com:444/v1",
            "https://other.example/v1",
            "http://127.0.0.1/v1",
        ] {
            assert_eq!(
                stored_provider(ProviderProtocol::Responses, &Url::parse(address).unwrap()),
                None
            );
        }
    }
}
