/**
 * Terminal answer path for the locked `question` tool (RFC `tools` §question,
 * issue #907) — the CLI `run` counterpart of the desktop's `QuestionCard`.
 *
 * The server needs nothing new for this. An interactive `run` leaves the call
 * at `input-available` (the tool ships without `execute`); the CLI reads the
 * pending part back from the persisted transcript, asks the operator on the
 * terminal, and posts `{ answers }` as the client-resolved tool result — the
 * same continuation the desktop renderer sends through `chat.addToolResult`.
 *
 * Answer grammar, per question:
 *   - empty line        → skip this question (`[]`)
 *   - option number(s)  → the picked option labels; several comma-separated
 *                         numbers only when the question is `multi_select`
 *   - anything else     → a write-in, recorded as the operator's text
 * End of input (Ctrl-D) skips the current and remaining questions. When
 * nothing was answered the result is the `{ answers: [], skipped: true }`
 * sentinel, matching the desktop survey.
 */
import readline from "node:readline";
import type { z } from "zod";
import type { ChatMessageWithParts } from "./session/rows";
import {
  QUESTION_TOOL_NAME,
  questionInputSchema,
  type questionOutputSchema,
} from "./tools/question";

export const QUESTION_PART_TYPE = `tool-${QUESTION_TOOL_NAME}` as const;

export type QuestionOutput = z.infer<typeof questionOutputSchema>;
type Question = z.infer<typeof questionInputSchema>["questions"][number];

/**
 * Line-oriented operator input for an interactive `run`. `write` shows prompt
 * text; `ask` writes `prompt` and resolves the next line, or `null` once input
 * has ended. `main` binds it to the TTY (on stderr, so stdout stays the
 * transcript); tests inject a scripted fake.
 */
export type CliPrompter = {
  write(text: string): void;
  ask(prompt: string): Promise<string | null>;
};

/** The one open `question` call the session is paused on. */
export type PendingQuestion = {
  message_id: string;
  tool_call_id: string;
  input: unknown;
};

/**
 * The session's open question, or null. A `question` call pauses the run, so
 * it lives on the last visible message — an assistant message — as a
 * `tool-question` part at `input-available` (the desktop's
 * `findPendingQuestion` shape rule, applied to persisted rows).
 */
export function findPendingQuestion(
  messages: readonly ChatMessageWithParts[]
): PendingQuestion | null {
  const last = messages.filter((m) => m.hidden_at == null).at(-1);
  if (!last || last.role !== "assistant") return null;
  for (const part of last.parts) {
    if (
      part.type === QUESTION_PART_TYPE &&
      part.tool_state === "input-available" &&
      part.tool_call_id
    ) {
      const data = part.data as { input?: unknown } | null;
      return {
        message_id: last.id,
        tool_call_id: part.tool_call_id,
        input: data?.input,
      };
    }
  }
  return null;
}

/**
 * Ask every question in a `question` call's input, one at a time, and build
 * the tool result. An input that does not match the tool's schema cannot be
 * shown faithfully, so it resolves as skipped rather than guessing.
 */
export async function askQuestions(
  input: unknown,
  prompter: CliPrompter
): Promise<QuestionOutput> {
  const parsed = questionInputSchema.safeParse(input);
  if (!parsed.success) return { answers: [], skipped: true };
  const { questions } = parsed.data;
  const answers: string[][] = questions.map(() => []);
  for (let qi = 0; qi < questions.length; qi += 1) {
    const question = questions[qi];
    prompter.write(formatQuestion(question, qi, questions.length));
    const answer = await askOne(question, prompter);
    if (answer === null) {
      // Input ended: keep what was answered, skip the rest.
      prompter.write("\n");
      break;
    }
    answers[qi] = answer;
  }
  if (answers.every((a) => a.length === 0)) {
    return { answers: [], skipped: true };
  }
  return { answers };
}

/** Prompt until the line is a usable answer; `null` when input ended. */
async function askOne(
  question: Question,
  prompter: CliPrompter
): Promise<string[] | null> {
  const prompt = answerPrompt(question);
  for (;;) {
    const line = await prompter.ask(prompt);
    if (line === null) return null;
    const result = interpretAnswer(question, line);
    if (result.ok) return result.answers;
    prompter.write(`  ${result.reason}\n`);
  }
}

type InterpretedAnswer =
  | { ok: true; answers: string[] }
  | { ok: false; reason: string };

/**
 * Map one line of input to a question's answers (see the module grammar).
 * Numbers outside the option range are a write-in, so a numeric answer to a
 * question whose options are only suggestions is never rejected. Exported for
 * unit testing.
 */
export function interpretAnswer(
  question: Question,
  line: string
): InterpretedAnswer {
  const text = line.trim();
  if (!text) return { ok: true, answers: [] };
  const options = question.options ?? [];
  if (options.length > 0 && /^\d+(\s*,\s*\d+)*$/.test(text)) {
    const picks = [...new Set(text.split(",").map((n) => Number(n.trim())))];
    if (picks.every((n) => n >= 1 && n <= options.length)) {
      if (picks.length > 1 && question.multi_select !== true) {
        return { ok: false, reason: "Pick one option." };
      }
      return { ok: true, answers: picks.map((n) => options[n - 1].label) };
    }
  }
  return { ok: true, answers: [text] };
}

/** The question block shown before its answer prompt. Exported for unit
 * testing. */
export function formatQuestion(
  question: Question,
  index: number,
  total: number
): string {
  const progress = total > 1 ? ` (${index + 1}/${total})` : "";
  const header = question.header ? `${question.header}: ` : "";
  const lines = [`\n[question${progress}] ${header}${question.question}`];
  (question.options ?? []).forEach((option, i) => {
    const description = option.description ? ` — ${option.description}` : "";
    lines.push(`  ${i + 1}. ${option.label}${description}`);
  });
  return `${lines.join("\n")}\n`;
}

function answerPrompt(question: Question): string {
  if (!question.options?.length) return "answer (empty to skip): ";
  return question.multi_select === true
    ? "answer (numbers, comma-separated, or your own; empty to skip): "
    : "answer (number, or your own; empty to skip): ";
}

/**
 * A {@link CliPrompter} over the process TTY. Each `ask` opens and closes its
 * own readline interface, so stdin is held only while a question is waiting.
 * Prompts go to stderr. Ctrl-C re-raises SIGINT (the default exit) instead of
 * answering: the question stays pending in the session, as it does when a
 * desktop window closes on an open question.
 */
export function createTerminalPrompter(): CliPrompter {
  return {
    write: (text) => void process.stderr.write(text),
    ask: (prompt) =>
      new Promise((resolve) => {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stderr,
        });
        // Set once the line is settled (answered or interrupted), so the
        // `close` that follows never reads as end of input.
        let settled = false;
        rl.once("close", () => {
          if (!settled) resolve(null);
        });
        rl.once("SIGINT", () => {
          // Never resolve: an interrupt must not send a skipped answer.
          settled = true;
          rl.close();
          process.kill(process.pid, "SIGINT");
        });
        rl.question(prompt, (line) => {
          settled = true;
          rl.close();
          resolve(line);
        });
      }),
  };
}
