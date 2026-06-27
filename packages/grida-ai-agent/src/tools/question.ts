/**
 * The locked `question` (ask-user survey) tool — RFC `tools` §question
 * (`docs/wg/ai/agent/tools.md`). The agent emits one or more structured
 * questions; the run **pauses on a human**; the user picks an option or writes
 * their own answer per question; the turn resumes with the answers.
 *
 * Substrate — it is a **client-resolved no-`execute` tool**, exactly like the
 * fs tools (`fs/index.ts`): in an interactive host the tool ships WITHOUT an
 * `execute`, so the call streams to `input-available` and the loop pauses there.
 * The human's answer IS the tool result (`{ answers }`), supplied by the
 * renderer via `chat.addToolResult` and persisted server-authoritatively
 * through the existing `fillToolResult` path. There is no question-specific
 * state machine, store method, wire DTO, or lowering — it rides the same rails
 * as `read_file`. The only shared rail is the drain-pause gate, which keys on
 * the {@link HUMAN_INPUT_TOOL_NAMES} trait, not this tool's name.
 *
 * Headless hosts (CI, scheduled agents, hosted batch) have no human to answer.
 * There the tool is constructed WITH an `execute` that throws the fixed refusal
 * ({@link QUESTION_HEADLESS_REFUSAL}); the model reads the tool error next turn
 * and falls back to its best assumption. That conditional construction — based
 * on the host's `interactive` flag — IS the capability gate. The tool is always
 * registered (it is locked: every host advertises it, so the model's mental
 * model is identical across hosts).
 *
 * Text-only on purpose. Options are `{ label, description? }`; answers are
 * `string[][]`. It is NOT a rich/visual/artifact picker — that is a separate,
 * domain tool that sits beside this one. Keeping this schema minimal is what
 * lets it refuse to grow.
 */

import { tool } from "ai";
import { z } from "zod";
import { QUESTION_TOOL_NAME } from "./names";

export { QUESTION_TOOL_NAME };
export type QuestionToolName = typeof QUESTION_TOOL_NAME;

/**
 * The fixed tool error a headless host returns when the model calls `question`.
 * RFC `tools` §question: "Headless hosts MUST treat `question` as a tool error
 * with a fixed message — the model gets the refusal in its next turn and falls
 * back to its best guess."
 */
export const QUESTION_HEADLESS_REFUSAL =
  "The question tool is unavailable here: there is no interactive user to " +
  "answer. Do not ask — proceed with your best assumption and state the " +
  "assumption you made.";

const questionInputSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z
          .string()
          .min(1)
          .describe("The question to ask the user. One clear ask."),
        header: z
          .string()
          .optional()
          .describe(
            "Optional short label/category for this question (a few words), " +
              "shown as a heading above it."
          ),
        options: z
          .array(
            z.object({
              label: z
                .string()
                .min(1)
                .describe("Short selectable answer text."),
              description: z
                .string()
                .optional()
                .describe("Optional one-line explanation of this option."),
            })
          )
          .optional()
          .describe(
            "Suggested answers the user can pick. The user may always write " +
              "their own answer instead, so options are hints, not a closed set."
          ),
        multi_select: z
          .boolean()
          .optional()
          .describe(
            "When true, the user may select more than one option for this " +
              "question. Default false (single choice)."
          ),
      })
    )
    .min(1)
    .describe("One or more questions to ask in a single survey."),
});

const questionOutputSchema = z.object({
  answers: z
    .array(z.array(z.string()))
    .describe(
      "One array of answer strings per question, in the same order as the " +
        "questions. A single-select question yields a one-element array; a " +
        "multi-select question may yield several; a free-text write-in is the " +
        "user's text verbatim."
    ),
  /** Present and true when the user dismissed the survey without answering. */
  skipped: z
    .boolean()
    .optional()
    .describe("True when the user skipped/dismissed the survey unanswered."),
});

const DESCRIPTION =
  "Pause and ask the user one or more structured questions, then wait for " +
  "their answer before continuing. Use this when a decision genuinely needs " +
  "the user — an ambiguous requirement, a choice between real alternatives, " +
  "missing information you cannot infer. Each question may offer options to " +
  "pick from; the user can also write their own answer. Do NOT use it for " +
  "things you can decide yourself or look up — asking when you should act is " +
  "a worse experience than acting. Returns one answer array per question.";

/**
 * Build the `question` tool. `interactive` decides who resolves it:
 *
 *   - interactive (a human UI is bound): NO `execute` — the call pauses at
 *     `input-available` and the renderer supplies `{ answers }` via
 *     `addToolResult`.
 *   - headless: `execute` throws {@link QUESTION_HEADLESS_REFUSAL} so the model
 *     gets a tool error and proceeds without asking.
 */
export function createQuestionTool(opts: { interactive: boolean }) {
  const base = {
    description: DESCRIPTION,
    inputSchema: questionInputSchema,
    outputSchema: questionOutputSchema,
  };
  if (opts.interactive) {
    // Client-resolved: no execute. The human answer becomes the result.
    return tool(base);
  }
  return tool({
    ...base,
    execute: async () => {
      throw new Error(QUESTION_HEADLESS_REFUSAL);
    },
  });
}
