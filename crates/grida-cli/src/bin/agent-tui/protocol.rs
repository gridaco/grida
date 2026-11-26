//! The harness observes one native session through the ACP v1 SDK.

use agent_client_protocol::schema::ProtocolVersion;
use agent_client_protocol::v1::ConnectionTo;
use agent_client_protocol::v1::schema::{
    ClientCapabilities, ContentBlock, InitializeRequest, LoadSessionRequest, NewSessionRequest,
};
use agent_client_protocol::{Agent, Error, Result, UntypedMessage};
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::{Map, Value, json};
use std::path::{Path, PathBuf};
use std::time::Duration;
use uuid::Uuid;

pub const WINDOW: &str = "co.grida/session/transcript-window";
pub const LIVE: &str = "co.grida/session/updates";
pub const COMPACTION: &str = "co.grida/session/compaction-items";
pub const LIFECYCLE: &str = "co.grida/session/lifecycle";
pub const COMPACT_START: &str = "compact/start";

const CAPABILITIES: &[&str] = &[
    WINDOW,
    LIVE,
    COMPACTION,
    LIFECYCLE,
    "co.grida/session/activity-order",
    "co.grida/session/snapshot",
    "co.grida/session/submit",
    "co.grida/session/enqueue",
    "co.grida/session/resume-queue",
    "co.grida/session/compact/start",
    "co.grida/session/queue-actions",
    "co.grida/session/queued-input-image-chunks",
    "co.grida/session/questions-v2",
    "co.grida/session/answer-question-v2",
];
const TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Clone)]
pub struct Session {
    connection: ConnectionTo<Agent>,
    pub id: String,
    workspace: PathBuf,
}

impl Session {
    pub fn workspace(&self) -> &Path {
        &self.workspace
    }

    pub async fn attach(
        connection: ConnectionTo<Agent>,
        workspace: PathBuf,
        id: Option<String>,
    ) -> Result<Self> {
        let capabilities = ClientCapabilities::new().meta(
            CAPABILITIES
                .iter()
                .map(|capability| (capability.to_string(), json!(1)))
                .collect::<Map<_, _>>(),
        );
        let initialized = bounded(
            connection
                .send_request(
                    InitializeRequest::new(ProtocolVersion::V1).client_capabilities(capabilities),
                )
                .block_task(),
        )
        .await?;
        if initialized.protocol_version != ProtocolVersion::V1 {
            return Err(failure("The host does not speak ACP v1"));
        }
        for capability in CAPABILITIES {
            let supported = initialized
                .agent_capabilities
                .meta
                .as_ref()
                .and_then(|meta| meta.get(*capability))
                .and_then(Value::as_u64)
                == Some(1);
            if !supported {
                return Err(failure(format!("The host does not offer {capability} v1")));
            }
        }
        let id = if let Some(id) = id {
            bounded(
                connection
                    .send_request(
                        LoadSessionRequest::new(id.clone(), workspace.clone())
                            .meta(Map::from_iter([(WINDOW.into(), json!({"kind":"attach"}))])),
                    )
                    .block_task(),
            )
            .await?;
            id
        } else {
            bounded(
                connection
                    .send_request(NewSessionRequest::new(workspace.clone()))
                    .block_task(),
            )
            .await?
            .session_id
            .0
            .to_string()
        };
        Ok(Self {
            connection,
            id,
            workspace,
        })
    }

    pub async fn closed(&self) {
        self.connection.incoming_closed().await;
    }

    pub async fn replay(&self, request: &str) -> Result<Value> {
        let response = bounded(
            self.connection
                .send_request(
                    LoadSessionRequest::new(self.id.clone(), self.workspace.clone()).meta(
                        Map::from_iter([(
                            WINDOW.into(),
                            json!({"kind":"read","requestId": request}),
                        )]),
                    ),
                )
                .block_task(),
        )
        .await?;
        response
            .meta
            .and_then(|mut meta| meta.remove(WINDOW))
            .filter(|meta| meta["requestId"] == request)
            .ok_or_else(|| failure("The host returned an unrelated transcript window"))
    }

    pub async fn snapshot(&self) -> Result<Snapshot> {
        let snapshot: Snapshot = self
            .request("snapshot", &json!({"sessionId":self.id}))
            .await?;
        if snapshot.session_id != self.id {
            return Err(failure("The host returned an unrelated session snapshot"));
        }
        Ok(snapshot)
    }

    pub async fn checkout_prompt(&self, checkout: &Checkout) -> Result<Vec<ContentBlock>> {
        let message: CheckoutPrompt = self
            .request("queued-message", &json!({
                "sessionId":self.id,"inputId":checkout.input_id,"checkoutId":checkout.checkout_id,
            }))
            .await?;
        if message.input_id != checkout.input_id {
            return Err(failure("The host returned an unrelated checked-out input"));
        }
        Ok(message.prompt)
    }

    pub async fn questions(&self, turn: &Turn) -> Result<Questions> {
        let questions: Questions = self
            .request(
                "questions-v2",
                &json!({"sessionId":self.id,"turnId":turn.turn_id}),
            )
            .await?;
        if questions.session_id != self.id || questions.turn_id != turn.turn_id {
            return Err(failure("The host returned questions for an unrelated turn"));
        }
        Ok(questions)
    }

    pub async fn receipt(&self, request: &str) -> Result<Option<Receipt>> {
        let found: ReceiptLookup = self
            .request(
                "queue-action-receipt",
                &json!({"sessionId":self.id,"requestId":request}),
            )
            .await?;
        if let Some(receipt) = &found.receipt
            && (receipt.session_id != self.id || receipt.request_id != request)
        {
            return Err(failure("The host returned an unrelated queue receipt"));
        }
        Ok(found.receipt)
    }

