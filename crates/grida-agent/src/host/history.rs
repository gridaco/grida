//! Attached conversation history controls and portable context capture.
//! GRIDA-SEC-004 / GRIDA-SEC-008 separate retained context from execution authority.

use super::*;
use agent_kit_core::messages::ResultContent;
use agent_kit_core::turn::{OperationInput, OperationOutcome};
use agent_kit_store_sqlite::history::{
    HistoryBasis, HistoryRevised, HistoryRevision, HistorySeed, HistorySelection, ReplayCursor,
    ReplayWindow, RetainedHistory, SeededSession,
};
use grida_agent_master::conversation_seed::{
    AUTHORED_INPUT_PREFIX, ConversationAnchor, ConversationCut, ConversationSeed,
    ConversationSource, EDITOR_OBSERVATION_SOURCE, SeedEntry, SeedOmissions, SeedProvenance,
    is_editable_user,
};
use grida_agent_master::history::{model_context, project};
use grida_agent_master::side_chat::inherited_records;
use std::borrow::Cow;

const HISTORY_PAGE: usize = 128;
const HISTORY_PREVIEW_BYTES: usize = 256;
const MAX_HISTORY_OFFSET: usize = 4096;
/// Forked chats followed back when numbering a chat's processes.
const MAX_PROCESS_NUMBER_ANCESTRY: usize = 16;

