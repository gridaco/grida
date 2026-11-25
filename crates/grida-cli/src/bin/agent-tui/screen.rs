//! Terminal ownership and a view that can also draw to a headless backend.

use crate::{App, file_picker::FilePicker, printable};
use crossterm::event::{DisableBracketedPaste, EnableBracketedPaste};
use crossterm::execute;
use crossterm::terminal::{
    EnterAlternateScreen, LeaveAlternateScreen, disable_raw_mode, enable_raw_mode,
};
use grida_agent::workspace_search::{WorkspaceSearchEntry, WorkspaceSearchKind};
use ratatui::layout::{Constraint, Layout, Rect};
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph, Wrap};
use ratatui::{Frame, Terminal, backend::CrosstermBackend};
use std::borrow::Cow;
use std::io::{self, Stdout};

const MESSAGE_HEIGHT: u16 = 4;
const FIXED_ROWS: u16 = 5; // Header, minimum transcript, and footer.

pub(super) struct Screen(Terminal<CrosstermBackend<Stdout>>);

impl Screen {
    pub(super) fn enter() -> io::Result<Self> {
        let terminal = Terminal::new(CrosstermBackend::new(io::stdout()))?;
        let screen = Self(terminal);
        enable_raw_mode()?;
        execute!(io::stdout(), EnterAlternateScreen, EnableBracketedPaste)?;
        Ok(screen)
    }
    pub(super) fn draw(&mut self, session: &str, app: &App) -> io::Result<Rect> {
        Ok(self.0.draw(|frame| render(frame, session, app))?.area)
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
    let input_height = if question.is_some() {
        9
    } else {
        MESSAGE_HEIGHT
    };
    let picker_space = frame
        .area()
        .height
        .saturating_sub(input_height + FIXED_ROWS);
    let picker_height = picker_height(frame.area(), &app.file_picker);
    let queue_height = if picker_height == 0 {
        6
    } else {
        6.min(picker_space - picker_height)
    };
    let [header, history, queue, picker, input, footer] = Layout::vertical([
        Constraint::Length(1),
        Constraint::Min(2),
        Constraint::Length(queue_height),
        Constraint::Length(picker_height),
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

    if picker_height > 0 {
        render_file_picker(frame, picker, &app.file_picker);
    }

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
    let shortcuts = if picker_height > 0 {
        "↑/↓ Select · Tab/Enter Insert · Esc Dismiss"
    } else {
        "Enter Send/Save · Tab Focus · F8 Refresh · Ctrl+C Quit"
    };
    frame.render_widget(
        Paragraph::new(format!("{}\n{shortcuts}", printable(&app.status))),
        footer,
    );
}

fn block(title: &str) -> Block<'_> {
    Block::default().borders(Borders::ALL).title(title)
}

pub(super) fn picker_height(area: Rect, picker: &FilePicker) -> u16 {
    if area.width < 3 {
        return 0;
    }
    // The picker is available only in the message and queue-edit composers.
    picker
        .height()
        .min(area.height.saturating_sub(MESSAGE_HEIGHT + FIXED_ROWS))
}

fn render_file_picker(frame: &mut Frame<'_>, area: Rect, picker: &FilePicker) {
    let dim = Style::default().add_modifier(Modifier::DIM);
    let mut rows: Vec<_> = picker
        .visible_paths(area.height)
        .map(|(path, selected)| {
            let (name, _) = path.parts();
            let label = if path.kind == WorkspaceSearchKind::Directory {
                format!("{name}/")
            } else {
                name.to_owned()
            };
            let prefix = if selected { "› " } else { "  " };
            let style = if selected {
                Style::default().add_modifier(Modifier::BOLD)
            } else {
                Style::default()
            };
            let label = Span::styled(label, style);
            let available = usize::from(area.width).saturating_sub(label.width() + 4);
            Line::from(vec![
                Span::styled(prefix, style),
                label,
                Span::styled(format!("  {}", parent_label(picker, path, available)), dim),
            ])
        })
        .collect();
    if rows.is_empty() {
        rows.push(Line::styled("  Searching workspace…", dim));
    }
    frame.render_widget(Paragraph::new(rows), area);
}

fn parent_label<'a>(
    picker: &FilePicker,
    path: &'a WorkspaceSearchEntry,
    width: usize,
) -> Cow<'a, str> {
    let (name, parent) = path.parts();
    let label = elide_parent(parent, width);
    if width < 3 || label == parent {
        return label;
    }
    // If clipping would make two rows identical, spend the space on their
    // differing parent segments instead of repeating the shared suffix.
    let shared_suffix = picker
        .visible_paths(picker.height())
        .filter_map(|(other, _)| {
            let (other_name, other_parent) = other.parts();
            (other_name == name
                && other.kind == path.kind
                && other_parent != parent
                && elide_parent(other_parent, width) == label)
                .then(|| {
                    parent
                        .chars()
                        .rev()
                        .zip(other_parent.chars().rev())
                        .take_while(|(left, right)| left == right)
                        .map(|(character, _)| character.len_utf8())
                        .sum::<usize>()
                })
        })
        .min()
        .unwrap_or(0);
    if shared_suffix == 0 {
        return label;
    }
    let different = &parent[..parent.len() - shared_suffix];
    format!("{}…", elide_parent(different, width - 1)).into()
}

fn elide_parent(parent: &str, width: usize) -> Cow<'_, str> {
    let span = Span::raw(parent);
    if span.width() <= width {
        return parent.into();
    }
    if width == 0 {
        return "".into();
    }
    // Keep the end of the parent visible on narrow screens, especially the nearest directory.
    let mut remaining = width - 1;
    let mut start = parent.len();
    let graphemes: Vec<_> = span.styled_graphemes(Style::default()).collect();
    for grapheme in graphemes.into_iter().rev() {
        let columns = Span::raw(grapheme.symbol).width();
        if columns > remaining {
            break;
        }
        remaining -= columns;
        start -= grapheme.symbol.len();
    }
    format!("…{}", &parent[start..]).into()
}
