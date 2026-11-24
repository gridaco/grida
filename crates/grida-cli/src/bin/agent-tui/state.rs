//! Local drafts and a projection of the host's most recent observation.

use crate::protocol::{
    COMPACT_START, Checkout, DraftEffect, Mutation, OptionLabel, Question, QuestionBody, Questions,
    Snapshot, request_id,
};
use agent_client_protocol::v1::schema::ContentBlock;
use serde_json::{Value, json};

#[derive(Default)]
pub struct State {
    pub snapshot: Option<Snapshot>,
    pub ordinary: String,
    ordinary_revision: u64,
    pub edit: Option<Edit>,
    pub question: Option<QuestionDraft>,
    pub question_focused: bool,
    pub selected: usize,
    pub scroll: u16,
}

pub struct Edit {
    pub checkout: Checkout,
    pub text: String,
    pub attachments: usize,
}

pub struct Observed {
    pub snapshot: Snapshot,
    pub prompt: Option<Vec<ContentBlock>>,
    pub questions: Option<Questions>,
}

impl State {
    /// Returns true when the active turn has changed and history needs a read.
    pub fn observe(&mut self, observed: Observed) -> bool {
        let previous = self
            .snapshot
            .as_ref()
            .and_then(|view| view.current.as_ref());
        let current = observed.snapshot.current.as_ref();
        let changed = previous.map(|turn| &turn.turn_id) != current.map(|turn| &turn.turn_id);
        let selected = self
            .snapshot
            .as_ref()
            .and_then(|view| view.queue.get(self.selected))
            .and_then(|selected| {
                observed
                    .snapshot
                    .queue
                    .iter()
                    .position(|row| row.input_id == selected.input_id)
            });
        self.selected = selected.unwrap_or_else(|| {
            self.selected
                .min(observed.snapshot.queue.len().saturating_sub(1))
        });
        match observed.snapshot.queue_checkout.as_ref() {
            Some(checkout)
                if self
                    .edit
                    .as_ref()
                    .is_none_or(|edit| &edit.checkout != checkout) =>
            {
                self.edit = observed.prompt.map(|prompt| {
                    let mut captions = Vec::new();
                    let mut attachments = 0;
                    for part in prompt {
                        if let ContentBlock::Text(text) = part {
                            captions.push(text.text);
                        } else {
                            attachments += 1;
                        }
                    }
                    Edit {
                        checkout: checkout.clone(),
                        text: captions.join("\n"),
                        attachments,
                    }
                });
            }
            None => self.edit = None,
            _ => {}
        }
        let fresh = observed.questions.and_then(QuestionDraft::from_pending);
        match (fresh, self.question.as_mut()) {
            (Some(fresh), Some(old)) if fresh.wait_id == old.wait_id && fresh.turn == old.turn => {
                old.control_revision = fresh.control_revision;
                old.history_position = fresh.history_position;
            }
            (Some(fresh), _) => {
                self.question = Some(fresh);
                self.question_focused = true;
            }
            (None, _) if changed || current.is_none_or(|turn| !turn.input_needed) => {
                self.question = None;
                self.question_focused = false;
            }
            _ => {}
        }
        self.snapshot = Some(observed.snapshot);
        changed
    }

    pub fn input(&mut self) -> &mut String {
        match (
            self.question_focused,
            self.question.as_mut(),
            self.edit.as_mut(),
        ) {
            (true, Some(question), _) => &mut question.text,
            (_, _, Some(edit)) => &mut edit.text,
            _ => {
                self.ordinary_revision = self.ordinary_revision.wrapping_add(1);
                &mut self.ordinary
            }
        }
    }

    pub fn enter(&mut self, session: &str) -> Option<Mutation> {
        let snapshot = self.snapshot.as_ref()?;
        if self.question_focused
            && let Some(question) = self.question.as_mut()
        {
            let text = question.text.trim();
            if text.is_empty() {
                return None;
            }
            let selected = text
                .parse::<usize>()
                .ok()
                .and_then(|number| number.checked_sub(1));
            let answer = if let Some(index) =
                selected.filter(|index| *index < question.current().options.len())
            {
                json!({"kind":"choice","index":index})
            } else {
                json!({"kind":"text","text":text})
            };
            return question.answer(session, snapshot.session_revision, answer);
        }
        if let Some(edit) = &self.edit {
            if edit.text.trim().is_empty() && edit.attachments == 0 {
                return None;
            }
            return self.reinsert(session, Some(edit.text.clone()));
        }
        if snapshot.queue_checkout.is_some() || self.ordinary.trim().is_empty() {
            return None;
        }
        if self.ordinary.trim() == "/compact" {
            if snapshot.current.is_some() || !snapshot.queue.is_empty() || snapshot.admission_paused
            {
                return None;
            }
            let id = request_id();
            let text = std::mem::take(&mut self.ordinary);
            self.ordinary_revision = self.ordinary_revision.wrapping_add(1);
            return Some(Mutation {
                params: json!({"sessionId":session,"requestId":id}),
                id,
                method: COMPACT_START,
                queue_action: None,
                draft: Some(DraftEffect::RestoreOnRefusal {
                    revision: self.ordinary_revision,
                    text,
                }),
            });
        }
        let id = request_id();
        Some(Mutation {
            params: json!({"sessionId":session,"inputId":id,"prompt":[{"type":"text","text":self.ordinary}]}),
            id,
            method: if snapshot.current.is_some()
                || !snapshot.queue.is_empty()
                || snapshot.admission_paused
            {
                "enqueue"
            } else {
                "submit"
            },
            queue_action: None,
            draft: Some(DraftEffect::ClearOnCommit(self.ordinary_revision)),
        })
    }

