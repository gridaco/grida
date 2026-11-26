use super::*;
use crate::screen::render;
use agent_client_protocol::v1::schema::{ContentBlock, ContentChunk, SessionUpdate};
use ratatui::style::Modifier;
use ratatui::{Terminal, backend::TestBackend};
use serde_json::{Map, json};
use transcript::Transcript;

fn notification(update: SessionUpdate, key: &str, meta: Value) -> SessionNotification {
    SessionNotification::new("example", update).meta(Map::from_iter([(key.to_owned(), meta)]))
}

fn assistant(id: &str, chunk: &str, key: &str, meta: Value) -> SessionNotification {
    notification(
        SessionUpdate::AgentMessageChunk(ContentChunk::new(chunk.to_owned().into()).message_id(id)),
        key,
        meta,
    )
}

fn live(id: &str, chunk: &str, offset: usize) -> SessionNotification {
    assistant(
        id,
        chunk,
        protocol::LIVE,
        json!({"turnId":"active","activityOrder":4,"offsetBytes":offset,"replace":false}),
    )
}

#[test]
fn replay_keeps_compatible_live_text_and_deduplicates_compaction_in_order() {
    let mut history = Transcript::default();
    assert!(!history.note(&live("answer", "Long answ", 0)));
    history.begin("read".into());
    assert!(!history.note(&assistant(
        "progress",
        "Checking",
        protocol::WINDOW,
        json!({"requestId":"read","turnId":"active","activityOrder":1}),
    )));
    assert!(!history.note(&assistant(
        "answer",
        "Long ",
        protocol::WINDOW,
        json!({"requestId":"read","turnId":"active","activityOrder":4}),
    )));
    assert!(!history.note(&live("answer", "er", 9)));
    assert!(!history.note(&notification(
        SessionUpdate::AgentMessageChunk(ContentChunk::new("".into())),
        protocol::COMPACTION,
        json!({"turnId":"active","item":{"id":"compact-1","status":"running","activityOrder":3}}),
    )));
    assert!(!history.finish(&json!({
        "requestId":"read","turns":[{"turnId":"active","status":null,
        "compactions":[{"id":"compact-1","status":"succeeded","activityOrder":3}]}],
    })));
    assert_eq!(
        history.lines(),
        ["Agent: Checking", "Context compacted", "Agent: Long answer"]
    );
}

#[test]
fn a_weak_or_duplicate_stream_chunk_cannot_overwrite_committed_replay() {
    let mut history = Transcript::default();
    assert!(history.note(&live("answer", "gap", 3)));
    history.begin("read".into());
    assert!(!history.note(&assistant(
        "answer",
        "Final recorded answer",
        protocol::WINDOW,
        json!({"requestId":"read","turnId":"active","activityOrder":4}),
    )));
    assert!(!history.note(&assistant(
        "answer",
        "Stale",
        protocol::LIVE,
        json!({"turnId":"active","activityOrder":4,"offsetBytes":0,"replace":true}),
    )));
    assert!(!history.finish(&json!({
        "requestId":"read","turns":[{"turnId":"active","status":"succeeded"}],
    })));
    assert_eq!(history.lines(), ["Agent: Final recorded answer"]);
}

fn seen(revision: u64, queue: Value, checkout: Value, questions: Value) -> Observed {
    let pending = !questions.is_null();
    Observed {
        snapshot: serde_json::from_value(json!({
            "sessionId":"example","sessionRevision":revision,"queue":queue,
            "queueCheckout":checkout,"idleQueueResumeAvailable":false,"admissionPaused":false,
            "current":{"turnId":"active","disposition":"running","controlRevision":3,"inputNeeded":pending},
        })).unwrap(),
        prompt: (!checkout.is_null()).then(|| vec![ContentBlock::from("Original caption".to_owned())]),
        questions: (!questions.is_null()).then(|| serde_json::from_value(questions).unwrap()),
    }
}

fn idle(revision: u64) -> Observed {
    let mut observed = seen(revision, json!([]), Value::Null, Value::Null);
    observed.snapshot.current = None;
    observed
}