pub struct HistoryQuery {
    pub session: SessionId,
    pub view: Option<SessionRevision>,
    pub offset: usize,
    pub expected_history: Option<HistoryBasis>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPage {
    pub session_revision: SessionRevision,
    pub basis: HistoryBasis,
    pub messages: Vec<HistoryMessage>,
    pub next_offset: Option<usize>,
    pub latest_anchor: Option<ConversationAnchor>,
    pub seed: Option<HistoryLineage>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryMessage {
    pub anchor: ConversationAnchor,
    pub role: Role,
    pub editable: bool,
    pub preview: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryLineage {
    pub source: ConversationSource,
    pub cut: ConversationCut,
    pub omissions: SeedOmissions,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RevisionTarget {
    session_revision: SessionRevision,
    basis: HistoryBasis,
    anchor: ConversationAnchor,
    text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    effort: Option<EffortPreset>,
    /// The reasoning level the original message was sent with. A revision
    /// sends it again so the edited message keeps its original effort.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    reasoning: Option<agent_kit_core::inference::ReasoningEffort>,
    subsequent_messages: usize,
}

enum RevisionOrigin<'a> {
    Inherited(&'a SeedEntry),
    Turn(&'a TurnId),
}

pub struct ConversationDerivation {
    pub request: ChangeId,
    pub basis: HistoryBasis,
    pub anchor: ConversationAnchor,
}

pub(super) struct PriorContext {
    pub(super) messages: Vec<Message>,
    pub(super) disclosure: Option<String>,
}

#[derive(Default)]
pub(crate) struct TranscriptInputFacts {
    pub(crate) goal_starts: BTreeSet<TurnId>,
    pub(crate) svg_text_selections: BTreeSet<MessageId>,
    pub(crate) display_parts: BTreeMap<MessageId, Vec<message_context::DisplayPart>>,
}

impl Host {
    pub(crate) async fn transcript_window(
        &self,
        session: SessionId,
        before: Option<ReplayCursor>,
        measure: fn(&HistoryRecord) -> usize,
    ) -> Result<ReplayWindow> {
        let side = self.side_parent(&session).await?.is_some();
        let start = seed_start(side.then(|| session.clone()));
        let mut window = self
            .store
            .history_replay_window(session, before, project, measure, start)
            .await?;
        if side {
            // A side chat compacts only its inherited history, so its
            // summary is background like that history and has no place in
            // the side chat's transcript.
            window.turns.retain(|turn| {
                !turn.silent_account.as_ref().is_some_and(|account| {
                    grida_agent_master::compaction::CompactionAccount::from_envelope(account)
                        .is_ok()
                })
            });
        }
        Ok(window)
    }

    /// Where `session`'s transcript begins within its seed. A side chat's
    /// transcript begins at its boundary, after the history it inherited;
    /// any other session shows its whole seed.
    pub(super) async fn transcript_seed_start(
        &self,
        session: &SessionId,
    ) -> Result<impl Fn(&HistorySeed) -> Result<usize> + Send + 'static> {
        let side = self.side_parent(session).await?.map(|_| session.clone());
        Ok(seed_start(side))
    }

    /// How many leading records of `session`'s seed precede its transcript.
    async fn hidden_seed_records(
        &self,
        session: &SessionId,
        seed: Option<&HistorySeed>,
    ) -> Result<usize> {
        match seed {
            Some(seed) => (self.transcript_seed_start(session).await?)(seed),
            None => Ok(0),
        }
    }

    /// The turns among `turns` whose accepted input started a goal. A client
    /// uses this to mark the message that set the goal, including on reopen.
    pub async fn goal_start_turns(
        &self,
        session: SessionId,
        turns: Vec<TurnId>,
    ) -> Result<Vec<TurnId>> {
        let facts = self.transcript_input_facts(session, &turns).await?;
        Ok(turns
            .into_iter()
            .filter(|turn| facts.goal_starts.contains(turn))
            .collect())
    }

    /// Display facts from immutable input captures for the replayed local turns.
    pub(crate) async fn transcript_input_facts(
        &self,
        session: SessionId,
        turns: &[TurnId],
    ) -> Result<TranscriptInputFacts> {
        let mut facts = TranscriptInputFacts::default();
        for turn in turns {
            for input in self
                .store
                .turn_submissions(session.clone(), turn.clone())
                .await?
            {
                if !is_stored_input(&input.payload) {
                    continue;
                }
                let stored: StoredPrompt = decode_input(&input)?;
                if matches!(stored.goal, Some(goals::GoalInput::Start(_))) {
                    facts.goal_starts.insert(turn.clone());
                }
                if stored.editor_svg_target.is_some() {
                    facts
                        .svg_text_selections
                        .insert(prompt_message_id(&input.id)?);
                }
                if let Some(context) = message_context::context(&stored.parts)
                    && !context.display_parts.is_empty()
                {
                    facts
                        .display_parts
                        .insert(prompt_message_id(&input.id)?, context.display_parts.clone());
                }
            }
        }
        Ok(facts)
    }

    pub(crate) async fn fork_latest(
        &self,
        session: SessionId,
        request: ChangeId,
    ) -> Result<SessionId> {
        self.refuse_in_side_chat(&session, side_chats::Refusal::Fork)
            .await?;
        let history = self
            .store
            .retained_history_with(session.clone(), HistorySelection::Current, project)
            .await?;
        let anchor = latest_anchor(&history, 0)
            .ok_or_else(|| problem(ErrorKind::InvalidInput, "history_anchor_missing"))?;
        self.fork_session(
            session,
            ConversationDerivation {
                request,
                basis: history.basis,
                anchor,
            },
        )
        .await
    }

    /// The committed context a turn starts from. A side chat's boundary
    /// follows its inherited history and precedes its own turns.
    pub(super) async fn provider_history(
        &self,
        session: SessionId,
        before_turn: Option<TurnId>,
        side: bool,
    ) -> Result<PriorContext> {
        let execution = self.execution()?;
        let model = execution.config.model.clone();
        let capabilities = execution.provider.capabilities(&model)?;
        let authority = execution.authority.inference.authority.clone();
        let retained = self
            .store
            .context_history_with(session.clone(), before_turn, move |state| {
                model_context_for_route(state, &model, &capabilities, &authority)
            })
            .await?;
        // The boundary follows the records copied from another chat. A
        // revision can fold the side chat's own earlier records into its seed;
        // those keep their origin and stay after the boundary.
        let inherited = match &retained.seed {
            Some(seed) if side => {
                // A side chat summarizes only its inherited history, so an
                // installed summary is entirely background.
                if grida_agent_master::compaction::replacement_coverage(&seed.provenance)?.is_some()
                {
                    seed.records.len()
                } else {
                    inherited_records(&session, &SeedProvenance::decode(&seed.provenance)?)
                }
            }
            _ => 0,
        };
        let (mut messages, omissions, _) = context_material(retained)?;
        if side {
            messages.insert(inherited, grida_agent_master::side_chat::boundary()?);
        }
        Ok(PriorContext {
            messages,
            disclosure: omissions.context_disclosure(),
        })
    }

    /// The highest process number this chat's model context shows: its own
    /// command responses, then those of each chat it was forked from. A chat
    /// first given a process in this host process numbers it above them, so a
    /// restarted host or a fork never repeats a number its model has seen.
    pub(super) async fn process_number_floor(&self, session: &SessionId) -> Result<u64> {
        let mut floor = 0;
        let mut seen = BTreeSet::new();
        let mut next = Some(session.clone());
        while let Some(current) = next.take() {
            if seen.len() >= MAX_PROCESS_NUMBER_ANCESTRY || !seen.insert(current.clone()) {
                break;
            }
            floor = floor.max(self.processes.issued_numbers(&current));
            let retained = match self
                .store
                .context_history_with(current.clone(), None, model_context)
                .await
            {
                Ok(retained) => retained,
                // A source chat deleted since the fork shows nothing more.
                Err(error) if &current != session && error.code == "session_missing" => break,
                Err(error) => return Err(error),
            };
            next = retained
                .seed
                .as_ref()
                .and_then(|seed| SeedProvenance::decode(&seed.provenance).ok())
                .map(|provenance| provenance.source.session)
                .filter(|source| source != &current);
            let (messages, _, _) = context_material(retained)?;
            floor = floor.max(crate::processes::shown_numbers(&messages));
        }
        Ok(floor)
    }

    pub async fn history_page(&self, query: HistoryQuery) -> Result<HistoryPage> {
        if query.offset > MAX_HISTORY_OFFSET
            || (query.offset != 0 && query.expected_history.is_none())
        {
            return Err(problem(ErrorKind::InvalidInput, "invalid_history_page"));
        }
        let retained = self
            .store
            .retained_history_with(
                query.session.clone(),
                query
                    .view
                    .map_or(HistorySelection::Current, HistorySelection::View),
                project,
            )
            .await?;
        if query
            .expected_history
            .as_ref()
            .is_some_and(|basis| basis != &retained.basis)
        {
            return Err(problem(ErrorKind::Conflict, "history_basis_changed"));
        }
        let hidden = self
            .hidden_seed_records(&query.session, retained.seed.as_ref())
            .await?;
        let latest_anchor = latest_anchor(&retained, hidden);
        let inherited = decode_seed(retained.seed)?;
        let lineage = inherited.as_ref().map(|seed| {
            let provenance = seed.provenance();
            HistoryLineage {
                source: provenance.source.clone(),
                cut: provenance.cut.clone(),
                omissions: provenance.omissions(),
            }
        });
        let inherited_messages = inherited.iter().flat_map(|seed| {
            let pairs = seed
                .provenance()
                .entries
                .iter()
                .filter(|entry| entry.message.is_some())
                .zip(seed.records());
            let observed: BTreeSet<_> = pairs
                .clone()
                .filter_map(|(entry, HistoryRecord::Message(message))| {
                    observation_input(message, &entry.origin.message)
                        .map(|input| (&entry.origin.session, &entry.origin.turn, input))
                })
                .collect();
            pairs
                .skip(hidden)
                .filter_map(move |(entry, HistoryRecord::Message(message))| {
                    let origin = &entry.origin;
                    let has_observation = input_suffix(&origin.message, AUTHORED_INPUT_PREFIX)
                        .is_some_and(|input| {
                            observed.contains(&(&origin.session, &origin.turn, input))
                        });
                    history_message(
                        message,
                        ConversationAnchor::Inherited {
                            message: message.id.clone(),
                        },
                        entry.editable && !has_observation,
                    )
                })
        });
        let observed: BTreeSet<_> = retained
            .records
            .iter()
            .filter_map(|item| {
                let HistoryRecord::Message(message) = &item.record;
                observation_input(message, &message.id).map(|input| (&item.turn, input))
            })
            .collect();
        let local = retained.records.iter().filter_map(|item| {
            let HistoryRecord::Message(message) = &item.record;
            let has_observation = input_suffix(&message.id, AUTHORED_INPUT_PREFIX)
                .is_some_and(|input| observed.contains(&(&item.turn, input)));
            history_message(
                message,
                ConversationAnchor::Turn {
                    turn: item.turn.clone(),
                    message: message.id.clone(),
                },
                is_editable_user(message) && !has_observation,
            )
        });
        let mut messages: Vec<_> = inherited_messages
            .chain(local)
            .skip(query.offset)
            .take(HISTORY_PAGE + 1)
            .collect();
        let next_offset = if messages.len() > HISTORY_PAGE {
            messages.pop();
            Some(query.offset + HISTORY_PAGE)
        } else {
            None
        };
        Ok(HistoryPage {
            session_revision: retained.session_revision,
            basis: retained.basis,
            messages,
            next_offset,
            latest_anchor,
            seed: lineage,
        })
    }

    pub(crate) async fn revision_target(
        &self,
        session: SessionId,
        message_id: MessageId,
        expected_revision: SessionRevision,
    ) -> Result<RevisionTarget> {
        let retained = self
            .store
            .retained_history_with(session.clone(), HistorySelection::Current, project)
            .await?;
        if expected_revision != retained.session_revision {
            return Err(problem(ErrorKind::Conflict, "stale_session_revision"));
        }
        let hidden = self
            .hidden_seed_records(&session, retained.seed.as_ref())
            .await?;
        let inherited = decode_seed(retained.seed)?;
        let inherited_messages = inherited.iter().flat_map(|seed| {
            seed.provenance()
                .entries
                .iter()
                .filter(|entry| entry.message.is_some())
                .zip(seed.records())
                .skip(hidden)
                .map(|(entry, HistoryRecord::Message(message))| {
                    (message, RevisionOrigin::Inherited(entry))
                })
        });
        let local = retained.records.iter().map(|item| {
            let HistoryRecord::Message(message) = &item.record;
            (message, RevisionOrigin::Turn(&item.turn))
        });
        let mut selected = None;
        let mut subsequent_messages = 0;
        for (message, origin) in inherited_messages.chain(local) {
            if !visible_message(message) {
                continue;
            }
            if message.id == message_id {
                if selected.replace((message, origin)).is_some() {
                    return Err(problem(ErrorKind::Conflict, "history_anchor_ambiguous"));
                }
            } else if selected.is_some() {
                subsequent_messages += 1;
            }
        }
        let (message, origin) =
            selected.ok_or_else(|| problem(ErrorKind::Unavailable, "history_anchor_missing"))?;
        if !is_editable_user(message) || message_context::has_context(message) {
            return Err(revision_target_unavailable());
        }
        let (anchor, turn, original) = match origin {
            RevisionOrigin::Inherited(entry)
                if entry.editable
                    && entry.origin.session == session
                    && entry.omissions.is_empty() =>
            {
                (
                    ConversationAnchor::Inherited {
                        message: message.id.clone(),
                    },
                    &entry.origin.turn,
                    &entry.origin.message,
                )
            }
            RevisionOrigin::Inherited(_) => return Err(revision_target_unavailable()),
            RevisionOrigin::Turn(turn) => (
                ConversationAnchor::Turn {
                    turn: turn.clone(),
                    message: message.id.clone(),
                },
                turn,
                &message.id,
            ),
        };
        let (text, effort, reasoning) = self
            .original_input(session, turn.clone(), original, message)
            .await?;
        Ok(RevisionTarget {
            session_revision: retained.session_revision,
            basis: retained.basis,
            anchor,
            text,
            effort,
            reasoning,
            subsequent_messages,
        })
    }

    async fn original_input(
        &self,
        session: SessionId,
        turn: TurnId,
        original: &MessageId,
        visible: &Message,
    ) -> Result<(
        String,
        Option<EffortPreset>,
        Option<agent_kit_core::inference::ReasoningEffort>,
    )> {
        for input in self.store.turn_submissions(session, turn).await? {
            if !is_stored_input(&input.payload) {
                continue;
            }
            let stored: StoredPrompt = decode_input(&input)?;
            if stored.goal.is_some()
                || stored.subagent.is_some()
                || !stored
                    .parts
                    .iter()
                    .all(|part| matches!(part, PromptPart::Text { .. }))
            {
                continue;
            }
            let messages = prompt_input(&input.id, &stored.parts)?;
            if !matches!(messages.as_slice(), [message] if &message.id == original && message.content == visible.content)
            {
                continue;
            }
            let text: String = stored
                .parts
                .into_iter()
                .filter_map(|part| match part {
                    PromptPart::Text { text } => Some(text),
                    _ => None,
                })
                .collect();
            if !text.trim().is_empty() {
                return Ok((
                    text,
                    stored.effort.map(|policy| policy.preset()),
                    stored.reasoning,
                ));
            }
        }
        Err(revision_target_unavailable())
    }

    pub async fn fork_session(
        &self,
        source: SessionId,
        derivation: ConversationDerivation,
    ) -> Result<SessionId> {
        self.owned_control(move |host| async move {
            if host.work.lock().await.closed {
                return Err(problem(ErrorKind::Unavailable, "host_shutting_down"));
            }
            host.refuse_in_side_chat(&source, side_chats::Refusal::Fork)
                .await?;
            let fingerprint = Fingerprint::of(&(&source, &derivation.request))?;
            let destination = SessionId::new(format!(
                "fork/{}",
                uuid::Uuid::from_bytes(
                    fingerprint.bytes()[..16]
                        .try_into()
                        .expect("fingerprint prefix")
                )
                .simple()
            ))?;
            let _admission = host.configuration_admission.lock().await;
            let cut = ConversationCut::Through(derivation.anchor);
            let (selection, inheritance) = host
                .prepare_fork_selection(
                    &source,
                    &destination,
                    &derivation.request,
                    Fingerprint::of(&cut)?,
                )
                .await?;
            let configuration = match host.store.inspect(destination.clone()).await {
                Ok(existing) => existing.configuration,
                Err(error) if error.code == "session_missing" => {
                    let source_view = host.store.inspect(source.clone()).await?;
                    let execution = host.execution()?;
                    let configuration = SessionConfiguration {
                        cwd: canonical_workspace(&session_configuration(&source_view)?.cwd)?,
                        execution: execution.configuration,
                        owner: execution.owner,
                        subagent: None,
                        worker: None,
                        side: None,
                    };
                    encode(SESSION_SCHEMA, SESSION_VERSION, &configuration)?
                }
                Err(error) => return Err(error),
            };
            let created = host
                .store
                .create_seeded(
                    SeededSession {
                        create: CreateSession {
                            id: destination,
                            request: derivation.request,
                            configuration,
                        },
                        source: source.clone(),
                        expected_history: derivation.basis,
                        intent: if inheritance {
                            Fingerprint::of(&(&cut, selection))?
                        } else {
                            Fingerprint::of(&cut)?
                        },
                    },
                    project,
                    move |history| lower_seed(source, cut, history),
                )
                .await?;
            host.finish_fork_selection(&created.session).await?;
            Ok(created.session)
        })
        .await
    }

    pub async fn revise_session(
        &self,
        derivation: ConversationDerivation,
        expected_revision: SessionRevision,
        replacement: PromptRequest,
    ) -> Result<HistoryRevised> {
        self.owned_control(move |host| async move {
            prompt_input(&replacement.id, &replacement.parts)?;
            let session = replacement.session.clone();
            // Wait out a settled turn's worker before admission, which that
            // worker's next queued input may need. Idleness is checked below.
            drop(host.settled_work(&session).await);
            let _admission = host.configuration_admission.lock().await;
            let cut = ConversationCut::BeforeEditableUser(derivation.anchor);
            // Read and question capabilities are captured settings of the
            // original acceptance.
            let base = (&cut, &replacement.parts);
            let intent = match (replacement.operating_regime, replacement.effort) {
                (regime, Some(effort)) => Fingerprint::of(&(base, "effort", regime, effort))?,
                (Some(regime), None) => Fingerprint::of(&(base, regime))?,
                (None, None) => Fingerprint::of(&base)?,
            };
            let intent = match replacement.reasoning {
                Some(level) => Fingerprint::of(&(intent, "reasoning", level))?,
                None => intent,
            };
            let previous = host
                .store
                .input(session.clone(), replacement.id.clone())
                .await?;
            let new_input = previous.is_none();
            let input = if let Some(previous) = previous {
                lifecycle::check_input(&previous.input, &replacement.parts)?;
                let settings = InputSettings::for_input(&previous.input)?;
                if settings.allow_library_selection {
                    return Err(problem(
                        ErrorKind::Conflict,
                        "history_revision_library_selection_unavailable",
                    ));
                }
                settings.require_effort(replacement.effort, replacement.reasoning)?;
                previous.input
            } else {
                {
                    let work = host.work.lock().await;
                    if work.closed {
                        return Err(problem(ErrorKind::Unavailable, "host_shutting_down"));
                    }
                    if work.active.contains_key(&session) {
                        return Err(problem(
                            ErrorKind::Conflict,
                            "history_revision_requires_idle",
                        ));
                    }
                }
                let view = host.store.inspect(session.clone()).await?;
                host.check_execution(&view).await?;
                super::goals::require_goal_resolved_for_revision(&view)?;
                if !view.admission_paused {
                    host.check_ready_capacity(&session).await?;
                }
                let policy = host.submission_policy(&replacement, false)?;
                host.capture_input(&view, replacement.id, replacement.parts, policy)
                    .await?
            };
            let revised = host
                .store
                .revise_history(
                    HistoryRevision {
                        session: session.clone(),
                        request: derivation.request,
                        expected_revision,
                        expected_history: derivation.basis,
                        intent,
                        replacement: input,
                    },
                    project,
                    move |history| lower_seed(session, cut, history),
                )
                .await?;
            if new_input {
                host.kick_queue(revised.acceptance.session.clone()).await;
            }
            Ok(revised)
        })
        .await
    }
}

/// A different model route receives the portable conversation, never another
/// route's encrypted continuation or protocol-owned tool-call identities.
/// A different principal or scope also receives portable context, even when
/// the visible model name and provider capabilities are unchanged.
fn model_context_for_route(
    state: &agent_kit_core::turn::TurnState,
    model: &ModelId,
    capabilities: &ModelCapabilities,
    authority: &AuthorityBinding,
) -> Vec<HistoryRecord> {
    let records = model_context(state);
    let visible: BTreeSet<_> = records
        .iter()
        .map(|HistoryRecord::Message(message)| &message.id)
        .collect();
    let changed = state.operations().values().any(|operation| {
        let (OperationInput::Inference(request), Some(OperationOutcome::Inference(outcome))) =
            (&operation.record.input, operation.outcome())
        else {
            return false;
        };
        (request.request().model != *model
            || request.capabilities() != capabilities
            || request.binding().authority.principal != authority.principal
            || request.binding().authority.scope != authority.scope)
            && outcome
                .messages
                .iter()
                .any(|message| visible.contains(&message.id))
    });
    if !changed {
        return records;
    }
    records
        .into_iter()
        .filter_map(|HistoryRecord::Message(mut message)| {
            if !matches!(message.role, Role::Assistant | Role::Tool) {
                return Some(HistoryRecord::Message(message));
            }
            message.content = message
                .content
                .into_iter()
                .filter_map(|part| match part {
                    Content::Text(text) => Some(Content::Text(text)),
                    Content::ToolCall(call) => Some(Content::Text(format!(
                        "Earlier tool call (history only): {}",
                        serde_json::json!({
                            "call": call.id,
                            "tool": call.tool,
                            "arguments": call.arguments,
                        })
                    ))),
                    Content::ToolResult(result) => Some(Content::Text(format!(
                        "Earlier tool result (history only): {}",
                        serde_json::json!({
                            "call": result.call,
                            "status": result.status,
                            "content": result.content.into_iter().map(|part| match part {
                                ResultContent::Text(text) => serde_json::json!({"text": text}),
                                ResultContent::Media(media) => serde_json::json!({
                                    "mediaType": media.media_type,
                                    "omitted": "Media bytes are not portable between model routes.",
                                }),
                            }).collect::<Vec<_>>(),
                            "structured": result.structured,
                            "truncated": result.truncated,
                        })
                    ))),
                    Content::Media(media) => Some(Content::Media(media)),
                    Content::Reasoning(_) | Content::ProviderState(_) => None,
                })
                .collect();
            if message.content.is_empty() {
                return None;
            }
            message.role = Role::Assistant;
            message.provenance = Provenance {
                source: "retained_model_context".into(),
                kind: ProvenanceKind::Transformed,
                fingerprint: None,
            };
            Some(HistoryRecord::Message(message))
        })
        .collect()
}

/// Where a transcript begins within a seed: after the inherited records of
/// `side`, a side session, or at the start for any other session.
fn seed_start(side: Option<SessionId>) -> impl Fn(&HistorySeed) -> Result<usize> + Send + 'static {
    move |seed: &HistorySeed| match &side {
        Some(session) => SeedProvenance::decode(&seed.provenance)
            .map(|provenance| inherited_records(session, &provenance)),
        None => Ok(0),
    }
}

pub(super) fn context_material(
    retained: RetainedHistory,
) -> Result<(Vec<Message>, SeedOmissions, bool)> {
    let (mut records, omissions, compacted) = match retained.seed {
        Some(seed) => {
            if let Some(coverage) =
                grida_agent_master::compaction::replacement_coverage(&seed.provenance)?
            {
                (seed.records, coverage.omissions, true)
            } else {
                let seed = ConversationSeed::from_parts(seed.records, &seed.provenance)?;
                let omissions = seed.provenance().omissions();
                (seed.into_records(), omissions, false)
            }
        }
        None => (Vec::new(), SeedOmissions::default(), false),
    };
    records.extend(retained.records.into_iter().map(|item| item.record));
    Ok((
        records
            .into_iter()
            .map(|HistoryRecord::Message(mut message)| {
                for part in &mut message.content {
                    if let Content::ToolResult(result) = part {
                        // Prior observations keep their description. The current turn
                        // can still replay its verified retained pixels.
                        result.content.retain(|part| {
                            !matches!(part, ResultContent::Media(media)
                                if (media.id.as_str().starts_with(retained_inputs::WORKSPACE_VIEW)
                                    || media.id.as_str().starts_with(retained_inputs::LIBRARY_SELECTION))
                                    && images::is_retained_image(media))
                        });
                    }
                }
                message
            })
            .collect(),
        omissions,
        compacted,
    ))
}

pub(super) fn decode_seed(seed: Option<HistorySeed>) -> Result<Option<ConversationSeed>> {
    seed.map(|seed| ConversationSeed::from_parts(seed.records, &seed.provenance))
        .transpose()
}

pub(super) fn lower_seed(
    session: SessionId,
    cut: ConversationCut,
    history: RetainedHistory,
) -> Result<HistorySeed> {
    let source = ConversationSource {
        session,
        view: history.basis.view.0,
        tail: history.basis.tail.map(|tail| (tail.turn, tail.position)),
        fingerprint: history.basis.fingerprint,
    };
    let (records, provenance) = ConversationSeed::lower(
        source,
        cut,
        decode_seed(history.seed)?,
        history
            .records
            .into_iter()
            .map(|item| (item.turn, item.position, item.record)),
    )?
    .into_parts()?;
    Ok(HistorySeed {
        records,
        provenance,
    })
}

/// Authored messages and their separate observations share the same input suffix.
fn input_suffix<'a>(message: &'a MessageId, source: &str) -> Option<&'a str> {
    let (prefix, input) = message.as_str().split_once('/')?;
    (prefix == source).then_some(input)
}

fn observation_input<'a>(message: &Message, original: &'a MessageId) -> Option<&'a str> {
    if !super::editor_observation::is_observation(message) {
        return None;
    }
    input_suffix(original, EDITOR_OBSERVATION_SOURCE)
}

