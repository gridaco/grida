//! The text a process interaction returns to the model.

use super::{Ending, RETAINED_OUTPUT_BYTES};
use agent_kit_core::messages::{OutcomeStatus, ResultContent};
use agent_kit_core::tools::ToolOutcome;
use agent_kit_sandbox::{Completion, SessionRead, StopReason};
use std::time::Duration;

/// Output read from a process and not yet returned, with one counted span of
/// bytes left out of it.
#[derive(Default)]
pub(super) struct Captured {
    bytes: Vec<u8>,
    omitted: u64,
    omitted_at: Option<usize>,
}

impl Captured {
    pub(super) fn push(&mut self, read: SessionRead) {
        if read.omitted_bytes > 0 {
            let at = self.bytes.len() + read.omitted_at.unwrap_or(0);
            self.omitted += read.omitted_bytes;
            self.omitted_at = Some(self.omitted_at.map_or(at, |earlier| earlier.min(at)));
        }
        self.bytes.extend(read.output);
        // A long wait on a busy process keeps the start and the latest output.
        if self.bytes.len() > RETAINED_OUTPUT_BYTES {
            let half = RETAINED_OUTPUT_BYTES / 2;
            let dropped = self.bytes.len() - RETAINED_OUTPUT_BYTES;
            self.bytes.drain(half..half + dropped);
            self.omitted += dropped as u64;
            self.omitted_at = Some(self.omitted_at.map_or(half, |earlier| earlier.min(half)));
        }
    }

    pub(super) fn take(&mut self) -> Self {
        std::mem::take(self)
    }

    /// Lossy UTF-8, with the omitted span marked where it was.
    fn text(&self) -> String {
        let Some(at) = self.omitted_at.filter(|_| self.omitted > 0) else {
            return String::from_utf8_lossy(&self.bytes).into_owned();
        };
        let at = at.min(self.bytes.len());
        let mut text = String::from_utf8_lossy(&self.bytes[..at]).into_owned();
        if !text.is_empty() && !text.ends_with('\n') {
            text.push('\n');
        }
        text.push_str(&format!(
            "[{} bytes of earlier output were dropped]\n",
            self.omitted
        ));
        text.push_str(&String::from_utf8_lossy(&self.bytes[at..]));
        text
    }
}

/// Where the process stands at the end of an interaction.
pub(super) enum Standing<'a> {
    Running(u64),
    Ended(&'a Ending),
}

/// The response text, keeping the start and the end of the output within
/// `budget` bytes.
pub(super) fn render(
    wall: Duration,
    standing: &Standing<'_>,
    output: &Captured,
    budget: usize,
) -> String {
    let mut header = vec![format!("Wall time: {:.4} seconds", wall.as_secs_f64())];
    match standing {
        Standing::Running(id) => header.push(format!("Process running with session ID {id}")),
        Standing::Ended(ending) => {
            match (ending.completion, ending.stopped) {
                (_, Some(StopReason::Deadline)) => {
                    header.push("Process stopped at its time limit".into())
                }
                (_, Some(_)) => header.push("Process stopped".into()),
                (Completion::Exited(code), None) => {
                    header.push(format!("Process exited with code {code}"))
                }
                (Completion::Signaled(signal), None) => {
                    header.push(format!("Process terminated by signal {signal}"))
                }
                (Completion::SetupFailed, None) => header.push("Process failed to start".into()),
                (Completion::Uncertain, None) => {
                    header.push("Process ended without an exit status".into())
                }
            }
            if !ending.verified {
                header.push("Process cleanup was not confirmed".into());
            }
        }
    }
    let text = output.text();
    let body = if text.len() > budget {
        header.push(format!("Original token count: {}", text.len().div_ceil(4)));
        truncate_middle(&text, budget)
    } else {
        text
    };
    header.push("Output:".into());
    format!("{}\n{body}", header.join("\n"))
}

fn truncate_middle(text: &str, budget: usize) -> String {
    let keep = budget.saturating_sub(32);
    let head = text.floor_char_boundary(keep / 2);
    let tail = text.ceil_char_boundary(text.len() - keep / 2);
    let removed = tail - head;
    format!(
        "{}…{} tokens truncated…{}",
        &text[..head],
        removed.div_ceil(4),
        &text[tail..]
    )
}

