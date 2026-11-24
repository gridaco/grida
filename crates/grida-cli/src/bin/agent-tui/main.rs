mod protocol;
mod screen;
mod state;
#[cfg(test)]
mod tests;
mod transcript;

use agent_client_protocol::v1::schema::SessionNotification;
use agent_client_protocol::{ByteStreams, Client, Error, Result, on_receive_notification};
use clap::{Arg, ArgAction, Command as Cli, value_parser};
use crossterm::event::{Event, EventStream, KeyCode, KeyEvent, KeyEventKind, KeyModifiers};
use futures_util::future::{FutureExt, LocalBoxFuture};
use futures_util::stream::{FuturesUnordered, StreamExt};
use protocol::{LIFECYCLE, Mutation, MutationOutcome, Session, failure, request_id};
use screen::Screen;
use serde_json::Value;
use state::{Observed, State};
use std::ffi::OsString;
use std::io::{self, IsTerminal};
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::sync::mpsc;
use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};
use transcript::Transcript;

struct Options {
    agent: PathBuf,
    cwd: PathBuf,
    state_dir: PathBuf,
    session: Option<String>,
    receipt: Option<String>,
    host_args: Vec<OsString>,
}

impl Options {
    fn parse() -> Self {
        let mut args = Cli::new("grida-agent-tui")
            .about("Drive one Grida agent session over private ACP stdio")
            .arg(
                Arg::new("agent")
                    .long("agent")
                    .required(true)
                    .value_parser(value_parser!(PathBuf))
                    .help("Executable to launch as a direct native ACP host"),
            )
            .arg(
                Arg::new("cwd")
                    .long("cwd")
                    .required(true)
                    .value_parser(value_parser!(PathBuf))
                    .help("Workspace used to create or reopen the session"),
            )
            .arg(
                Arg::new("state-dir")
                    .long("state-dir")
                    .required(true)
                    .value_parser(value_parser!(PathBuf))
                    .help("The native host's harness state directory"),
            )
            .arg(
                Arg::new("session")
                    .long("session")
                    .help("Reopen a session in that workspace and state directory"),
            )
            .arg(
                Arg::new("receipt")
                    .long("receipt")
                    .requires("session")
                    .help("Observe a queue action's receipt on reopening"),
            )
            .arg(
                Arg::new("host-args")
                    .last(true)
                    .action(ArgAction::Append)
                    .value_parser(value_parser!(OsString))
                    .help("Additional native host arguments after --"),
            )
            .get_matches();
        Self {
            agent: args.remove_one("agent").expect("required"),
            cwd: args.remove_one("cwd").expect("required"),
            state_dir: args.remove_one("state-dir").expect("required"),
            session: args.remove_one("session"),
            receipt: args.remove_one("receipt"),
            host_args: args
                .remove_many("host-args")
                .into_iter()
                .flatten()
                .collect(),
        }
    }
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> std::process::ExitCode {
    match run(Options::parse()).await {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("grida-agent-tui: {}", printable(&explain(&error)));
            std::process::ExitCode::FAILURE
        }
    }
}

