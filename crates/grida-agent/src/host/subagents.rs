//! GRIDA-SEC-004 — parent-scoped, independently authorized child assignments.

use super::*;
use agent_kit_sessions::InputView;
use agent_kit_store_sqlite::InputObservation;
use agent_kit_store_sqlite::catalog::CatalogPage;
use grida_agent_master::subagents::{self, Allocation, Assignment, Profile};

const MESSAGE_SCHEMA: &str = "grida.agent.subagent.message";
const MAX_PENDING_MESSAGES: usize = 16;
const MAX_MESSAGE_BYTES: usize = 4 * 1024;
const MAX_INSTRUCTION_PREVIEW_BYTES: usize = 1024;

pub struct SubagentInspection {
    pub parent: SessionId,
    pub child: SessionId,
    pub name: String,
    pub allocation: Allocation,
    pub revision: SessionRevision,
    pub admission_paused: bool,
    pub queued: Vec<ChangeId>,
    pub pending_messages: Vec<ChangeId>,
    pub current: Option<TurnView>,
    pub latest: Option<TurnView>,
    pub assignment: Option<SubagentWork>,
    pub observed_assignment: Option<SubagentWork>,
    pub message: Option<SubagentMessageReceipt>,
}

pub struct SubagentWork {
    pub input: ChangeId,
    pub parent_turn: TurnId,
    pub max_generation_steps: u32,
    pub disposition: InputDisposition,
    pub turn: Option<TurnView>,
    pub message_inputs: Vec<ChangeId>,
    pub instruction_preview: String,
    pub instruction_truncated: bool,
}

pub struct SubagentAssignment {
    pub parent: SessionId,
    pub child: SessionId,
    pub parent_turn: TurnId,
    pub input: ChangeId,
    pub instructions: String,
}

pub struct SubagentMessage {
    pub parent: SessionId,
    pub child: SessionId,
    pub input: ChangeId,
    pub text: String,
}

pub struct SubagentMessageReceipt {
    pub parent: SessionId,
    pub child: SessionId,
    pub input: ChangeId,
    pub position: u64,
    pub disposition: InputDisposition,
    pub text: String,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct RetainedMessage {
    parent: SessionId,
    text: String,
}

impl Host {
    /// Allow the trusted private launcher to own bounded inference-only
    /// children. This adds no model-facing delegation authority.
    pub fn with_subagents(mut self) -> Self {
        self.subagents_enabled = true;
        self
    }

    pub(crate) fn subagents_available(&self) -> bool {
        self.subagents_enabled
            && self.operating_regime.is_act()
            && self.side_context.is_none()
            && self
                .execution
                .as_ref()
                .is_some_and(|execution| execution.config.max_output_tokens.is_some())
    }

    pub(crate) async fn list_subagents(
        &self,
        parent: &SessionId,
        after: Option<SessionId>,
    ) -> Result<CatalogPage<(SessionId, String)>> {
        self.require_subagents()?;
        let page = self
            .store
            .list_catalog_configurations(catalog::child_scope(parent)?, 0, after)
            .await?;
        let entries = page
            .entries
            .into_iter()
            .map(|(child, configuration)| {
                let profile = child_profile(parent, &configuration)?;
                Ok((child, profile.name().to_owned()))
            })
            .collect::<Result<_>>()?;
        Ok(CatalogPage {
            entries,
            next_after: page.next_after,
        })
    }

    pub async fn create_subagent(
        &self,
        parent: SessionId,
        request: ChangeId,
        name: String,
        work_turns: u8,
    ) -> Result<SessionId> {
        self.owned_control(move |host| async move {
            host.require_subagents()?;
            let _admission = host.configuration_admission.lock().await;
            let view = host.store.inspect(parent.clone()).await?;
            host.check_execution(&view)?;
            let mut configuration = session_configuration(&view)?;
            if configuration.subagent.is_some() {
                return Err(problem(
                    ErrorKind::Unsupported,
                    "subagent_delegation_unavailable",
                ));
            }
            let execution = host.execution()?;
            let profile = Profile::new(
                parent,
                name,
                work_turns,
                &execution.authority.inference.authority,
            )?;
            let child = profile.identity(&request)?;
            configuration.execution = execution.configuration;
            configuration.subagent = Some(profile);
            host.store
                .create(CreateSession {
                    id: child.clone(),
                    request,
                    configuration: encode(SESSION_SCHEMA, 2, &configuration)?,
                })
                .await?;
            Ok(child)
        })
        .await
    }