fn picker_entries(paths: &[&str]) -> WorkspaceSearch {
    let workspace = tempfile::tempdir().unwrap();
    for path in paths {
        let entry = workspace.path().join(path);
        if path.ends_with('/') {
            std::fs::create_dir_all(entry).unwrap();
        } else {
            std::fs::create_dir_all(entry.parent().unwrap()).unwrap();
            std::fs::write(entry, b"").unwrap();
        }
    }
    WorkspaceSearch::scan(workspace.path()).unwrap()
}

const PICKER_AREA: Rect = Rect::new(0, 0, 80, 25);

#[test]
fn file_picker_requires_a_query_at_the_end_of_the_draft() {
    let mut picker = FilePicker::default();
    for draft in ["", "@", "show @", "user@report", "@report "] {
        picker.update(Some(draft));
        assert_eq!(picker.height(), 0, "{draft}");
        assert!(!picker.needs_paths(), "{draft}");
    }
    picker.update(Some("show\n@re"));
    assert_eq!(picker.height(), 1);
    assert!(picker.needs_paths());
    for key in [KeyCode::Enter, KeyCode::Up, KeyCode::Down, KeyCode::Tab] {
        assert!(picker.key(KeyEvent::from(key), |_, _| unreachable!()));
    }
    picker.set_paths(picker_entries(&["docs/notes.md"]));
    assert_eq!(picker.height(), 0);
    assert!(!picker.key(KeyEvent::from(KeyCode::Enter), |_, _| unreachable!()));
}

#[test]
fn file_picker_ranks_names_before_paths_and_caps_the_list() {
    let mut picker = FilePicker::default();
    picker.update(Some("@REPORT"));
    let entries = picker_entries(&[
        "reporting/a.txt",
        "a/annual-report.md",
        "b/Report.md",
        "z/report/",
        "reports/b.txt",
        "reports/c.txt",
        "reports/d.txt",
        "reports/e.txt",
        "reports/f.txt",
        "reports/g.txt",
        "unrelated.txt",
    ]);
    picker.set_paths(entries);
    let names = |picker: &FilePicker| {
        picker
            .visible_paths(picker.height())
            .map(|(entry, _)| entry.path.clone())
            .collect::<Vec<_>>()
    };
    assert_eq!(
        names(&picker),
        [
            "z/report",
            "b/Report.md",
            "reporting",
            "reports",
            "a/annual-report.md",
            "reporting/a.txt",
            "reports/b.txt",
            "reports/c.txt",
        ],
    );
    picker.update(Some("@b/repor"));
    assert_eq!(names(&picker), ["b/Report.md"]);
}