async fn run(options: Options) -> Result<()> {
    if !io::stdin().is_terminal() || !io::stdout().is_terminal() {
        return Err(failure("Run the harness in a terminal"));
    }
    let workspace = options.cwd.canonicalize().map_err(io_failure)?;
    let program = options.agent.canonicalize().map_err(io_failure)?;
    if !workspace.is_dir() {
        return Err(failure("The workspace must be a directory"));
    }
    let mut child = Command::new(program)
        .args(["serve", "--stdio", "--state-dir"])
        .arg(options.state_dir)
        .args(options.host_args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(io_failure)?;
    let transport = ByteStreams::new(
        child.stdin.take().expect("piped stdin").compat_write(),
        child.stdout.take().expect("piped stdout").compat(),
    );
    let mut stderr = child.stderr.take().expect("piped stderr");
    let diagnostics = tokio::spawn(async move {
        let (mut chunk, mut tail) = ([0; 1024], Vec::new());
        while let Ok(length @ 1..) = stderr.read(&mut chunk).await {
            tail.extend_from_slice(&chunk[..length]);
            if tail.len() > 4096 {
                tail.drain(..tail.len() - 4096);
            }
        }
        tail
    });
    let (sender, receiver) = mpsc::channel(512);
    let result = Client
        .v1()
        .on_receive_notification(
            async move |notification: SessionNotification, _| {
                let _ = sender.send(notification).await;
                Ok(())
            },
            on_receive_notification!(),
        )
        .connect_with(transport, async move |connection| {
            let session = Session::attach(connection, workspace, options.session).await?;
            interact(session, receiver, options.receipt).await
        })
        .await;

    // Closing the connection closes stdin and lets the host suspend owned work.
    if tokio::time::timeout(Duration::from_secs(5), child.wait())
        .await
        .is_err()
    {
        child.kill().await.map_err(io_failure)?;
    }
    if let Ok(tail) = diagnostics.await
        && result.is_err()
        && !tail.is_empty()
    {
        eprintln!("{}", printable(String::from_utf8_lossy(&tail).trim()));
    }
    let exit = result?;
    println!("Session {}", exit.session);
    if let Some(pending) = exit.pending {
        println!("Unconfirmed {} request {}", pending.method, pending.id);
    }
    if exit.disconnected {
        return Err(failure(
            "The agent disconnected. Reopen using the printed session ID",
        ));
    }
    Ok(())
}

struct Exit {
    session: String,
    pending: Option<Mutation>,
    disconnected: bool,
}

enum Completed {
    Observe {
        after_compaction: bool,
        result: Result<Observed>,
    },
    Replay(Result<Value>),
    Mutation(Result<MutationOutcome>),
}

#[derive(Default)]
struct App {
    state: State,
    transcript: Transcript,
    status: String,
    pending: Option<Mutation>,
    observing: bool,
    replaying: bool,
    acting: bool,
    awaiting_compaction_snapshot: bool,
    refresh: bool,
    replay: bool,
}

type Jobs = FuturesUnordered<LocalBoxFuture<'static, Completed>>;

impl App {
    fn schedule(&mut self, session: &Session, jobs: &Jobs) {
        if self.refresh && !self.observing {
            self.refresh = false;
            self.observing = true;
            let after_compaction = self.awaiting_compaction_snapshot;
            let session = session.clone();
            let known = self.state.edit.as_ref().map(|edit| edit.checkout.clone());
            jobs.push(
                async move {
                    let result = async {
                        let snapshot = session.snapshot().await?;
                        let prompt = if let Some(checkout) = &snapshot.queue_checkout
                            && Some(checkout) != known.as_ref()
                        {
                            session.checkout_prompt(checkout).await.ok()
                        } else {
                            None
                        };
                        let questions = if let Some(turn) =
                            snapshot.current.as_ref().filter(|turn| turn.input_needed)
                        {
                            session.questions(turn).await.ok()
                        } else {
                            None
                        };
                        Ok(Observed {
                            snapshot,
                            prompt,
                            questions,
                        })
                    }
                    .await;
                    Completed::Observe {
                        after_compaction,
                        result,
                    }
                }
                .boxed_local(),
            );
        }
        if self.replay && !self.replaying {
            self.replay = false;
            self.replaying = true;
            let id = request_id();
            self.transcript.begin(id.clone());
            let session = session.clone();
            jobs.push(async move { Completed::Replay(session.replay(&id).await) }.boxed_local());
        }
    }

    fn completed(&mut self, done: Completed) {
        match done {
            Completed::Observe {
                after_compaction,
                result,
            } => {
                self.observing = false;
                // A read already in flight at admission can still show the
                // previous idle state. Choose the next send from a fresh read.
                if self.awaiting_compaction_snapshot && !after_compaction {
                    return;
                }
                match result {
                    Ok(observed) => {
                        self.awaiting_compaction_snapshot = false;
                        self.replay |= self.state.observe(observed);
                    }
                    Err(error) => self.status = explain(&error),
                }
            }
            Completed::Replay(result) => {
                self.replaying = false;
                match result {
                    Ok(meta) => self.replay |= self.transcript.finish(&meta),
                    Err(error) => {
                        self.status = explain(&error);
                        self.transcript.abort_replay();
                    }
                }
            }
            Completed::Mutation(result) => {
                self.acting = false;
                self.refresh = true;
                match result {
                    Ok(outcome) => {
                        self.replay = true;
                        if let Some(action) = self.pending.take() {
                            self.state.committed(&action);
                        }
                        self.awaiting_compaction_snapshot =
                            outcome == MutationOutcome::CompactionAdmitted;
                        self.status = match outcome {
                            MutationOutcome::CompactionNoChange => "No context to compact.".into(),
                            _ => String::new(),
                        };
                    }
                    Err(error) if self.pending.is_some() && Mutation::confirms_refusal(&error) => {
                        self.state
                            .refused(self.pending.take().expect("checked pending"));
                        self.status = explain(&error);
                    }
                    Err(error) => {
                        self.status = format!("{} · F7 Retry", explain(&error));
                    }
                }
            }
        }
    }

    fn note(&mut self, notification: SessionNotification) {
        if let Some(lifecycle) = notification
            .meta
            .as_ref()
            .and_then(|meta| meta.get(LIFECYCLE))
        {
            self.refresh = true;
            self.replay |= lifecycle["kind"] == "settled";
        }
        self.replay |= self.transcript.note(&notification);
    }

    fn key(&mut self, session: &Session, jobs: &Jobs, key: KeyEvent) -> bool {
        if !matches!(key.kind, KeyEventKind::Press | KeyEventKind::Repeat) {
            return false;
        }
        if key.code == KeyCode::Char('c') && key.modifiers.contains(KeyModifiers::CONTROL) {
            return true;
        }
        let state = &mut self.state;
        match key.code {
            KeyCode::Tab if state.question.is_some() => {
                state.question_focused = !state.question_focused
            }
            KeyCode::Up => state.selected = state.selected.saturating_sub(1),
            KeyCode::Down => {
                let count = state.snapshot.as_ref().map_or(0, |view| view.queue.len());
                state.selected = (state.selected + 1).min(count.saturating_sub(1));
            }
            KeyCode::PageUp => state.scroll = state.scroll.saturating_add(10),
            KeyCode::PageDown => state.scroll = state.scroll.saturating_sub(10),
            KeyCode::Backspace => {
                state.input().pop();
            }
            KeyCode::Enter if key.modifiers.contains(KeyModifiers::SHIFT) => {
                state.input().push('\n')
            }
            KeyCode::Char(character)
                if !key
                    .modifiers
                    .intersects(KeyModifiers::CONTROL | KeyModifiers::ALT)
                    && !character.is_control() =>
            {
                state.input().push(character)
            }
            KeyCode::F(8) => {
                self.replay = true;
                self.refresh = true;
            }
            _ if self.acting || self.awaiting_compaction_snapshot => {}
            KeyCode::F(7) => {
                if let Some(retry) = self.pending.clone() {
                    self.send(session, jobs, retry, true);
                }
            }
            _ if self.pending.is_some() => self.status = "F7 Retry the unconfirmed request".into(),
            key => {
                let request = match key {
                    KeyCode::Enter => state.enter(&session.id),
                    KeyCode::F(2) => state.checkout(&session.id),
                    KeyCode::F(3) => state.steer(&session.id),
                    KeyCode::F(4) => state.reinsert(&session.id, None),
                    KeyCode::F(5) => state.resume(&session.id),
                    KeyCode::F(6) => state.skip(&session.id),
                    _ => None,
                };
                if let Some(request) = request {
                    self.send(session, jobs, request, false);
                }
            }
        }
        false
    }

    fn send(&mut self, session: &Session, jobs: &Jobs, request: Mutation, retry: bool) {
        self.acting = true;
        self.status = "Confirming request…".into();
        self.pending = Some(request.clone());
        let session = session.clone();
        jobs.push(
            async move { Completed::Mutation(session.act(&request, retry).await) }.boxed_local(),
        );
    }
}

async fn interact(
    session: Session,
    mut updates: mpsc::Receiver<SessionNotification>,
    receipt: Option<String>,
) -> Result<Exit> {
    let mut app = App {
        refresh: true,
        replay: true,
        ..App::default()
    };
    if let Some(id) = receipt {
        app.status = match session.receipt(&id).await? {
            Some(result) => format!("Recovered {} for {}", result.action, result.input_id),
            None => "The host has no committed receipt for that request".into(),
        };
    }
    let mut screen = Screen::enter().map_err(io_failure)?;
    let mut keys = EventStream::new();
    let mut jobs = Jobs::new();
    let mut tick = tokio::time::interval(Duration::from_millis(300));
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let disconnected = loop {
        app.schedule(&session, &jobs);
        screen.draw(&session.id, &app).map_err(io_failure)?;
        tokio::select! {
            event = updates.recv() => {
                let Some(event) = event else { break true };
                if event.session_id.0.as_ref() == session.id { app.note(event); }
            }
            done = jobs.next(), if !jobs.is_empty() => {
                // ACP delivers replay frames ahead of their response, but
                // the SDK callback and this event loop use separate queues.
                // Apply all frames already observed before installing it.
                for _ in 0..updates.len() {
                    let Ok(event) = updates.try_recv() else { break };
                    if event.session_id.0.as_ref() == session.id { app.note(event); }
                }
                if let Some(done) = done { app.completed(done); }
            }
            key = keys.next() => {
                match key {
                    Some(Ok(Event::Key(key))) if app.key(&session, &jobs, key) => break false,
                    Some(Ok(Event::Paste(text))) => app.state.input().push_str(&printable(&text)),
                    Some(Err(error)) => return Err(io_failure(error)),
                    None => break false,
                    _ => {}
                }
            }
            _ = tick.tick() => {
                app.refresh |= app.awaiting_compaction_snapshot || app.state.snapshot.as_ref().is_none_or(|view|
                    view.current.is_some() || view.queue_checkout.is_some() || !view.queue.is_empty());
            }
            _ = session.closed() => break true,
        }
    };
    Ok(Exit {
        session: session.id,
        pending: app.pending,
        disconnected,
    })
}

fn explain(error: &Error) -> String {
    error
        .data
        .as_ref()
        .and_then(Value::as_str)
        .unwrap_or(&error.message)
        .to_owned()
}

fn io_failure(error: io::Error) -> Error {
    failure(error.to_string())
}

fn printable(text: &str) -> String {
    text.chars()
        .filter(|character| !character.is_control() || *character == '\n')
        .collect()
}