    pub async fn assign_subagent(&self, assignment: SubagentAssignment) -> Result<SubagentWork> {
        self.owned_control(move |host| async move { host.accept_assignment(assignment).await })
            .await
    }

    async fn accept_assignment(&self, assignment: SubagentAssignment) -> Result<SubagentWork> {
        self.require_subagents()?;
        subagents::validate_assignment(&assignment.instructions)?;
        let SubagentAssignment {
            parent,
            child,
            parent_turn,
            input,
            instructions,
        } = assignment;
        let _admission = self.configuration_admission.lock().await;
        let (view, previous) = self
            .store
            .inspect_with_input(child.clone(), input.clone())
            .await
            .map_err(child_observation_error)?;
        let profile = child_profile(&parent, &view.configuration)?;
        let (instruction_preview, instruction_truncated) = assignment_preview(&instructions);
        let parts = vec![PromptPart::Text { text: instructions }];
        if let Some(previous) = previous {
            if is_message(&previous.input.input) {
                return Err(problem(
                    ErrorKind::Conflict,
                    "subagent_assignment_identity_reused",
                ));
            }
            let stored: StoredPrompt = decode_input(&previous.input.input)?;
            if !images::same_prompt(&stored.parts, &parts)
                || stored
                    .subagent
                    .as_ref()
                    .map(|assignment| &assignment.parent_turn)
                    != Some(&parent_turn)
            {
                return Err(problem(
                    ErrorKind::Conflict,
                    "subagent_assignment_identity_reused",
                ));
            }
            if previous.input.disposition == InputDisposition::Queued
                && self.check_execution(&view).is_ok()
                && profile
                    .require_authority(&self.execution()?.authority.inference.authority)
                    .is_ok()
            {
                self.kick_queue(child.clone()).await;
            }
            return self.subagent_work(child, previous, stored).await;
        }

        self.check_execution(&view)?;
        profile.require_authority(&self.execution()?.authority.inference.authority)?;
        let allocation = profile.allocation(&view.driver_state)?;
        if usize::from(allocation.reserved)
            + view
                .queued
                .iter()
                .filter(|input| !is_message(&input.input))
                .count()
            >= usize::from(allocation.work_turns)
        {
            return Err(problem(
                ErrorKind::LimitExceeded,
                "subagent_allocation_exhausted",
            ));
        }
        self.validate_subagent_sponsor(&parent, &parent_turn)
            .await?;
        if view.current.is_none() && !view.admission_paused {
            self.check_ready_capacity(&child).await?;
        }
        let mut submission = self
            .capture_input(
                &view,
                input.clone(),
                parts,
                SubmissionPolicy {
                    questions: false,
                    configuration_permission: crate::ConfigurationPermission::Disabled,
                    allow_wakeups: false,
                    allow_library_selection: false,
                    allow_host_tools: false,
                    desktop_image_generation: None,
                    allow_image_placement: false,
                    editor_endpoint: None,
                    editor_presentation: false,
                    editor_svg_target: None,
                    operating_regime: OperatingRegime::Act,
                    subagent: Some(Assignment::new(parent_turn.clone())),
                    effort: None,
                    reasoning: Default::default(),
                },
            )
            .await?;
        let parent_inputs = self
            .store
            .turn_submissions(parent.clone(), parent_turn.clone())
            .await?;
        if let [parent_input] = parent_inputs.as_slice()
            && parent_input.payload.schema().as_str() == INPUT_SCHEMA
            && matches!(parent_input.payload.version(), 2 | 3)
        {
            let captured: StoredPrompt = decode_input(parent_input)?;
            if captured.spending.is_some() {
                let mut child: StoredPrompt = decode_input(&submission)?;
                child.spending = captured.spending;
                submission.payload = encode_stored_prompt(&child)?;
            }
        }
        self.store
            .submit_at_revision(child.clone(), submission, view.revision)
            .await?;
        self.kick_queue(child).await;
        Ok(SubagentWork {
            input,
            parent_turn,
            max_generation_steps: subagents::INFERENCE_STEPS_PER_ASSIGNMENT,
            disposition: InputDisposition::Queued,
            turn: None,
            message_inputs: Vec::new(),
            instruction_preview,
            instruction_truncated,
        })
    }

