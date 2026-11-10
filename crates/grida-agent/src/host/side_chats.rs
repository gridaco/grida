//! GRIDA-SEC-004 — Temporary conversations with independent, inference-only ownership.

use super::*;
use agent_kit_core::messages::OutcomeStatus;
use agent_kit_store_sqlite::history::HistoryBasis;
use grida_agent_master::conversation_seed::SeedOmissions;
use grida_agent_master::side_context::SideContext;
use grida_agent_master::{Account, read_account};
use std::future::Future;

const MAX_QUESTION_BYTES: usize = 16 * 1024;
const MAX_ANSWER_BYTES: usize = 64 * 1024;
const MAX_TURNS: usize = 6;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SideChatView {
    pub side_chat_id: SessionId,
    pub parent_session_id: SessionId,
    pub source_context: HistoryBasis,
    pub compacted: bool,
    pub truncated: bool,
    pub omissions: SeedOmissions,
    pub temporary: bool,
    pub read_only: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SideAnswer {
    pub turn_id: TurnId,
    pub status: OutcomeStatus,
    pub account: Option<Account>,
    pub text_truncated: bool,
}

pub(crate) struct SideChat {
    view: SideChatView,
    host: Host,
    turns: Mutex<usize>,
}

impl Host {
    async fn open_side_chat(&self, parent: SessionId) -> Result<SideChat> {
        if self.work.lock().await.closed {
            return Err(problem(ErrorKind::Unavailable, "host_shutting_down"));
        }
        self.execution()?;
        let source = self.store.inspect(parent.clone()).await?;
        self.check_execution(&source)?;
        let history = self
            .store
            .context_history_with(parent.clone(), None, grida_agent_master::history::project)
            .await?;
        let basis = history.basis.clone();
        let (messages, omissions, compacted) = history::context_material(history)?;
        let context = Arc::new(SideContext::capture(
            messages,
            basis.fingerprint,
            omissions,
        )?);
        let host = Self {
            store: Arc::new(SqliteStore::open_in_memory()?),
            execution: self.execution.clone(),
            gg_connection: None,
            configuration: self.configuration.clone(),
            permissions: None,
            operating_regime: OperatingRegime::Act,
            require_completion_text: false,
            side_context: Some(context.clone()),
            #[cfg(unix)]
            guidance_root: None,
            configuration_admission: Arc::default(),
            controls: Arc::new(Semaphore::new(MAX_OWNED_CONTROLS)),
            work: Arc::default(),
            workers: Arc::default(),
            changed: Arc::default(),
            live_text: broadcast::channel(UPDATE_CAPACITY).0,
        };
        let session = host
            .new_session(session_configuration(&source)?.cwd)
            .await?;
        Ok(SideChat {
            view: SideChatView {
                side_chat_id: session,
                parent_session_id: parent,
                source_context: basis,
                compacted,
                truncated: context.truncated,
                omissions: context.omissions.clone(),
                temporary: true,
                read_only: true,
            },
            host,
            turns: Mutex::new(0),
        })
    }
}

impl SideChat {
    pub(crate) async fn ask(
        &self,
        id: ChangeId,
        text: String,
        cancellation: impl Future<Output = ()>,
    ) -> Result<SideAnswer> {
        if text.trim().is_empty() || text.len() > MAX_QUESTION_BYTES {
            return Err(problem(
                ErrorKind::InvalidInput,
                "invalid_side_chat_question",
            ));
        }
        let mut turns = self
            .turns
            .try_lock()
            .map_err(|_| problem(ErrorKind::Conflict, "side_chat_turn_active"))?;
        let session = self.view.side_chat_id.clone();
        let parts = vec![PromptPart::Text { text }];
        if let Some(previous) = self.host.store.input(session.clone(), id.clone()).await? {
            lifecycle::check_input(&previous.input, &parts)?;
            let InputDisposition::Completed { turn } = previous.disposition else {
                return Err(problem(ErrorKind::Uncertain, "side_chat_turn_unsettled"));
            };
            let retained = self.host.store.inspect_turn(session, turn.clone()).await?;
            return answer(
                turn,
                retained
                    .outcome
                    .ok_or_else(|| problem(ErrorKind::Uncertain, "side_chat_turn_unsettled"))?,
            );
        }
        if *turns >= MAX_TURNS {
            return Err(problem(ErrorKind::LimitExceeded, "side_chat_turn_limit"));
        }
        *turns += 1;
        let run = self
            .host
            .start_prompt(PromptRequest {
                session: session.clone(),
                id,
                parts,
                questions: false,
                configuration_permission: crate::ConfigurationPermission::Disabled,
                operating_regime: None,
            })
            .await?;
        let mut completion = run.completion;
        let result = tokio::select! {
            result = &mut completion => result,
            _ = cancellation => {
                self.host.cancel(session, run.turn.clone()).await?;
                completion.await
            }
        }
        .map_err(|_| problem(ErrorKind::Uncertain, "side_chat_worker_disconnected"))??;
        match result {
            RunResult::Settled(outcome) => answer(run.turn, outcome),
            _ => Err(problem(ErrorKind::Uncertain, "side_chat_turn_unsettled")),
        }
    }

    pub(crate) async fn close(&self) -> Result<()> {
        self.host.shutdown().await
    }
}

fn answer(turn_id: TurnId, outcome: TurnOutcome) -> Result<SideAnswer> {
    let mut account = outcome.account.as_ref().map(read_account).transpose()?;
    let text_truncated = account.as_mut().is_some_and(|account| {
        if account.text.len() <= MAX_ANSWER_BYTES {
            return false;
        }
        account
            .text
            .truncate(account.text.floor_char_boundary(MAX_ANSWER_BYTES));
        true
    });
    Ok(SideAnswer {
        turn_id,
        status: outcome.status,
        account,
        text_truncated,
    })
}

pub(super) struct InferenceOnly {
    authority: Arc<ExecutionAuthority>,
    selection: GrantSelection,
}

impl InferenceOnly {
    pub(super) fn new(execution: &Execution) -> Self {
        Self {
            authority: execution.authorization.clone(),
            selection: execution.authority.inference.clone(),
        }
    }
}

impl AuthorityValidator for InferenceOnly {
    fn validate(&self, request: AuthorityRequest) -> BoxFuture<'_, Result<()>> {
        if request.selection == self.selection {
            return self.authority.validate(request);
        }
        Box::pin(async {
            Err(problem(
                ErrorKind::Unsupported,
                "side_chat_tools_unavailable",
            ))
        })
    }
}