#[test]
fn file_picker_shows_duplicate_names_and_accepts_the_exact_selected_path() {
    let mut app = App::default();
    app.state.observe(idle(1));
    app.state.input().push_str("Inspect @Guide");
    app.file_picker.update(app.state.completion_draft());
    app.file_picker.set_paths(picker_entries(&[
        "workspace/web/chapter/sections/Guide.md",
        "workspace/print drafts/chapter/sections/Guide.md",
    ]));
    assert!(app.complete_path(PICKER_AREA, KeyEvent::from(KeyCode::Up)));
    assert_eq!(
        app.file_picker.visible_paths(1).next().unwrap().0.path,
        "workspace/web/chapter/sections/Guide.md"
    );
    assert!(app.complete_path(PICKER_AREA, KeyEvent::from(KeyCode::Down)));

    let mut terminal = Terminal::new(TestBackend::new(80, 25)).unwrap();
    terminal
        .draw(|frame| render(frame, "example", &app))
        .unwrap();
    let buffer = terminal.backend().buffer();
    let row = buffer
        .content()
        .chunks(80)
        .position(|cells| {
            cells
                .iter()
                .map(|cell| cell.symbol())
                .collect::<String>()
                .starts_with("› Guide.md  workspace/print drafts/chapter/sections")
        })
        .expect("highlighted filename and parent");
    let parent = &buffer.content()[row * 80 + "› Guide.md  ".chars().count()];
    assert!(parent.modifier.contains(Modifier::DIM));
    let second = buffer.content()[(row + 1) * 80..(row + 2) * 80]
        .iter()
        .map(|cell| cell.symbol())
        .collect::<String>();
    assert!(second.starts_with("  Guide.md  workspace/web/chapter/sections"));

    let mut narrow = Terminal::new(TestBackend::new(25, 25)).unwrap();
    narrow.draw(|frame| render(frame, "example", &app)).unwrap();
    let visible: String = narrow
        .backend()
        .buffer()
        .content()
        .iter()
        .map(|cell| cell.symbol())
        .collect();
    assert!(visible.contains("› Guide.md  …rint drafts…"));
    assert!(visible.contains("  Guide.md  …rkspace/web…"));

    assert!(app.complete_path(PICKER_AREA, KeyEvent::from(KeyCode::Tab)));
    assert_eq!(app.file_picker.height(), 0);
    let send = app.state.enter("example").unwrap();
    let text = send.params["prompt"][0]["text"].as_str().unwrap();
    assert_eq!(
        text,
        "Inspect \"workspace/print drafts/chapter/sections/Guide.md\" "
    );
    let user_chunk = || {
        SessionUpdate::UserMessageChunk(
            ContentChunk::new(text.to_owned().into()).message_id("selected-file"),
        )
    };
    let mut transcript = Transcript::default();
    transcript.note(&notification(
        user_chunk(),
        protocol::LIVE,
        json!({"turnId":"active","activityOrder":0,"offsetBytes":0,"replace":false}),
    ));
    assert_eq!(transcript.lines(), [format!("You: {text}")]);
    transcript.begin("reopen".to_owned());
    transcript.note(&notification(
        user_chunk(),
        protocol::WINDOW,
        json!({"requestId":"reopen","turnId":"active","activityOrder":0}),
    ));
    assert!(!transcript.finish(&json!({
        "requestId":"reopen","turns":[{"turnId":"active","status":"succeeded"}],
    })));
    assert_eq!(transcript.lines(), [format!("You: {text}")]);
}

#[test]
fn completion_leaves_enter_available_when_the_picker_cannot_be_drawn() {
    let mut app = App::default();
    app.state.observe(idle(1));
    app.state.input().push_str("Inspect @Guide");
    app.file_picker.update(app.state.completion_draft());
    app.file_picker
        .set_paths(picker_entries(&["docs/Guide.md"]));
    let short = Rect::new(0, 0, 80, 9);
    assert_eq!(screen::picker_height(short, &app.file_picker), 0);
    assert!(!app.complete_path(short, KeyEvent::from(KeyCode::Enter)));
    assert_eq!(app.state.completion_draft(), Some("Inspect @Guide"));
    assert!(app.complete_path(PICKER_AREA, KeyEvent::from(KeyCode::Enter)));
    assert_eq!(app.state.completion_draft(), Some("Inspect docs/Guide.md "));
}

#[test]
fn desktop_file_mentions_replay_as_terminal_paths() {
    let text = "Read [AGENTS.md](<./pet-fx notes/AGENTS.md> \"Workspace file\") and [print](<./print> \"Workspace folder\").";
    let update = || {
        SessionUpdate::UserMessageChunk(
            ContentChunk::new(text.to_owned().into()).message_id("desktop-file"),
        )
    };
    let expected = ["You: Read \"pet-fx notes/AGENTS.md\" and print."];
    let mut transcript = Transcript::default();
    transcript.note(&notification(
        update(),
        protocol::LIVE,
        json!({"turnId":"active","activityOrder":0,"offsetBytes":0,"replace":false}),
    ));
    assert_eq!(transcript.lines(), expected);
    transcript.begin("reopen".to_owned());
    transcript.note(&notification(
        update(),
        protocol::WINDOW,
        json!({"requestId":"reopen","turnId":"active","activityOrder":0}),
    ));
    assert!(!transcript.finish(&json!({
        "requestId":"reopen","turns":[{"turnId":"active","status":"succeeded"}],
    })));
    assert_eq!(transcript.lines(), expected);
    assert_eq!(
        crate::file_picker::project_paths(&format!("`{text}`")),
        format!("`{text}`")
    );
    assert_eq!(
        crate::file_picker::project_paths("[Q4](<./drafts/Q4%20%231> \"Workspace file\")"),
        "\"drafts/Q4 #1\""
    );
}

