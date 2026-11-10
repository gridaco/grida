//! Attached conversation history controls and portable context capture.
//! GRIDA-SEC-004 separates retained context from workspace and execution authority.

use super::*;
use agent_kit_store_sqlite::history::{
    HistoryBasis, HistoryRevised, HistoryRevision, HistorySeed, HistorySelection, RetainedHistory,
    SeededSession,
};
use grida_agent_master::conversation_seed::{
    ConversationAnchor, ConversationCut, ConversationSeed, ConversationSource, SeedOmissions,
    is_editable_user,
};
use grida_agent_master::history::project;

const HISTORY_PAGE: usize = 128;
const HISTORY_PREVIEW_BYTES: usize = 256;
const MAX_HISTORY_OFFSET: usize = 4096;

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

pub struct ConversationDerivation {
    pub request: ChangeId,
    pub basis: HistoryBasis,
    pub anchor: ConversationAnchor,
}

pub(super) struct PriorContext {
    pub(super) messages: Vec<Message>,
    pub(super) disclosure: Option<String>,
}

impl Host {
    pub(crate) async fn fork_latest(
        &self,
        session: SessionId,
        request: ChangeId,
    ) -> Result<SessionId> {
        let history = self
            .store
            .retained_history_with(session.clone(), HistorySelection::Current, project)
            .await?;
        let anchor = history
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
                history.seed.as_ref().and_then(|seed| {
                    seed.records.iter().rev().find_map(|record| {
                        let HistoryRecord::Message(message) = record;
                        visible_message(message).then(|| ConversationAnchor::Inherited {
                            message: message.id.clone(),
                        })
                    })
                })
            })
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

    pub(super) async fn provider_history(
        &self,
        session: SessionId,
        before_turn: Option<TurnId>,
    ) -> Result<PriorContext> {
        let retained = self
            .store
            .context_history_with(session, before_turn, project)
            .await?;
        let (mut messages, omissions, _) = context_material(retained)?;
        if let Some(context) = &self.side_context {
            messages.insert(0, context.background.clone());
        }
        Ok(PriorContext {
            messages,
            disclosure: omissions.context_disclosure(),
        })
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
                query.session,
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
            seed.provenance()
                .entries
                .iter()
                .filter(|entry| entry.message.is_some())
                .zip(seed.records())
                .filter_map(|(entry, HistoryRecord::Message(message))| {
                    history_message(
                        message,
                        ConversationAnchor::Inherited {
                            message: message.id.clone(),
                        },
                        entry.editable,
                    )
                })
        });
        let local = retained.records.iter().filter_map(|item| {
            let HistoryRecord::Message(message) = &item.record;
            history_message(
                message,
                ConversationAnchor::Turn {
                    turn: item.turn.clone(),
                    message: message.id.clone(),
                },
                is_editable_user(message),
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
            seed: lineage,
        })
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
            let configuration = match host.store.inspect(destination.clone()).await {
                Ok(existing) => existing.configuration,
                Err(error) if error.code == "session_missing" => {
                    let source_view = host.store.inspect(source.clone()).await?;
                    let configuration = SessionConfiguration {
                        cwd: canonical_workspace(&session_configuration(&source_view)?.cwd)?,
                        execution: host.execution()?.configuration,
                    };
                    encode(SESSION_SCHEMA, 2, &configuration)?
                }
                Err(error) => return Err(error),
            };
            let cut = ConversationCut::Through(derivation.anchor);
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
                        intent: Fingerprint::of(&cut)?,
                    },
                    project,
                    move |history| lower_seed(source, cut, history),
                )
                .await?;
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
            let _admission = host.configuration_admission.lock().await;
            let session = replacement.session.clone();
            let cut = ConversationCut::BeforeEditableUser(derivation.anchor);
            // The explicit write opt-in is caller intent. Read and question
            // capabilities are captured settings of the original acceptance.
            let base = (
                &cut,
                &replacement.parts,
                replacement.configuration_permission == crate::ConfigurationPermission::Change,
            );
            let intent = match replacement.operating_regime {
                Some(regime) => Fingerprint::of(&(base, regime))?,
                None => Fingerprint::of(&base)?,
            };
            let previous = host
                .store
                .input(session.clone(), replacement.id.clone())
                .await?;
            let new_input = previous.is_none();
            let input = if let Some(previous) = previous {
                lifecycle::check_input(&previous.input, &replacement.parts)?;
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
                host.check_execution(&view)?;
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
            .map(|HistoryRecord::Message(message)| message)
            .collect(),
        omissions,
        compacted,
    ))
}

fn decode_seed(seed: Option<HistorySeed>) -> Result<Option<ConversationSeed>> {
    seed.map(|seed| ConversationSeed::from_parts(seed.records, &seed.provenance))
        .transpose()
}

fn lower_seed(
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

fn history_message(
    message: &Message,
    anchor: ConversationAnchor,
    editable: bool,
) -> Option<HistoryMessage> {
    if !matches!(message.role, Role::User | Role::Assistant) {
        return None;
    }
    let mut text = message.content.iter().filter_map(|part| match part {
        Content::Text(value) if !value.is_empty() => Some(value.as_str()),
        Content::Media(media) if is_retained_image(media) => Some(RETAINED_IMAGE_LABEL),
        _ => None,
    });
    let first = text.next()?;
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
        editable,
        preview,
    })
}

fn visible_message(message: &Message) -> bool {
    matches!(message.role, Role::User | Role::Assistant)
        && message.content.iter().any(|part| {
            matches!(part, Content::Text(text) if !text.is_empty())
                || matches!(part, Content::Media(media) if is_retained_image(media))
        })
}
