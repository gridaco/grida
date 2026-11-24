//! Terminal ownership and a view that can also draw to a headless backend.

use crate::{App, printable};
use crossterm::event::{DisableBracketedPaste, EnableBracketedPaste};
use crossterm::execute;
use crossterm::terminal::{
    EnterAlternateScreen, LeaveAlternateScreen, disable_raw_mode, enable_raw_mode,
};
use ratatui::layout::{Constraint, Layout};
use ratatui::widgets::{Block, Borders, Paragraph, Wrap};
use ratatui::{Frame, Terminal, backend::CrosstermBackend};
use std::io::{self, Stdout};

pub(super) struct Screen(Terminal<CrosstermBackend<Stdout>>);

impl Screen {
    pub(super) fn enter() -> io::Result<Self> {
        let terminal = Terminal::new(CrosstermBackend::new(io::stdout()))?;
        let screen = Self(terminal);
        enable_raw_mode()?;
        execute!(io::stdout(), EnterAlternateScreen, EnableBracketedPaste)?;
        Ok(screen)
    }
    pub(super) fn draw(&mut self, session: &str, app: &App) -> io::Result<()> {
        self.0.draw(|frame| render(frame, session, app))?;
        Ok(())
    }
}

impl Drop for Screen {
    fn drop(&mut self) {
        let _ = execute!(io::stdout(), DisableBracketedPaste, LeaveAlternateScreen);
        let _ = self.0.show_cursor();
        let _ = disable_raw_mode();
    }
}

pub(super) fn render(frame: &mut Frame<'_>, session: &str, app: &App) {
    let state = &app.state;
    let question = state.question.as_ref().filter(|_| state.question_focused);
    let input_height = if question.is_some() { 9 } else { 4 };
    let [header, history, queue, input, footer] = Layout::vertical([
        Constraint::Length(1),
        Constraint::Min(2),
        Constraint::Length(6),
        Constraint::Length(input_height),
        Constraint::Length(2),
    ])
    .areas(frame.area());
    let current = state
        .snapshot
        .as_ref()
        .and_then(|view| view.current.as_ref());
    let status = current.map_or("idle", |turn| turn.disposition.as_str());
    frame.render_widget(
        Paragraph::new(format!(
            "Grida Agent  {}  ·  {}",
            printable(session),
            printable(status)
        )),
        header,
    );
    let transcript = Paragraph::new(printable(&app.transcript.lines().join("\n")))
        .block(block("Transcript"))
        .wrap(Wrap { trim: false });
    let offset = transcript
        .line_count(history.width)
        .saturating_sub(history.height.into());
    let offset = u16::try_from(offset)
        .unwrap_or(u16::MAX)
        .saturating_sub(state.scroll);
    frame.render_widget(transcript.scroll((offset, 0)), history);

    let queue_label = if let Some(snapshot) = &state.snapshot {
        if snapshot.can_resume_queue() {
            "Queue · F5 Resume"
        } else {
            "Queue"
        }
    } else {
        "Queue"
    };
    let rows = state
        .snapshot
        .as_ref()
        .map(|view| {
            let start = state.selected.saturating_sub(3);
            view.queue
                .iter()
                .enumerate()
                .skip(start)
                .take(4)
                .map(|(index, item)| {
                    let prefix = if index == state.selected { "›" } else { " " };
                    let title = item
                        .preview
                        .as_deref()
                        .and_then(|preview| preview.lines().next())
                        .unwrap_or("[Queued input]");
                    let edit = if item.checkoutable { "  F2 Edit" } else { "" };
                    let steer = if item.steerable { "  F3 Steer" } else { "" };
                    format!("{prefix} {}{edit}{steer}", printable(title))
                })
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();
    frame.render_widget(Paragraph::new(rows).block(block(queue_label)), queue);

    let (title, text) = if let Some(question) = question {
        let item = question.current();
        let mut text = format!("{}\n", item.question);
        for (index, option) in item.options.iter().enumerate() {
            text.push_str(&format!("{}. {}\n", index + 1, option.label));
        }
        text.push_str(&format!("> {}", question.text));
        (
            format!(
                "Question {} of {} · F6 Skip",
                question.index + 1,
                question.items.len()
            ),
            text,
        )
    } else if let Some(edit) = &state.edit {
        (
            format!(
                "Edit queued message · {} retained attachment(s) · F4 Restore",
                edit.attachments
            ),
            edit.text.clone(),
        )
    } else if state
        .snapshot
        .as_ref()
        .is_some_and(|view| view.queue_checkout.is_some())
    {
        (
            "Opening queue edit · F4 Restore".into(),
            state.ordinary.clone(),
        )
    } else {
        ("Message".into(), state.ordinary.clone())
    };
    frame.render_widget(
        Paragraph::new(printable(&text))
            .block(Block::default().borders(Borders::ALL).title(title))
            .wrap(Wrap { trim: false }),
        input,
    );
    frame.render_widget(
        Paragraph::new(format!(
            "{}\nEnter Send/Save · Tab Focus · F8 Refresh · Ctrl+C Quit",
            printable(&app.status)
        )),
        footer,
    );
}

fn block(title: &str) -> Block<'_> {
    Block::default().borders(Borders::ALL).title(title)
}