    /// Retain an informational input without scheduling or steering a turn.
    pub async fn send_subagent_message(
        &self,
        message: SubagentMessage,
    ) -> Result<SubagentMessageReceipt> {
        self.owned_control(move |host| async move { host.accept_subagent_message(message).await })
            .await
    }

    async fn accept_subagent_message(
        &self,
        message: SubagentMessage,
    ) -> Result<SubagentMessageReceipt> {
        self.require_subagents()?;
        let SubagentMessage {
            parent,
            child,
            input,
            text,
        } = message;
        validate_message(&text)?;
        let retained = RetainedMessage {
            parent: parent.clone(),
            text,
        };
        let submission = Submission {
            id: input.clone(),
            payload: encode(MESSAGE_SCHEMA, 1, &retained)?,
        };
        let _admission = self.configuration_admission.lock().await;
        let (view, previous) = self
            .store
            .inspect_with_input(child.clone(), input.clone())
            .await
            .map_err(child_observation_error)?;
        let profile = child_profile(&parent, &view.configuration)?;
        if let Some(previous) = previous {
            if previous.input.input != submission {
                return Err(problem(
                    ErrorKind::Conflict,
                    "subagent_message_identity_reused",
                ));
            }
            return Ok(message_receipt(child, previous.input, retained));
        }
        self.check_execution(&view)?;
        profile.require_authority(&self.execution()?.authority.inference.authority)?;
        if view
            .queued
            .iter()
            .filter(|input| is_message(&input.input))
            .count()
            >= MAX_PENDING_MESSAGES
        {
            return Err(problem(
                ErrorKind::LimitExceeded,
                "subagent_message_queue_limit",
            ));
        }
        let accepted = self
            .store
            .submit_at_revision(child.clone(), submission, view.revision)
            .await?;
        Ok(SubagentMessageReceipt {
            parent,
            child,
            input,
            position: accepted.position,
            disposition: InputDisposition::Queued,
            text: retained.text,
        })
    }

    pub(super) async fn subagent_work(
        &self,
        child: SessionId,
        accepted: InputObservation,
        stored: StoredPrompt,
    ) -> Result<SubagentWork> {
        let message_inputs = if let Some(turn) = &accepted.turn {
            self.store
                .turn_submissions(child, turn.binding.turn.clone())
                .await?
                .into_iter()
                .filter(is_message)
                .map(|message| message.id)
                .collect()
        } else {
            Vec::new()
        };
        describe_assignment(
            accepted.input.input.id,
            accepted.input.disposition,
            accepted.turn,
            stored,
            message_inputs,
        )
    }

    async fn observed_subagent_work(&self, view: &SessionView) -> Result<Option<SubagentWork>> {
        let Some(turn) = view.current.as_ref().or(view.latest.as_ref()) else {
            return Ok(None);
        };
        let selected = self
            .store
            .turn_submissions(view.session.clone(), turn.binding.turn.clone())
            .await?;
        let input = assignment_input(&selected, true)?;
        let turn_id = turn.binding.turn.clone();
        let disposition = if turn.disposition == TurnDisposition::Settled {
            InputDisposition::Completed { turn: turn_id }
        } else {
            InputDisposition::Claimed { turn: turn_id }
        };
        describe_assignment(
            input.id.clone(),
            disposition,
            Some(turn.clone()),
            decode_input(input)?,
            selected
                .iter()
                .filter(|item| is_message(item))
                .map(|item| item.id.clone())
                .collect(),
        )
        .map(Some)
    }

    async fn validate_subagent_sponsor(&self, parent: &SessionId, turn: &TurnId) -> Result<()> {
        let sponsor = self
            .store
            .inspect_turn(parent.clone(), turn.clone())
            .await?;
        if sponsor.disposition != TurnDisposition::Settled {
            return Err(problem(ErrorKind::Conflict, "subagent_sponsor_unsettled"));
        }
        let inputs = self
            .store
            .turn_submissions(parent.clone(), turn.clone())
            .await?;
        let [input] = inputs.as_slice() else {
            return Err(problem(
                ErrorKind::Unsupported,
                "subagent_sponsor_unavailable",
            ));
        };
        if !InputSettings::for_input(input)?.operating_regime.is_act() {
            return Err(problem(
                ErrorKind::Unsupported,
                "subagent_sponsor_requires_act",
            ));
        }
        Ok(())
    }

