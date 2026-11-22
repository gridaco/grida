//! GRIDA-SEC-004 — Automatic chat titles from the first request.
//!
//! A first accepted request can supply a provisional catalog title. A
//! temporary, tool-free conversation can replace it until a person renames
//! the chat. Archiving or restoring preserves its placement while generation
//! completes. Failed generation leaves the accepted label in place.
//!
//! A side chat is titled the same way. Its title stays on the side session's
//! own record, outside every workspace listing, and is discarded with it; a
//! client reads it from the side chat's snapshot. A person cannot rename it.

use super::*;
use agent_kit_core::messages::OutcomeStatus;
use agent_kit_store_sqlite::catalog::InitialLabel;
use grida_agent_master::read_account;

const TITLE_INSTRUCTIONS: &str = include_str!("../prompts/title.md");
/// The request text a title reads, so a long first request stays cheap.
const MAX_REQUEST_BYTES: usize = 960;
const MAX_TITLE_CHARS: usize = 50;
const TITLE_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Default)]
pub(super) struct FirstTitle {
    initial_label: Option<String>,
    source: Option<String>,
}

/// The first label is durable. A funded goal can finish publishing its spending
/// authority before it starts the optional title inference.
pub(super) struct AcceptedInput {
    receipt: Acceptance,
    title: Option<(PendingTitle, u64)>,
}

impl AcceptedInput {
    pub(super) fn start_title(self) -> Acceptance {
        if let Some((worker, revision)) = self.title {
            worker.start(revision);
        }
        self.receipt
    }
}

/// Active only from first-input admission through publication or failure.
struct PendingTitle {
    session: SessionId,
    text: String,
    host: Host,
}

impl Drop for PendingTitle {
    fn drop(&mut self) {
        self.host
            .title_workers
            .lock()
            .unwrap()
            .remove(&self.session);
        self.host.changed.notify_waiters();
    }
}

impl Host {
    /// Generate a chat title from its first request. Clients opt in at launch
    /// because generation costs one model request. Recording a client-supplied
    /// initial title works independently.
    pub fn with_chat_titles(mut self) -> Self {
        self.chat_titles = true;
        self
    }

    /// A new worker cannot register between sampling its status and reading
    /// the label. An existing worker publishes its result before retiring.
    pub(super) async fn read_with_title_state<T>(
        &self,
        session: &SessionId,
        read: impl Future<Output = Result<T>>,
    ) -> Result<(T, bool)> {
        let _observation = self.title_observation.read().await;
        let pending = self.title_workers.lock().unwrap().contains(session);
        Ok((read.await?, pending))
    }

    async fn register_title(&self, session: &SessionId, text: String) -> Option<PendingTitle> {
        let _registration = self.title_observation.write().await;
        self.title_workers
            .lock()
            .unwrap()
            .insert(session.clone())
            .then(|| PendingTitle {
                host: self.clone(),
                session: session.clone(),
                text,
            })
    }