    pub async fn act(&self, request: &Mutation, retry: bool) -> Result<MutationOutcome> {
        let result: Value = if retry && request.queue_action.is_some() {
            let receipt = self
                .receipt(&request.id)
                .await
                .map_err(|error| failure(format!("Could not read the queue receipt: {error}")))?;
            if let Some(receipt) = receipt {
                serde_json::to_value(receipt).map_err(|error| failure(error.to_string()))?
            } else {
                self.request(request.method, &request.params).await?
            }
        } else {
            self.request(request.method, &request.params).await?
        };
        if request.method == COMPACT_START {
            return MutationOutcome::compaction_start(&request.id, &result);
        }
        let identity = if matches!(request.method, "submit" | "enqueue") {
            "inputId"
        } else {
            "requestId"
        };
        if result["sessionId"] != self.id
            || result[identity] != request.id
            || request
                .queue_action
                .is_some_and(|action| result["action"] != action)
            || request.queue_action == Some("checkout")
                && result["inputId"] != request.params["inputId"]
            || request.queue_action == Some("reinsert")
                && result["checkoutId"] != request.params["checkoutId"]
            || request.queue_action == Some("steer")
                && (result["inputId"] != request.params["inputId"]
                    || result["turnId"] != request.params["task"]["turnId"])
        {
            return Err(failure("The host returned an unrelated mutation receipt"));
        }
        Ok(MutationOutcome::Committed)
    }

    async fn request<T: DeserializeOwned>(&self, method: &str, params: &Value) -> Result<T> {
        let message = UntypedMessage::new(&format!("_co.grida/session/{method}"), params)?;
        let response = bounded(self.connection.send_request(message).block_task()).await?;
        serde_json::from_value(response).map_err(|error| failure(error.to_string()))
    }
}

async fn bounded<T>(request: impl Future<Output = Result<T>>) -> Result<T> {
    tokio::time::timeout(TIMEOUT, request)
        .await
        .map_err(|_| failure("The host did not acknowledge the request in time"))?
}

pub fn failure(message: impl Into<String>) -> Error {
    Error::new(-32603, message)
}

pub fn request_id() -> String {
    Uuid::new_v4().to_string()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    session_id: String,
    pub session_revision: u64,
    pub queue: Vec<Queued>,
    pub queue_checkout: Option<Checkout>,
    pub current: Option<Turn>,
    pub idle_queue_resume_available: bool,
    pub admission_paused: bool,
}

impl Snapshot {
    pub fn can_resume_queue(&self) -> bool {
        self.current.is_none() && (self.admission_paused || self.idle_queue_resume_available)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Queued {
    pub input_id: String,
    pub preview: Option<String>,
    pub checkoutable: bool,
    pub steerable: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Checkout {
    pub input_id: String,
    pub checkout_id: String,
}

#[derive(Debug, Deserialize)]
struct CheckoutPrompt {
    #[serde(rename = "inputId")]
    input_id: String,
    prompt: Vec<ContentBlock>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Turn {
    pub turn_id: String,
    pub disposition: String,
    pub control_revision: u64,
    pub input_needed: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Questions {
    session_id: String,
    pub turn_id: String,
    pub history_position: u64,
    pub control_revision: u64,
    pub questions: Vec<Wait>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Wait {
    pub wait_id: String,
    pub style: String,
    #[serde(flatten)]
    pub body: QuestionBody,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum QuestionBody {
    Batch {
        questions: Vec<Question>,
    },
    Legacy {
        question: String,
        options: Vec<String>,
    },
}

#[derive(Clone, Debug, Deserialize)]
pub struct Question {
    pub id: String,
    pub question: String,
    pub options: Vec<OptionLabel>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct OptionLabel {
    pub label: String,
}

#[derive(Deserialize)]
struct ReceiptLookup {
    receipt: Option<Receipt>,
}

#[derive(Debug, serde::Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Receipt {
    session_id: String,
    pub request_id: String,
    pub action: String,
    pub input_id: String,
    session_revision: u64,
    pub checkout_id: Option<String>,
    pub turn_id: Option<String>,
}

#[derive(Clone)]
pub struct Mutation {
    pub id: String,
    pub method: &'static str,
    pub params: Value,
    pub queue_action: Option<&'static str>,
    pub draft: Option<DraftEffect>,
}

impl Mutation {
    pub fn confirms_refusal(error: &Error) -> bool {
        error
            .data
            .as_ref()
            .and_then(Value::as_str)
            .is_some_and(|code| {
                !matches!(
                    code,
                    "admission_worker_interrupted"
                        | "prompt_acceptance_missing"
                        | "compaction_admission_pending"
                        | "compaction_admission_interrupted"
                        | "control_worker_interrupted"
                        | "sqlite_commit_unconfirmed"
                        | "store_task_interrupted"
                )
            })
    }
}

#[derive(Clone)]
pub enum DraftEffect {
    ClearOnCommit(u64),
    RestoreOnRefusal { revision: u64, text: String },
}

#[derive(Debug, PartialEq, Eq)]
pub enum MutationOutcome {
    Committed,
    CompactionAdmitted,
    CompactionNoChange,
}

impl MutationOutcome {
    pub fn compaction_start(request: &str, response: &Value) -> Result<Self> {
        if response["requestId"] == request {
            match (response["status"].as_str(), response.get("turnId")) {
                (Some("admitted"), Some(Value::String(turn))) if !turn.trim().is_empty() => {
                    return Ok(Self::CompactionAdmitted);
                }
                (Some("no_change"), Some(Value::Null)) => return Ok(Self::CompactionNoChange),
                _ => {}
            }
        }
        Err(failure("The host did not confirm compaction admission"))
    }
}