/// The outcome with the largest output budget, at most `budget`, whose
/// recorded result fits `maximum` bytes. An ended process also carries its
/// native evidence.
pub(super) fn outcome(
    status: OutcomeStatus,
    wall: Duration,
    standing: &Standing<'_>,
    output: &Captured,
    budget: usize,
    maximum: usize,
) -> ToolOutcome {
    let build = |budget: usize| ToolOutcome {
        status,
        content: vec![ResultContent::Text(render(wall, standing, output, budget))],
        structured: match standing {
            Standing::Ended(ending) => Some(ending.details.clone()),
            Standing::Running(_) => None,
        },
        receipt: match standing {
            Standing::Ended(ending) => Some(crate::command::receipt(&ending.details)),
            Standing::Running(_) => None,
        },
        truncated: false,
    };
    let fits = |outcome: &ToolOutcome| {
        serde_json::to_vec(&(&outcome.content, &outcome.structured))
            .is_ok_and(|bytes| bytes.len() <= maximum)
    };
    let first = build(budget);
    if fits(&first) {
        let mut first = first;
        first.truncated = output.text().len() > budget;
        return first;
    }
    // Escaped control characters can make the recorded text larger than the
    // output itself.
    let (mut low, mut high) = (0, budget);
    while low < high {
        let middle = low + (high - low).div_ceil(2);
        if fits(&build(middle)) {
            low = middle;
        } else {
            high = middle - 1;
        }
    }
    let mut outcome = build(low);
    outcome.truncated = true;
    if !fits(&outcome) {
        outcome.structured = None;
    }
    outcome
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_kit_sandbox::SessionRead;

    fn ending(completion: Completion, stopped: Option<StopReason>) -> Ending {
        Ending {
            completion,
            stopped,
            verified: true,
            status: OutcomeStatus::Succeeded,
            details: serde_json::json!({}),
        }
    }

    fn captured(bytes: &[u8]) -> Captured {
        let mut captured = Captured::default();
        captured.push(SessionRead {
            output: bytes.to_vec(),
            ..SessionRead::default()
        });
        captured
    }

    #[test]
    fn reports_follow_the_documented_header() {
        let wall = Duration::from_millis(1500);
        assert_eq!(
            render(wall, &Standing::Running(3), &captured(b"ready\n"), 100),
            "Wall time: 1.5000 seconds\nProcess running with session ID 3\nOutput:\nready\n"
        );
        let exited = ending(Completion::Exited(2), None);
        assert_eq!(
            render(wall, &Standing::Ended(&exited), &captured(b""), 100),
            "Wall time: 1.5000 seconds\nProcess exited with code 2\nOutput:\n"
        );
        let signalled = ending(Completion::Signaled(2), None);
        assert!(
            render(wall, &Standing::Ended(&signalled), &captured(b""), 100)
                .contains("\nProcess terminated by signal 2\nOutput:")
        );
        let stopped = ending(Completion::Exited(0), Some(StopReason::Requested));
        let text = render(wall, &Standing::Ended(&stopped), &captured(b""), 100);
        assert!(text.contains("\nProcess stopped\n"), "{text}");
        assert!(!text.contains("exited with code"), "{text}");
    }

    #[test]
    fn long_output_keeps_head_and_tail_and_counts_tokens() {
        let output = format!("{}{}", "a".repeat(600), "z".repeat(600));
        let text = render(
            Duration::ZERO,
            &Standing::Running(1),
            &captured(output.as_bytes()),
            200,
        );
        assert!(
            text.contains("\nOriginal token count: 300\nOutput:\naaa"),
            "{text}"
        );
        assert!(text.ends_with("zzz"), "{text}");
        assert!(text.contains("tokens truncated…"), "{text}");
        let body = text.split_once("Output:\n").unwrap().1;
        assert!(
            body.len() <= 200 + "…9999 tokens truncated…".len(),
            "{body}"
        );
    }

    #[test]
    fn dropped_output_is_marked_where_it_was() {
        let mut output = Captured::default();
        output.push(SessionRead {
            output: b"first\nlast\n".to_vec(),
            omitted_bytes: 42,
            omitted_at: Some(6),
            ended: false,
        });
        let text = render(Duration::ZERO, &Standing::Running(1), &output, 1000);
        assert!(
            text.ends_with("Output:\nfirst\n[42 bytes of earlier output were dropped]\nlast\n"),
            "{text}"
        );
    }

    #[test]
    fn escaped_terminal_output_still_fits_the_recorded_limit() {
        let output = captured(&[0x1b; 4000]);
        let outcome = outcome(
            OutcomeStatus::Succeeded,
            Duration::ZERO,
            &Standing::Running(1),
            &output,
            4000,
            2048,
        );
        assert!(outcome.truncated);
        let size = serde_json::to_vec(&(&outcome.content, &outcome.structured))
            .unwrap()
            .len();
        assert!(size <= 2048, "{size}");
    }
}