fn history_message(
    message: &Message,
    anchor: ConversationAnchor,
    editable: bool,
) -> Option<HistoryMessage> {
    if !matches!(message.role, Role::User | Role::Assistant)
        || message_context::is_supplemental(message)
    {
        return None;
    }
    if super::editor_observation::is_observation(message) {
        return Some(HistoryMessage {
            anchor,
            role: message.role,
            editable: false,
            preview: "Editor context".into(),
        });
    }
    let mut text = message.content.iter().filter_map(|part| match part {
        Content::Text(value) if !value.is_empty() => Some(Cow::Borrowed(value.as_str())),
        Content::Media(media) if is_retained_image(media) => {
            Some(Cow::Borrowed(RETAINED_IMAGE_LABEL))
        }
        Content::Media(media) => grida_agent_master::retained_file::display(media)
            .or_else(|| attachment_label(media))
            .map(Cow::Owned),
        _ => None,
    });
    let first = text.next().or_else(|| {
        message_context::has_context(message).then_some(Cow::Borrowed("Message context"))
    })?;
    let mut preview = String::new();
    for piece in std::iter::once(first).chain(text) {
        let remaining = HISTORY_PREVIEW_BYTES.saturating_sub(preview.len());
        preview.push_str(&piece[..piece.floor_char_boundary(remaining)]);
        if piece.len() >= remaining {
            break;
        }
    }
    Some(HistoryMessage {
        anchor,
        role: message.role,
        editable: editable && !message_context::has_context(message),
        preview,
    })
}

