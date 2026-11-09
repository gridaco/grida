//! GRIDA-SEC-008 — private Responses transport with supervisor-owned OAuth.

use crate::SupervisedProvider;
use agent_kit_core::authority::AuthorityBinding;
use agent_kit_core::inference::{ProviderBinding, RequestControl};
use agent_kit_core::{
    BindingId, BoxFuture, Error, ErrorKind, ModelId, PrincipalId, ProviderId, Result, ScopeId,
};
use agent_kit_providers::{
    StreamingTransport, TransportFailure, TransportOperation, TransportRequest, TransportResponse,
};
use reqwest::Url;
use reqwest::header::{ACCEPT, CONTENT_TYPE, HeaderMap, HeaderValue};

const BASE: &str = "https://chatgpt.com/backend-api/codex";
const TARGET: &str = "https://chatgpt.com/backend-api/codex/responses";

pub(crate) struct SupervisedChatGpt {
    pub(crate) binding: ProviderBinding,
    pub(crate) replay_binding: BindingId,
    pub(crate) wire_model: ModelId,
    target: Url,
    supervisor: SupervisedProvider,
}

impl SupervisedChatGpt {
    pub(crate) fn new(
        endpoint: &str,
        model: &ModelId,
        scope: &str,
        supervisor: SupervisedProvider,
    ) -> Result<Self> {
        if endpoint != BASE {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "chatgpt_subscription_endpoint_invalid",
            ));
        }
        if scope.len() != 64
            || !scope
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "chatgpt_subscription_scope_invalid",
            ));
        }
        let wire_model = match model.as_str() {
            "openai/gpt-5.6-sol" => "gpt-5.6-sol",
            "openai/gpt-5.6-terra" => "gpt-5.6-terra",
            "openai/gpt-5.6-luna" => "gpt-5.6-luna",
            "openai/gpt-5.5" => "gpt-5.5",
            "openai/gpt-5.4" => "gpt-5.4",
            _ => {
                return Err(Error::new(
                    ErrorKind::Unsupported,
                    "chatgpt_subscription_model_unavailable",
                ));
            }
        };
        Ok(Self {
            binding: ProviderBinding {
                provider: ProviderId::new("chatgpt")?,
                authority: AuthorityBinding {
                    principal: PrincipalId::new(format!("chatgpt/subscription/{scope}"))?,
                    binding: BindingId::new(uuid::Uuid::new_v4().to_string())?,
                    scope: ScopeId::new(format!("chatgpt/subscription/{scope}"))?,
                },
            },
            replay_binding: BindingId::new(scope)?,
            wire_model: ModelId::new(wire_model)?,
            target: Url::parse(TARGET).expect("fixed ChatGPT subscription route"),
            supervisor,
        })
    }

    pub(crate) fn validate(&self) -> Result<()> {
        self.supervisor.validate()
    }
}

impl StreamingTransport for SupervisedChatGpt {
    fn send(
        &self,
        request: TransportRequest,
        control: RequestControl,
    ) -> BoxFuture<'_, std::result::Result<TransportResponse, TransportFailure>> {
        Box::pin(async move {
            if request.binding != self.binding
                || request.operation != TransportOperation::OpenAiResponses
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
