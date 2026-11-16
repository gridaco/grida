//! GRIDA-SEC-004 — Automatic chat titles from the first request.
//!
//! An untitled chat gets a short title from its first text request. A
//! temporary, tool-free conversation writes it while the first turn runs, and
//! it is saved only if the chat is still untitled at the same catalogue
//! revision, so a person's rename always wins.
//!
//! A side chat is titled the same way. Its title stays on the side session's
//! own record, outside every workspace listing, and is discarded with it; a
//! client reads it from the side chat's snapshot. A person cannot rename it.

use super::*;
use agent_kit_core::messages::OutcomeStatus;
use agent_kit_store_sqlite::catalog::CatalogEntry;
use grida_agent_master::read_account;

const TITLE_INSTRUCTIONS: &str = include_str!("../prompts/title.md");
/// The request text a title reads, so a long first request stays cheap.
const MAX_REQUEST_BYTES: usize = 960;
const MAX_TITLE_CHARS: usize = 50;
const TITLE_TIMEOUT: Duration = Duration::from_secs(60);

impl Host {
    /// Title untitled chats. A client opts in at launch: the title costs one
    /// model request, which a one-shot run or a scripted provider does not
    /// expect. The temporary titler and subagents are never titled.
    pub fn with_chat_titles(mut self) -> Self {
        self.chat_titles = true;
        self
    }

    /// The text to title `view`'s chat from, when this request is its first.
    /// `view` is the session before the request was submitted.
    pub(super) fn title_candidate(
        &self,
        view: &SessionView,
        parts: &[PromptPart],
    ) -> Option<(SessionId, String)> {
        if !self.chat_titles
            || self.inference_only
            || view.current.is_some()
            || view.latest.is_some()
            || !view.queued.is_empty()
            || session_configuration(view)
                .is_ok_and(|configuration| configuration.subagent.is_some())
        {
            return None;
        }
        let text = parts
            .iter()
            .filter_map(|part| match part {
                PromptPart::Text { text } => Some(text.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("\n");
        (!text.trim().is_empty()).then(|| (view.session.clone(), text))
    }

    /// Title an accepted first request in the background.
    pub(super) fn start_title(&self, candidate: Option<(SessionId, String)>) {
        let Some((session, text)) = candidate else {
            return;
        };
        self.title_workers.fetch_add(1, Ordering::Relaxed);
        let lifetime = WorkerLifetime {
            workers: self.title_workers.clone(),
            changed: self.changed.clone(),
        };
        let host = self.clone();
        tokio::spawn(async move {
            let _lifetime = lifetime;
            // A title is a convenience; failure leaves the chat untitled.
            let _ = host.write_title(session, text).await;
        });
    }

    /// Write the generated title as the chat's own label. This is the
    /// store's record of the chat, not a person's catalog action, so it also
    /// titles a side chat that refuses those actions.
    async fn write_title(&self, session: SessionId, text: String) -> Result<()> {
        if self
            .store
            .catalog_entry(session.clone())
            .await?
            .label
            .is_some()
        {
            return Ok(());
        }
        let cwd = session_configuration(&self.store.inspect(session.clone()).await?)?.cwd;
        let Some(title) = self.generate_title(cwd, &text).await? else {
            return Ok(());
        };
        let current = self.store.catalog_entry(session.clone()).await?;
        // A host that shut down while the title was generated no longer
        // writes to the chat.
        if current.label.is_some() || self.work.lock().await.closed {
            return Ok(());
        }
        // The revision check refuses the write if the person renamed meanwhile.
        self.store
            .replace_catalog_entry(CatalogEntry {
                label: Some(title),
                ..current
            })
            .await
            .map(|_| ())
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
            spending: Arc::new(spending::Store::detached(store.clone())),
            store,
            state_dir: None,
            execution: self.execution.clone(),
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
            title_workers: Arc::default(),
            changed: Arc::default(),
            live_updates: broadcast::channel(UPDATE_CAPACITY).0,
            subagent_activity: Arc::default(),
            processes: Arc::default(),
        })
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