    /// Only regular and side chats take a title from an accepted first input.
    pub(super) fn title_candidate(
        &self,
        view: &SessionView,
        parts: &[PromptPart],
        initial_title: Option<String>,
    ) -> Result<FirstTitle> {
        if self.inference_only
            || view.current.is_some()
            || view.latest.is_some()
            || !view.queued.is_empty()
            || session_configuration(view)?.subagent.is_some()
        {
            return Ok(FirstTitle::default());
        }
        let initial_label = catalog::normalize_title(initial_title)?;
        let source = self
            .chat_titles
            .then(|| {
                parts
                    .iter()
                    .filter_map(|part| match part {
                        PromptPart::Text { text } => Some(text.as_str()),
                        _ => None,
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .filter(|text| !text.trim().is_empty());
        Ok(FirstTitle {
            initial_label,
            source,
        })
    }

    pub(super) async fn accept_with_title(
        &self,
        session: SessionId,
        input: Submission,
        expected: Option<SessionRevision>,
        title: FirstTitle,
    ) -> Result<AcceptedInput> {
        // Mark the candidate before the catalog write becomes visible. A reader
        // who sees the provisional title can then follow the worker to completion.
        let pending = if let Some(text) = title.source {
            self.register_title(&session, text).await
        } else {
            None
        };
        let initial = title
            .initial_label
            .map(InitialLabel::Display)
            .or_else(|| pending.as_ref().map(|_| InitialLabel::AwaitSuggestion));
        let (acceptance, revision) = self
            .store
            .submit_with_initial_label(session, input, expected, initial)
            .await?;
        Ok(AcceptedInput {
            receipt: acceptance,
            title: pending.zip(revision),
        })
    }

    async fn write_title(&self, session: &SessionId, text: &str, revision: u64) -> Result<()> {
        let configuration = self.store.configuration(session.clone()).await?;
        let cwd = decode_session_configuration(&configuration)?.cwd;
        let Some(title) = self.generate_title(cwd, text).await? else {
            return Ok(());
        };
        if self.work.lock().await.closed {
            return Ok(());
        }
        self.store
            .finish_label_suggestion(session.clone(), revision, title)
            .await
    }

    async fn generate_title(&self, cwd: PathBuf, text: &str) -> Result<Option<String>> {
        let titler = self.temporary_titler()?;
        let session = titler.new_session(cwd).await?;
        let run = titler
            .start_prompt(PromptRequest {
                session,
                id: change_id()?,
                parts: vec![PromptPart::Text {
                    text: title_request(text),
                }],
                questions: false,
                question_batches: false,
                operating_regime: None,
                effort: None,
                reasoning: Default::default(),
            })
            .await;
        let title = match run {
            // The temporary host shuts down on every path, so a slow title
            // request stops with it.
            Ok(run) => match tokio::time::timeout(TITLE_TIMEOUT, run.completion).await {
                Ok(Ok(Ok(RunResult::Settled(outcome))))
                    if outcome.status == OutcomeStatus::Succeeded =>
                {
                    outcome
                        .account
                        .as_ref()
                        .and_then(|account| read_account(account).ok())
                        .and_then(|account| sanitize(&account.text))
                }
                _ => None,
            },
            Err(_) => None,
        };
        titler.shutdown().await?;
        Ok(title)
    }

    /// A private, in-memory, tool-free host for one title request.
    fn temporary_titler(&self) -> Result<Self> {
        self.execution()?;
        let store = Arc::new(SqliteStore::open_in_memory()?);
        Ok(Self {
            activity_order: Arc::new(activity_order::State::new(None, store.clone())),
            spending: Arc::new(spending::Store::detached(store.clone())),
            store,
            state_dir: None,
            execution: self.execution.clone(),
            routes: Default::default(),
            selected_route: None,
            route_id: None,
            gg_connection: None,
            configuration: self.configuration.clone(),
            permissions: None,
            host_tools: None,
            editor_surfaces: Default::default(),
            desktop_image_generation: None,
            subagents_enabled: false,
            sponsorship_enabled: false,
            goal_sponsorship_enabled: false,
            chat_titles: false,
            effort: EffortPreset::Standard,
            operating_regime: OperatingRegime::Act,
            require_completion_text: false,
            inference_only: true,
            #[cfg(unix)]
            guidance_root: None,
            configuration_admission: Arc::default(),
            delegation_controls: Arc::default(),
            controls: Arc::new(Semaphore::new(MAX_OWNED_CONTROLS)),
            work: Arc::default(),
            wake_lock: Arc::default(),
            workers: Arc::default(),
            predictions: Arc::default(),
            title_observation: Arc::default(),
            title_workers: Arc::default(),
            changed: Arc::default(),
            live_updates: broadcast::channel(UPDATE_CAPACITY).0,
            subagent_activity: Arc::default(),
            processes: Arc::default(),
        })
    }
}

impl PendingTitle {
    fn start(self, revision: u64) {
        tokio::spawn(async move {
            let _ = self
                .host
                .write_title(&self.session, &self.text, revision)
                .await;
        });
    }
}

/// The titler's authority: inference under the host's execution, and no tool.
pub(super) struct ToolFree {
    authority: Arc<ExecutionAuthority>,
    selection: GrantSelection,
}

impl ToolFree {
    pub(super) fn new(execution: &Execution) -> Self {
        Self {
            authority: execution.authorization.clone(),
            selection: execution.authority.inference.clone(),
        }
    }
}

impl AuthorityValidator for ToolFree {
    fn validate(&self, request: AuthorityRequest) -> BoxFuture<'_, Result<()>> {
        if request.selection == self.selection {
            return self.authority.validate(request);
        }
        Box::pin(async { Err(problem(ErrorKind::Unsupported, "title_tools_unavailable")) })
    }
}

impl ToolGate for ToolFree {
    fn decide(&self, _: ToolAdmission, _: AdmissionContext) -> BoxFuture<'_, Result<ToolDecision>> {
        Box::pin(async { Err(problem(ErrorKind::Unsupported, "title_tools_unavailable")) })
    }
}

fn title_request(text: &str) -> String {
    let text = text.trim();
    let text = &text[..text.floor_char_boundary(MAX_REQUEST_BYTES.min(text.len()))];
    format!("{}\n\nFirst request:\n{text}", TITLE_INSTRUCTIONS.trim())
}

/// The first line of a model's answer, without quotes, trailing punctuation
/// or reasoning markup, bounded to a short label.
pub(crate) fn sanitize(raw: &str) -> Option<String> {
    let mut text = raw.to_owned();
    while let (Some(start), Some(end)) = (text.find("<think>"), text.find("</think>")) {
        if end < start {
            break;
        }
        text.replace_range(start..end + "</think>".len(), "");
    }
    let line = text.lines().map(str::trim).find(|line| !line.is_empty())?;
    let quotes = |c: char| c.is_whitespace() || "\"'`‘’“”*#".contains(c);
    let line = line.trim_matches(quotes);
    let line = line
        .strip_prefix("Title:")
        .unwrap_or(line)
        .trim_matches(quotes);
    let line = line.trim_end_matches(['.', '!', '?', '…']).trim();
    if line.is_empty() || line.chars().any(char::is_control) {
        return None;
    }
    if line.chars().count() <= MAX_TITLE_CHARS {
        return Some(line.to_owned());
    }
    let cut: String = line.chars().take(MAX_TITLE_CHARS - 1).collect();
    Some(format!("{}…", cut.trim_end()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn catalog_title_reads_cannot_miss_a_worker_that_starts_and_finishes_during_the_read() {
        let directory = tempfile::tempdir().unwrap();
        let state = directory.path().join("state");
        prepare_state_dir(&state).unwrap();
        open_store(&state.join(DATABASE_FILE)).unwrap();
        let host = Host::open(&state, None).unwrap();
        let session = SessionId::new("read-title").unwrap();
        let (release, held) = oneshot::channel();
        let mut read = std::pin::pin!(host.read_with_title_state(&session, async {
            held.await.unwrap();
            Ok(())
        }));
        assert!(futures_util::poll!(read.as_mut()).is_pending());
        let mut register = std::pin::pin!(host.register_title(&session, "Hello".into()));
        assert!(futures_util::poll!(register.as_mut()).is_pending());
        release.send(()).unwrap();
        assert_eq!(read.await.unwrap(), ((), false));

        let worker = register.await.unwrap();
        let result = host
            .read_with_title_state(&session, async {
                drop(worker);
                Ok(())
            })
            .await
            .unwrap();
        assert_eq!(result, ((), true));
        assert_eq!(
            host.read_with_title_state(&session, async { Ok(()) })
                .await
                .unwrap(),
            ((), false)
        );
    }

    #[test]
    fn titles_are_one_short_line() {
        assert_eq!(
            sanitize("\"Fix the cart discount.\"\n"),
            Some("Fix the cart discount".into())
        );
        assert_eq!(
            sanitize("<think>The user wants…</think>\n\nTitle: Spring launch kit"),
            Some("Spring launch kit".into())
        );
        assert_eq!(sanitize("  \n\n"), None);
        let long = sanitize(&"word ".repeat(30)).unwrap();
        assert!(long.chars().count() <= MAX_TITLE_CHARS && long.ends_with('…'));
    }

    #[test]
    fn a_long_request_is_bounded() {
        let request = title_request(&"é".repeat(2_000));
        let tail = request.rsplit("First request:\n").next().unwrap();
        assert!(tail.len() <= MAX_REQUEST_BYTES);
    }
}