    pub fn committed(&mut self, action: &Mutation) {
        if matches!(action.draft, Some(DraftEffect::ClearOnCommit(revision)) if revision == self.ordinary_revision)
        {
            self.ordinary.clear();
        }
        if action.queue_action == Some("reinsert") {
            self.edit = None;
            if let Some(snapshot) = self.snapshot.as_mut() {
                snapshot.queue_checkout = None;
            }
        }
    }

    pub fn refused(&mut self, action: Mutation) {
        if let Some(DraftEffect::RestoreOnRefusal { revision, text }) = action.draft
            && revision == self.ordinary_revision
            && self.ordinary.is_empty()
        {
            self.ordinary_revision = self.ordinary_revision.wrapping_add(1);
            self.ordinary = text;
        }
    }

    pub fn skip(&mut self, session: &str) -> Option<Mutation> {
        if !self.question_focused {
            return None;
        }
        let snapshot = self.snapshot.as_ref()?;
        self.question.as_mut()?.answer(
            session,
            snapshot.session_revision,
            json!({"kind":"skipped"}),
        )
    }

    pub fn checkout(&self, session: &str) -> Option<Mutation> {
        let snapshot = self.snapshot.as_ref()?;
        let queued = snapshot
            .queue
            .get(self.selected)
            .filter(|row| row.checkoutable)?;
        if snapshot.queue_checkout.is_some() {
            return None;
        }
        let id = request_id();
        Some(Mutation {
            params: json!({"sessionId":session,"requestId":id,
                "expectedSessionRevision":snapshot.session_revision,"inputId":queued.input_id}),
            id,
            method: "queue-checkout",
            queue_action: Some("checkout"),
            draft: None,
        })
    }

    pub fn reinsert(&self, session: &str, text: Option<String>) -> Option<Mutation> {
        let checkout = self.snapshot.as_ref()?.queue_checkout.as_ref()?;
        let id = request_id();
        let mut params =
            json!({"sessionId":session,"requestId":id,"checkoutId":checkout.checkout_id});
        if let Some(text) = text {
            params["text"] = json!(text);
        }
        Some(Mutation {
            id,
            method: "queue-reinsert",
            params,
            queue_action: Some("reinsert"),
            draft: None,
        })
    }

    pub fn steer(&self, session: &str) -> Option<Mutation> {
        let snapshot = self.snapshot.as_ref()?;
        let queued = snapshot
            .queue
            .get(self.selected)
            .filter(|row| row.steerable)?;
        let turn = snapshot.current.as_ref()?;
        let id = request_id();
        Some(Mutation {
            params: json!({"inputId":queued.input_id,"task":{
                "sessionId":session,"requestId":id,"turnId":turn.turn_id,
                "expectedSessionRevision":snapshot.session_revision,"expectedControlRevision":turn.control_revision,
            }}),
            id,
            method: "steer-queued",
            queue_action: Some("steer"),
            draft: None,
        })
    }

    pub fn resume(&self, session: &str) -> Option<Mutation> {
        let snapshot = self
            .snapshot
            .as_ref()
            .filter(|view| view.can_resume_queue())?;
        let id = request_id();
        Some(Mutation {
            params: json!({"sessionId":session,"requestId":id,"expectedSessionRevision":snapshot.session_revision}),
            id,
            method: "resume-queue",
            queue_action: None,
            draft: None,
        })
    }
}

pub struct QuestionDraft {
    pub wait_id: String,
    turn: String,
    control_revision: u64,
    history_position: u64,
    pub items: Vec<Question>,
    pub index: usize,
    answers: Vec<Value>,
    pub text: String,
}

impl QuestionDraft {
    fn from_pending(questions: Questions) -> Option<Self> {
        let wait = questions
            .questions
            .into_iter()
            .find(|wait| wait.style == "answer_dependent")?;
        let items = match wait.body {
            QuestionBody::Batch { questions } => questions,
            QuestionBody::Legacy { question, options } => vec![Question {
                id: "question".into(),
                question,
                options: options
                    .into_iter()
                    .map(|label| OptionLabel { label })
                    .collect(),
            }],
        };
        if items.is_empty() {
            return None;
        }
        Some(Self {
            wait_id: wait.wait_id,
            turn: questions.turn_id,
            control_revision: questions.control_revision,
            history_position: questions.history_position,
            items,
            index: 0,
            answers: Vec::new(),
            text: String::new(),
        })
    }

    pub fn current(&self) -> &Question {
        &self.items[self.index]
    }

    fn answer(&mut self, session: &str, revision: u64, answer: Value) -> Option<Mutation> {
        self.answers.truncate(self.index);
        self.answers
            .push(json!({"id":self.current().id,"answer":answer}));
        if self.index + 1 < self.items.len() {
            self.index += 1;
            self.text.clear();
            return None;
        }
        let id = request_id();
        Some(Mutation {
            params: json!({"sessionId":session,"turnId":self.turn,"requestId":id,"expectedSessionRevision":revision,
               "expectedControlRevision":self.control_revision,"expectedHistoryPosition":self.history_position,
               "waitId":self.wait_id,"answers":self.answers}),
            id,
            method: "answer-question-v2",
            queue_action: None,
            draft: None,
        })
    }
}