#[test]
fn file_picker_escape_preserves_the_query_and_enter_inserts_in_queued_edits() {
    let mut app = App::default();
    app.state.observe(seen(
        2,
        json!([]),
        json!({"inputId":"waiting","checkoutId":"checked"}),
        Value::Null,
    ));
    *app.state.input() = "Compare @plans".into();
    app.file_picker.update(app.state.completion_draft());
    app.file_picker
        .set_paths(picker_entries(&["docs/Plans@Q4/"]));
    assert!(app.complete_path(PICKER_AREA, KeyEvent::from(KeyCode::Esc)));
    assert_eq!(app.state.completion_draft(), Some("Compare @plans"));
    app.file_picker.update(app.state.completion_draft());
    assert_eq!(app.file_picker.height(), 0);
    assert!(!app.complete_path(PICKER_AREA, KeyEvent::from(KeyCode::Enter)));

    app.state.input().push_str("@q4");
    app.file_picker.update(app.state.completion_draft());
    assert!(app.complete_path(PICKER_AREA, KeyEvent::from(KeyCode::Enter)));
    assert_eq!(app.file_picker.height(), 0);
    let edit = app.state.enter("example").unwrap();
    assert_eq!(edit.method, "queue-reinsert");
    assert_eq!(edit.params["text"], "Compare docs/Plans@Q4 ");
}

#[test]
fn selected_queue_identity_and_ordinary_draft_survive_observations_and_checkout() {
    let mut state = State::default();
    state.input().push_str("Ordinary draft");
    let a = json!({"inputId":"a","preview":"First","checkoutable":true,"steerable":true});
    let b = json!({"inputId":"b","preview":"Second","checkoutable":true,"steerable":true});
    state.observe(seen(4, json!([a, b]), Value::Null, Value::Null));
    state.selected = 1;
    state.observe(seen(5, json!([b, a]), Value::Null, Value::Null));
    let steer = state.steer("example").unwrap();
    assert_eq!(steer.params["inputId"], "b");
    assert_eq!(steer.params["task"]["turnId"], "active");
    assert_eq!(steer.params["task"]["expectedSessionRevision"], 5);
    let checkout = state.checkout("example").unwrap();
    assert_eq!(checkout.params["inputId"], "b");
    state.observe(seen(
        6,
        json!([a]),
        json!({"inputId":"b","checkoutId":checkout.id}),
        Value::Null,
    ));
    assert_eq!(state.input(), "Original caption");
    *state.input() = "Edited caption".into();
    state.observe(seen(
        7,
        json!([]),
        json!({"inputId":"b","checkoutId":checkout.id}),
        Value::Null,
    ));
    let save = state.enter("example").unwrap();
    assert_eq!(save.params["text"], "Edited caption");
    assert_eq!(save.params["checkoutId"], checkout.id);
    assert!(
        state
            .reinsert("example", None)
            .unwrap()
            .params
            .get("text")
            .is_none()
    );
    state.committed(&save);
    assert_eq!(state.input(), "Ordinary draft");
}

#[test]
fn a_duplicate_text_draft_typed_while_awaiting_acknowledgment_is_kept() {
    let mut state = State::default();
    state.observe(seen(1, json!([]), Value::Null, Value::Null));
    *state.input() = "same text".into();
    let send = state.enter("example").unwrap();
    *state.input() = "same text".into();
    state.committed(&send);
    assert_eq!(state.input(), "same text");
}