    pub async fn inspect_subagent(
        &self,
        parent: SessionId,
        child: SessionId,
        input: Option<ChangeId>,
    ) -> Result<SubagentInspection> {
        self.require_subagents()?;
        let observe_assignment = input.is_none();
        let (view, profile, assignment, message) = match input {
            Some(input) => {
                let (view, accepted) = self
                    .store
                    .inspect_with_input(child.clone(), input)
                    .await
                    .map_err(child_observation_error)?;
                let profile = child_profile(&parent, &view.configuration)?;
                let accepted = accepted.ok_or_else(|| {
                    problem(ErrorKind::Unavailable, "subagent_assignment_unavailable")
                })?;
                if is_message(&accepted.input.input) {
                    let retained = read_message(profile.parent(), &accepted.input.input)?;
                    (
                        view,
                        profile,
                        None,
                        Some(message_receipt(child.clone(), accepted.input, retained)),
                    )
                } else {
                    let stored: StoredPrompt = decode_input(&accepted.input.input)?;
                    let work = self.subagent_work(child.clone(), accepted, stored).await?;
                    (view, profile, Some(work), None)
                }
            }
            None => {
                let (view, profile) = self.subagent_view(&parent, child.clone()).await?;
                (view, profile, None, None)
            }
        };
        let observed_assignment = if observe_assignment {
            self.observed_subagent_work(&view).await?
        } else {
            None
        };
        Ok(SubagentInspection {
            parent,
            child,
            name: profile.name().to_owned(),
            allocation: profile.allocation(&view.driver_state)?,
            revision: view.revision,
            admission_paused: view.admission_paused,
            queued: view
                .queued
                .iter()
                .filter(|input| !is_message(&input.input))
                .map(|input| input.input.id.clone())
                .collect(),
            pending_messages: view
                .queued
                .into_iter()
                .filter(|input| is_message(&input.input))
                .map(|input| input.input.id)
                .collect(),
            current: view.current,
            latest: view.latest,
            assignment,
            observed_assignment,
            message,
        })
    }

    pub async fn pause_subagent(
        &self,
        parent: SessionId,
        control: TurnControl,
    ) -> Result<ControlReceipt> {
        self.child_for_control(&parent, &control.session).await?;
        self.pause(control).await
    }

    pub async fn resume_subagent(
        &self,
        parent: SessionId,
        control: TurnControl,
        epoch: u64,
        position: JournalPosition,
    ) -> Result<TurnView> {
        self.child_for_control(&parent, &control.session)
            .await?
            .require_authority(&self.execution()?.authority.inference.authority)?;
        self.resume(control, epoch, position).await
    }

    pub async fn steer_subagent(
        &self,
        parent: SessionId,
        control: TurnControl,
        expected_history: HistoryPosition,
        instructions: String,
    ) -> Result<ControlReceipt> {
        subagents::validate_assignment(&instructions)?;
        self.child_for_control(&parent, &control.session)
            .await?
            .require_authority(&self.execution()?.authority.inference.authority)?;
        self.steer(
            control,
            expected_history,
            vec![PromptPart::Text { text: instructions }],
        )
        .await
    }

    /// Stop the active assignment and close advancement of its queue.
    pub async fn stop_subagent(
        &self,
        parent: SessionId,
        control: TurnControl,
    ) -> Result<ControlReceipt> {
        self.child_for_control(&parent, &control.session).await?;
        let stopped = self
            .stop(
                control.session.clone(),
                control.turn.clone(),
                control.request.clone(),
                control.expected_session,
                control.expected_control,
            )
            .await;
        if !matches!(&stopped, Err(error) if error.code == "request_identity_reused") {
            return stopped;
        }
        // A retained receipt may predate queued child assignments. This
        // request already has a receipt, so the fallback can only replay it.
        self.owned_control(move |host| async move {
            let previous = host
                .store
                .control(ControlRequest {
                    id: control.request,
                    session: control.session.clone(),
                    expected_revision: control.expected_session,
                    action: SessionControl::Turn {
                        turn: control.turn.clone(),
                        expected: control.expected_control,
                        directive: ControlDirective::Cancel,
                    },
                })
                .await?;
            host.kick_stopped(control.session, control.turn).await;
            Ok(previous)
        })
        .await
    }

