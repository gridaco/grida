//! GRIDA-SEC-004 — Automatic chat titles from the first request.
//!
//! An untitled chat gets a short title from its first text request. A
//! temporary, tool-free conversation writes it while the first turn runs, and
//! it is saved only if the chat is still untitled at the same catalogue
//! revision, so a person's rename always wins.

use super::*;
use agent_kit_core::messages::OutcomeStatus;
use grida_agent_master::conversation_seed::SeedOmissions;
use grida_agent_master::read_account;
use grida_agent_master::side_context::SideContext;

const TITLE_INSTRUCTIONS: &str = include_str!("../prompts/title.md");
/// The request text a title reads, so a long first request stays cheap.
const MAX_REQUEST_BYTES: usize = 960;
const MAX_TITLE_CHARS: usize = 50;
const TITLE_TIMEOUT: Duration = Duration::from_secs(60);

impl Host {
    /// Title untitled chats. A client opts in at launch: the title costs one
    /// model request, which a one-shot run or a scripted provider does not
    /// expect. Temporary hosts (side chat, titler) never title.
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
            || self.side_context.is_some()
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
        let host = self.clone();
        tokio::spawn(async move {
            // A title is a convenience; failure leaves the chat untitled.
            let _ = tokio::time::timeout(TITLE_TIMEOUT, host.write_title(session, text)).await;
        });
    }

    async fn write_title(&self, session: SessionId, text: String) -> Result<()> {
        if self.catalog_entry(session.clone()).await?.label.is_some() {
            return Ok(());
        }
        let cwd = session_configuration(&self.store.inspect(session.clone()).await?)?.cwd;
        let Some(title) = self.generate_title(cwd, &text).await? else {
            return Ok(());
        };
        let current = self.catalog_entry(session.clone()).await?;
        if current.label.is_some() {
            return Ok(());
        }
        // The revision check refuses the write if the person renamed meanwhile.
        self.organize_session(
            session,
            current.revision,
            Some(title),
            catalog::is_archived(&current),
        )
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
                configuration_permission: crate::ConfigurationPermission::Disabled,
                operating_regime: None,
                effort: None,
                reasoning: Default::default(),
            })
            .await;
        let title = match run {
            Ok(run) => match run.completion.await {
                Ok(Ok(RunResult::Settled(outcome)))
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
        let context = Arc::new(SideContext::capture(
            Vec::new(),
            Fingerprint::of(&"chat-title")?,
            SeedOmissions::default(),
        )?);
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
            side_context: Some(context),
            #[cfg(unix)]
            guidance_root: None,
            configuration_admission: Arc::default(),
            controls: Arc::new(Semaphore::new(MAX_OWNED_CONTROLS)),
            work: Arc::default(),
            wake_lock: Arc::default(),
            workers: Arc::default(),
            changed: Arc::default(),
            live_updates: broadcast::channel(UPDATE_CAPACITY).0,
        })
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