#[test]
fn blocking_question_focus_and_compaction_are_visible_headlessly() {
    let mut app = App::default();
    app.state.input().push_str("Keeps my draft");
    app.state.observe(seen(4, json!([]), Value::Null, json!({
        "sessionId":"example","turnId":"active","historyPosition":6,"controlRevision":3,
        "questions":[{"waitId":"wait","style":"answer_dependent","questions":[
            {"id":"direction","question":"Which way?","options":[{"label":"Left"},{"label":"Right"}]},
            {"id":"color","question":"Which color?","options":[]},
        ]}],
    })));
    app.note(notification(
        SessionUpdate::AgentMessageChunk(ContentChunk::new("".into())),
        protocol::COMPACTION,
        json!({"turnId":"active","item":{"id":"compacted","status":"succeeded"}}),
    ));
    let mut terminal = Terminal::new(TestBackend::new(100, 28)).unwrap();
    terminal
        .draw(|frame| render(frame, "example", &app))
        .unwrap();
    let visible = terminal
        .backend()
        .buffer()
        .content()
        .iter()
        .map(|cell| cell.symbol())
        .collect::<String>();
    assert!(visible.contains("Context compacted"));
    assert!(visible.contains("Question 1 of 2"));
    assert!(visible.contains("Which way?"));
    assert!(!visible.contains("Keeps my draft"));
    app.state.input().push('2');
    assert!(app.state.enter("example").is_none());
    let answer = app.state.skip("example").unwrap();
    assert_eq!(
        answer.params["answers"],
        json!([
            {"id":"direction","answer":{"kind":"choice","index":1}},
            {"id":"color","answer":{"kind":"skipped"}},
        ])
    );
    assert_eq!(answer.params["waitId"], "wait");
    assert_eq!(app.state.ordinary, "Keeps my draft");
}

#[test]
fn idle_compaction_and_resume_use_their_identified_host_operations() {
    let mut state = State::default();
    state.observe(seen(4, json!([]), Value::Null, Value::Null));
    *state.input() = "/compact".into();
    assert!(state.enter("example").is_none());
    assert_eq!(state.ordinary, "/compact");
    let snapshot = state.snapshot.as_mut().unwrap();
    snapshot.current = None;
    snapshot.admission_paused = true;
    let resume = state.resume("example").unwrap();
    assert_eq!(resume.method, "resume-queue");
    assert_eq!(resume.params["expectedSessionRevision"], 4);
    assert!(state.enter("example").is_none());
    assert_eq!(state.ordinary, "/compact");
    state.observe(idle(5));
    let compact = state.enter("example").unwrap();
    assert!(state.ordinary.is_empty());
    assert_eq!(compact.method, protocol::COMPACT_START);
    assert_eq!(compact.params["requestId"], compact.id);
}

fn pending_compaction(app: &mut App) -> Mutation {
    app.state.observe(idle(4));
    *app.state.input() = "/compact ".into();
    let request = app.state.enter("example").unwrap();
    app.pending = Some(request.clone());
    app.acting = true;
    request
}

#[test]
fn admitted_compaction_releases_the_send_lock_after_a_fresh_snapshot() {
    for (active, method) in [(true, "enqueue"), (false, "submit")] {
        let mut app = App::default();
        pending_compaction(&mut app);
        assert!(app.state.ordinary.is_empty());
        *app.state.input() = "Follow-up".into();

        app.completed(Completed::Mutation(Ok(MutationOutcome::CompactionAdmitted)));
        assert!(app.pending.is_none());
        assert!(!app.acting);
        assert!(app.awaiting_compaction_snapshot);
        assert_eq!(app.state.ordinary, "Follow-up");

        app.completed(Completed::Observe {
            after_compaction: false,
            result: Ok(idle(4)),
        });
        assert!(app.awaiting_compaction_snapshot);
        let fresh = if active {
            seen(5, json!([]), Value::Null, Value::Null)
        } else {
            idle(6)
        };
        app.completed(Completed::Observe {
            after_compaction: true,
            result: Ok(fresh),
        });
        assert!(!app.awaiting_compaction_snapshot);
        let follow_up = app.state.enter("example").unwrap();
        assert_eq!(follow_up.method, method);
        assert_eq!(follow_up.params["prompt"][0]["text"], "Follow-up");
        assert_eq!(app.state.ordinary, "Follow-up");
    }
}

#[test]
fn compaction_refusal_restores_only_the_untouched_draft() {
    for replacement in [None, Some("New draft"), Some("/compact"), Some("")] {
        let mut app = App::default();
        pending_compaction(&mut app);
        if let Some(text) = replacement {
            *app.state.input() = text.into();
        }
        app.completed(Completed::Mutation(Err(
            failure("Session is busy").data("session_prompt_in_progress")
        )));
        assert!(app.pending.is_none());
        assert!(!app.acting);
        assert!(!app.awaiting_compaction_snapshot);
        assert_eq!(app.state.ordinary, replacement.unwrap_or("/compact "));
    }
}