    pub async fn resume_subagent_queue(
        &self,
        parent: SessionId,
        child: SessionId,
        request: ChangeId,
        expected: SessionRevision,
    ) -> Result<ControlReceipt> {
        self.child_for_control(&parent, &child)
            .await?
            .require_authority(&self.execution()?.authority.inference.authority)?;
        self.resume_queue(child, request, expected).await
    }

    pub async fn withdraw_subagent_input(
        &self,
        parent: SessionId,
        child: SessionId,
        request: ChangeId,
        expected: SessionRevision,
        input: ChangeId,
    ) -> Result<ControlReceipt> {
        self.child_for_control(&parent, &child).await?;
        self.edit_queue(child, request, expected, QueueEdit::Withdraw { input })
            .await
    }

    async fn child_for_control(&self, parent: &SessionId, child: &SessionId) -> Result<Profile> {
        self.require_subagents()?;
        self.subagent_view(parent, child.clone())
            .await
            .map(|(_, profile)| profile)
    }

    fn require_subagents(&self) -> Result<()> {
        if !self.subagents_available() {
            return Err(problem(ErrorKind::Unsupported, "subagents_unavailable"));
        }
        Ok(())
    }

    async fn subagent_view(
        &self,
        parent: &SessionId,
        child: SessionId,
    ) -> Result<(SessionView, Profile)> {
        let view = self
            .store
            .inspect(child)
            .await
            .map_err(child_observation_error)?;
        let profile = child_profile(parent, &view.configuration)?;
        Ok((view, profile))
    }
}

fn child_observation_error(error: Error) -> Error {
    if error.code == "session_missing" {
        problem(ErrorKind::Unavailable, "subagent_unavailable")
    } else {
        error
    }
}

pub(super) fn child_profile(parent: &SessionId, configuration: &Envelope) -> Result<Profile> {
    decode_session_configuration(configuration)?
        .subagent
        .filter(|profile| profile.parent() == parent)
        .ok_or_else(|| problem(ErrorKind::Unavailable, "subagent_unavailable"))
}

pub(super) fn turn_link(
    configuration: &Envelope,
    input: &Envelope,
) -> Result<agent_kit_store_sqlite::turn_links::TurnLinkDecision> {
    use agent_kit_store_sqlite::turn_links::{TurnLinkDecision, TurnLinkParent};

    if configuration.schema().as_str() != SESSION_SCHEMA
        || input.schema().as_str() == MESSAGE_SCHEMA
    {
        return Ok(TurnLinkDecision::Unrelated);
    }
    let Some(profile) = (match decode_session_configuration(configuration) {
        Ok(configuration) => configuration.subagent,
        Err(_) => return Ok(incomplete_turn_link(configuration)),
    }) else {
        return Ok(TurnLinkDecision::Unrelated);
    };
    if profile.sponsorship().is_some() {
        return Ok(TurnLinkDecision::Unrelated);
    }
    #[derive(Deserialize)]
    struct RetainedAssignment {
        subagent: Option<Assignment>,
    }
    let assignment = (input.schema().as_str() == INPUT_SCHEMA && matches!(input.version(), 1..=3))
        .then(|| serde_json::from_slice::<RetainedAssignment>(input.bytes()).ok())
        .flatten()
        .and_then(|stored| stored.subagent);
    if assignment
        .as_ref()
        .is_some_and(|assignment| assignment.named_sponsorship.is_some())
    {
        return Ok(TurnLinkDecision::Unrelated);
    }
    Ok(TurnLinkDecision::Linked(TurnLinkParent {
        session: profile.parent().clone(),
        turn: assignment.map(|assignment| assignment.parent_turn),
    }))
}

fn incomplete_turn_link(
    configuration: &Envelope,
) -> agent_kit_store_sqlite::turn_links::TurnLinkDecision {
    use agent_kit_store_sqlite::turn_links::{TurnLinkDecision, TurnLinkParent};
    #[derive(Deserialize)]
    struct HistoricalProfile {
        subagent: Option<HistoricalChild>,
    }
    #[derive(Deserialize)]
    struct HistoricalChild {
        parent: SessionId,
    }
    match serde_json::from_slice::<HistoricalProfile>(configuration.bytes()) {
        Ok(HistoricalProfile {
            subagent: Some(child),
        }) => TurnLinkDecision::Linked(TurnLinkParent {
            session: child.parent,
            turn: None,
        }),
        Ok(HistoricalProfile { subagent: None }) if matches!(configuration.version(), 1 | 2) => {
            TurnLinkDecision::Unrelated
        }
        _ => TurnLinkDecision::CoverageUnknown,
    }
}

fn assignment_preview(text: &str) -> (String, bool) {
    let end = text.floor_char_boundary(MAX_INSTRUCTION_PREVIEW_BYTES);
    (text[..end].to_owned(), end < text.len())
}

fn describe_assignment(
    input: ChangeId,
    disposition: InputDisposition,
    turn: Option<TurnView>,
    stored: StoredPrompt,
    message_inputs: Vec<ChangeId>,
) -> Result<SubagentWork> {
    let assignment = stored
        .subagent
        .ok_or_else(|| problem(ErrorKind::InvalidState, "subagent_assignment_missing"))?;
    let max_generation_steps = stored
        .max_steps
        .ok_or_else(|| problem(ErrorKind::InvalidState, "subagent_assignment_limit_missing"))?;
    let [PromptPart::Text { text }] = stored.parts.as_slice() else {
        return Err(problem(
            ErrorKind::InvalidState,
            "subagent_assignment_text_missing",
        ));
    };
    let (instruction_preview, instruction_truncated) = assignment_preview(text);
    Ok(SubagentWork {
        input,
        parent_turn: assignment.parent_turn,
        max_generation_steps,
        disposition,
        turn,
        message_inputs,
        instruction_preview,
        instruction_truncated,
    })
}

pub(super) fn is_message(input: &Submission) -> bool {
    input.payload.schema().as_str() == MESSAGE_SCHEMA
}

pub(super) fn queued_work(view: &SessionView) -> Option<&Submission> {
    view.queued
        .iter()
        .map(|input| &input.input)
        .find(|input| !is_message(input))
}

/// A selected child turn contains its pending messages in queue order and
/// exactly one runnable assignment at the end.
pub(super) fn assignment_input(inputs: &[Submission], child: bool) -> Result<&Submission> {
    let invalid = || problem(ErrorKind::InvalidState, "retained_input_selection_invalid");
    let (assignment, messages) = inputs.split_last().ok_or_else(invalid)?;
    if is_message(assignment)
        || (!messages.is_empty() && (!child || !messages.iter().all(is_message)))
    {
        return Err(invalid());
    }
    Ok(assignment)
}

pub(super) fn selected_messages(profile: &Profile, inputs: &[Submission]) -> Result<Vec<Message>> {
    let (_, messages) = inputs
        .split_last()
        .ok_or_else(|| problem(ErrorKind::InvalidState, "retained_input_selection_invalid"))?;
    if messages.len() > MAX_PENDING_MESSAGES {
        return Err(problem(
            ErrorKind::InvalidState,
            "subagent_message_queue_limit",
        ));
    }
    messages
        .iter()
        .map(|input| {
            let retained = read_message(profile.parent(), input)?;
            let mut message = prompt_input(&input.id, &[PromptPart::Text { text: format!(
            "Informational context from the parent chat for the current assignment:\n{}",
            retained.text,
        ) }])?.remove(0);
            message.provenance = Provenance {
                source: format!("subagent-parent/{}", retained.parent),
                kind: ProvenanceKind::Supplied,
                fingerprint: Some(Fingerprint::of(input)?),
            };
            Ok(message)
        })
        .collect()
}

fn read_message(parent: &SessionId, input: &Submission) -> Result<RetainedMessage> {
    if !is_message(input) || input.payload.version() != 1 {
        return Err(problem(ErrorKind::InvalidState, "subagent_message_invalid"));
    }
    let retained: RetainedMessage = decode_input(input)?;
    if &retained.parent != parent {
        return Err(problem(
            ErrorKind::InvalidState,
            "subagent_message_parent_changed",
        ));
    }
    validate_message(&retained.text)?;
    Ok(retained)
}

fn validate_message(text: &str) -> Result<()> {
    if text.trim().is_empty() || text.len() > MAX_MESSAGE_BYTES {
        return Err(problem(ErrorKind::InvalidInput, "subagent_message_invalid"));
    }
    Ok(())
}

fn message_receipt(
    child: SessionId,
    input: InputView,
    message: RetainedMessage,
) -> SubagentMessageReceipt {
    SubagentMessageReceipt {
        parent: message.parent,
        child,
        input: input.input.id,
        position: input.position,
        disposition: input.disposition,
        text: message.text,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_kit_store_sqlite::turn_links::TurnLinkDecision;
    use grida_agent_master::goals::Basis;
    use grida_agent_master::subagents::{NamedSponsorship, Sponsorship};
    use serde_json::json;

    #[test]
    fn attribution_projects_legacy_ordinary_assignments_and_identifies_incomplete_evidence() {
        let parent = SessionId::new("parent").unwrap();
        let turn = TurnId::new("source-turn").unwrap();
        let authority = AuthorityBinding {
            principal: PrincipalId::new("principal").unwrap(),
            binding: BindingId::new("binding").unwrap(),
            scope: ScopeId::new("scope").unwrap(),
        };
        let configuration = |profile| {
            encode(
                SESSION_SCHEMA,
                1,
                &SessionConfiguration {
                    cwd: PathBuf::from("/workspace"),
                    execution: Fingerprint::of(&"execution").unwrap(),
                    owner: None,
                    subagent: Some(profile),
                },
            )
            .unwrap()
        };
        let ordinary =
            configuration(Profile::new(parent.clone(), "Reader".into(), 2, &authority).unwrap());
        let linked = |configuration: &Envelope, input: &Envelope| {
            let TurnLinkDecision::Linked(link) = turn_link(configuration, input).unwrap() else {
                panic!("expected an exact or incomplete parent link");
            };
            link
        };
        let input = |version, assignment| {
            encode(INPUT_SCHEMA, version, &json!({"subagent":assignment})).unwrap()
        };
        let assignment = Assignment::new(turn.clone());
        for version in [1, 2, 3] {
            let link = linked(&ordinary, &input(version, assignment.clone()));
            assert_eq!(link.session, parent);
            assert_eq!(link.turn.as_ref(), Some(&turn));
        }
        let unknown = linked(&ordinary, &input(4, assignment.clone()));
        assert_eq!(unknown.session, parent);
        assert!(unknown.turn.is_none());
        let invalid = encode(INPUT_SCHEMA, 2, &json!({"subagent":{"parent_turn":12}})).unwrap();
        assert!(linked(&ordinary, &invalid).turn.is_none());
        let partial_configuration =
            encode(SESSION_SCHEMA, 2, &json!({"subagent":{"parent":parent}})).unwrap();
        let incomplete = linked(&partial_configuration, &input(2, assignment.clone()));
        assert_eq!(incomplete.session, parent);
        assert!(incomplete.turn.is_none());
        let unreadable_configuration =
            Envelope::new(SchemaId::new(SESSION_SCHEMA).unwrap(), 2, b"{".to_vec()).unwrap();
        assert!(matches!(
            turn_link(&unreadable_configuration, &invalid).unwrap(),
            TurnLinkDecision::CoverageUnknown
        ));
        let message = encode(MESSAGE_SCHEMA, 1, &json!({"parent":parent,"text":"FYI"})).unwrap();
        assert!(matches!(
            turn_link(&ordinary, &message).unwrap(),
            TurnLinkDecision::Unrelated
        ));

        let sponsor = Sponsorship {
            parent_turn: turn.clone(),
            operation: OperationId::new("review").unwrap(),
            admission: Some(Fingerprint::of(&"admission").unwrap()),
            attempt: Some(agent_kit_core::AttemptId::new("attempt").unwrap()),
        };
        let sponsored = configuration(
            Profile::sponsored(parent, "Reviewer".into(), sponsor.clone(), &authority).unwrap(),
        );
        assert!(matches!(
            turn_link(&sponsored, &input(2, assignment)).unwrap(),
            TurnLinkDecision::Unrelated
        ));
        let named = Assignment {
            parent_turn: turn,
            named_sponsorship: Some(NamedSponsorship {
                goal: Basis {
                    goal: ChangeId::new("goal").unwrap(),
                    revision: 1,
                },
                sponsor,
            }),
        };
        assert!(matches!(
            turn_link(&ordinary, &input(2, named)).unwrap(),
            TurnLinkDecision::Unrelated
        ));
    }
}