fn visible_message(message: &Message) -> bool {
    matches!(message.role, Role::User | Role::Assistant)
        && !message_context::is_supplemental(message)
        && (message_context::has_context(message) || message.content.iter().any(|part| {
            matches!(part, Content::Text(text) if !text.is_empty())
                || matches!(part, Content::Media(media) if is_retained_image(media))
                || matches!(part, Content::Media(media) if grida_agent_master::retained_file::display(media).is_some())
                || matches!(part, Content::Media(media) if grida_agent_master::file_reference::reference(media).is_some())
        }))
}

/// A resource attached by reference, named in a history preview without its path.
fn attachment_label(media: &agent_kit_core::messages::MediaRef) -> Option<String> {
    grida_agent_master::file_reference::reference(media).map(|reference| {
        let kind = if reference.mime_type.as_deref()
            == Some(grida_agent_master::file_reference::DIRECTORY_MEDIA_TYPE)
        {
            "folder"
        } else {
            "file"
        };
        format!("\n\nAttached {kind} {}.", reference.name)
    })
}

fn revision_target_unavailable() -> Error {
    problem(
        ErrorKind::Unsupported,
        "history_revision_target_unavailable",
    )
}

/// The newest visible message of `history`, among its own turns or the seed
/// records after the first `hidden`.
pub(super) fn latest_anchor(
    history: &RetainedHistory,
    hidden: usize,
) -> Option<ConversationAnchor> {
    history
        .records
        .iter()
        .rev()
        .find_map(|item| {
            let HistoryRecord::Message(message) = &item.record;
            visible_message(message).then(|| ConversationAnchor::Turn {
                turn: item.turn.clone(),
                message: message.id.clone(),
            })
        })
        .or_else(|| {
            history
                .seed
                .as_ref()?
                .records
                .iter()
                .skip(hidden)
                .rev()
                .find_map(|record| {
                    let HistoryRecord::Message(message) = record;
                    visible_message(message).then(|| ConversationAnchor::Inherited {
                        message: message.id.clone(),
                    })
                })
        })
}