#[test]
fn unconfirmed_compaction_keeps_its_request_for_retry() {
    let mut app = App::default();
    let compact = pending_compaction(&mut app);
    app.completed(Completed::Mutation(Err(
        failure("Admission pending").data("compaction_admission_pending")
    )));
    assert!(app.state.ordinary.is_empty());
    assert!(!app.acting);
    assert!(app.status.contains("F7 Retry"));
    let retry = app.pending.as_ref().unwrap();
    assert_eq!(retry.id, compact.id);
    assert_eq!(retry.params, compact.params);

    *app.state.input() = "/compact ".into();
    app.completed(Completed::Mutation(Ok(MutationOutcome::CompactionNoChange)));
    assert_eq!(app.state.ordinary, "/compact ");
    assert_eq!(app.status, "No context to compact.");
    assert!(!app.awaiting_compaction_snapshot);
    assert!(app.pending.is_none());
}

#[test]
fn accepts_only_a_compaction_start_response_for_the_requested_identity() {
    let admit = json!({"requestId":"request","status":"admitted","turnId":"compact/1"});
    let no_change = json!({"requestId":"request","status":"no_change","turnId":null});
    assert_eq!(
        MutationOutcome::compaction_start("request", &admit).unwrap(),
        MutationOutcome::CompactionAdmitted
    );
    assert_eq!(
        MutationOutcome::compaction_start("request", &no_change).unwrap(),
        MutationOutcome::CompactionNoChange
    );
    assert!(MutationOutcome::compaction_start("other", &admit).is_err());
    for response in [
        json!({"requestId":"request","status":"admitted","turnId":null}),
        json!({"requestId":"request","status":"no_change"}),
        json!({"requestId":"request","status":"installed","turnId":"compact/1"}),
    ] {
        assert!(MutationOutcome::compaction_start("request", &response).is_err());
    }
}

#[test]
fn unconfirmed_steer_keeps_the_identified_intent_until_it_is_resolved() {
    let mut app = App::default();
    let queue = json!([{"inputId":"queued","preview":"Second message","checkoutable":true,"steerable":true}]);
    app.state.observe(seen(12, queue, Value::Null, Value::Null));
    let steer = app.state.steer("example").unwrap();
    app.pending = Some(steer.clone());
    app.acting = true;
    for error in [
        failure("Connection interrupted"),
        failure("Commit not confirmed").data("sqlite_commit_unconfirmed"),
        failure("Control worker interrupted").data("control_worker_interrupted"),
    ] {
        app.completed(Completed::Mutation(Err(error)));
        assert!(!app.acting);
        let pending = app.pending.as_ref().unwrap();
        assert_eq!(pending.id, steer.id);
        assert_eq!(pending.params, steer.params);
    }
    let mut terminal = Terminal::new(TestBackend::new(100, 26)).unwrap();
    terminal
        .draw(|frame| render(frame, "example", &app))
        .unwrap();
    let visible = terminal
        .backend()
        .buffer()
        .content()
        .iter()
        .map(|cell| cell.symbol())
        .collect::<String>();
    assert!(visible.contains("Second message"));
    assert!(visible.contains("F7 Retry"));
    app.completed(Completed::Mutation(Err(
        failure("Stale").data("active_turn_mismatch")
    )));
    assert!(app.pending.is_none());
    assert_eq!(app.state.snapshot.unwrap().queue[0].input_id, "queued");
}

#[test]
fn sending_while_a_reply_streams_enqueues_an_identified_followup() {
    let mut state = State::default();
    state.observe(seen(5, json!([]), Value::Null, Value::Null));
    *state.input() = "Follow-up during the reply".into();
    let send = state.enter("example").unwrap();
    assert_eq!(send.method, "enqueue");
    assert_eq!(send.params["inputId"], send.id);
    assert_eq!(
        send.params["prompt"][0]["text"],
        "Follow-up during the reply"
    );
    state.committed(&send);
    assert!(state.input().is_empty());
}