impl ToolGate for InferenceOnly {
    fn decide(&self, _: ToolAdmission, _: AdmissionContext) -> BoxFuture<'_, Result<ToolDecision>> {
        Box::pin(async {
            Err(problem(
                ErrorKind::Unsupported,
                "side_chat_tools_unavailable",
            ))
        })
    }
}

const MAX_OPEN_CHATS: usize = 4;
const MAX_OPEN_REQUESTS: usize = 32;

/// The private client retains this scope for exactly one connection.
#[derive(Default)]
pub(crate) struct SideChats {
    state: Mutex<SideChatState>,
}

#[derive(Default)]
struct SideChatState {
    closed: bool,
    requests: BTreeMap<ChangeId, SideEntry>,
}

struct SideEntry {
    parent: SessionId,
    id: SessionId,
    chat: Option<Arc<SideChat>>,
    close_error: Option<Error>,
}

impl SideChats {
    pub(crate) async fn open(
        &self,
        host: &Host,
        parent: SessionId,
        request: ChangeId,
    ) -> Result<SideChatView> {
        let mut state = self.state.lock().await;
        if state.closed {
            return Err(problem(ErrorKind::Unavailable, "side_chat_scope_closed"));
        }
        if let Some(entry) = state.requests.get(&request) {
            if entry.parent != parent {
                return Err(problem(ErrorKind::Conflict, "side_chat_request_reused"));
            }
            return entry
                .chat
                .as_ref()
                .map(|chat| chat.view.clone())
                .ok_or_else(missing);
        }
        if state.requests.len() >= MAX_OPEN_REQUESTS
            || state
                .requests
                .values()
                .filter(|entry| entry.chat.is_some())
                .count()
                >= MAX_OPEN_CHATS
        {
            return Err(problem(ErrorKind::LimitExceeded, "side_chat_scope_limit"));
        }
        let chat = Arc::new(host.open_side_chat(parent.clone()).await?);
        let view = chat.view.clone();
        state.requests.insert(
            request,
            SideEntry {
                parent,
                id: view.side_chat_id.clone(),
                chat: Some(chat),
                close_error: None,
            },
        );
        Ok(view)
    }

    pub(crate) async fn get(&self, id: &SessionId) -> Result<Arc<SideChat>> {
        let state = self.state.lock().await;
        state
            .requests
            .values()
            .find(|entry| &entry.id == id)
            .and_then(|entry| entry.chat.clone())
            .ok_or_else(missing)
    }

    pub(crate) async fn close(&self, id: &SessionId) -> Result<()> {
        let mut state = self.state.lock().await;
        let entry = state
            .requests
            .values_mut()
            .find(|entry| &entry.id == id)
            .ok_or_else(missing)?;
        let Some(chat) = entry.chat.as_ref() else {
            return entry.close_error.clone().map_or(Ok(()), Err);
        };
        let result = chat.close().await;
        entry.chat = None;
        entry.close_error = result.as_ref().err().cloned();
        result
    }

    pub(crate) async fn close_all(&self) -> Result<()> {
        let mut state = self.state.lock().await;
        state.closed = true;
        let results = futures_util::future::join_all(
            state
                .requests
                .values()
                .filter_map(|entry| entry.chat.as_ref())
                .map(|chat| chat.close()),
        )
        .await;
        for (entry, result) in state
            .requests
            .values_mut()
            .filter(|entry| entry.chat.is_some())
            .zip(results)
        {
            entry.chat = None;
            entry.close_error = result.err();
        }
        state
            .requests
            .values()
            .find_map(|entry| entry.close_error.clone())
            .map_or(Ok(()), Err)
    }
}

fn missing() -> Error {
    problem(ErrorKind::Unavailable, "side_chat_unavailable")
}
