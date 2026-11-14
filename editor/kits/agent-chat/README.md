# `@/kits/agent-chat`

Render-only chat transcript renderer for Grida's agent surfaces. Given a single
`UIMessage`-shaped turn (settled or mid-stream) it renders one turn — user
bubble or assistant response — including text (Markdown via Streamdown) and
tool calls. The native Desktop chat maps its messages and tool activity onto
these parts through `native_message_parts` and `native_tool_parts`.

```tsx
import { ChatMessageView } from "@/kits/agent-chat";

messages.map((m, i) => (
  <ChatMessageView
    key={m.id}
    message={m}
    isStreaming={isStreaming && i === messages.length - 1}
  />
));
```

## What it renders

- **Text** parts → `MessageResponse` (Streamdown Markdown).
- **Reasoning** parts → not rendered. Chain-of-thought tokens are internal
  transport/session data, not transcript content. While reasoning is the only
  streamed content, the existing compact `Thinking` indicator remains visible.
- **Tool** parts → a compact `Task` row each; a run of consecutive tool calls
  collapses into one summary `Task` (label from `toolDisplay.summarize`). Known
  Grida tools expand to dedicated bodies (files, grep results, todos, commands,
  skills, images, questions); unknown tools fall back to a readable key/value
  summary.
- **`question` tool** parts → only a passive record in the transcript ("asked you
  …" + the answered summary). The interactive prompt is **session-global**, not a
  transcript card — see below.

Transcript-level indicators (rendered by the surface around the turn list, not
per message): `PendingTurnIndicator` (pre-first-token) and `CompactionNotice`
(where earlier context was summarized).

## The agent's question (session-global)

The locked `question` tool **asks** — the run pauses on a human. The kit models
this like a supervised-approval bar, NOT a tool card: the surface finds the one
open question and pins `QuestionPrompt` above its composer.

`QuestionPrompt` owns its in-progress form selections (the same kind of
transient UI state as the collapsibles); the **committed** answer leaves through
`onSubmit` with the React-free `QuestionSurvey`, and the surface delivers it to
the agent. The kit never touches the transport. `AnsweredQuestionSummary` is the
read-only echo the transcript shows once answered.

## Contract (kit rules)

- **Render-only / consumer-stateless**: you pass `message` + `isStreaming`; the kit
  owns only transient UI state (collapsibles' open/close, a `QuestionPrompt`'s
  in-progress selections). No global stores, no IPC, no route imports; committed
  outcomes leave through callbacks (`onSubmit`).
- **Public API** (`index.ts`):
  - `ChatMessageView`, `ToolCallGroupView` and the transcript indicators
    (`PendingTurnIndicator`, `CompactionNotice`).
  - The session-global question prompt: `QuestionPrompt`,
    `AnsweredQuestionSummary`, and the `QuestionAnswerOutput` type.
  - `workspace_links`, the Markdown link handling for workspace paths.
  - The `ChatMessage` / `ChatMessageActions` / `ToolCallEntry` types.
    `toolDisplay` (label/summary formatting) is internal.
- Shared message/tool types live in `@/lib/agent-chat/types`; the kit imports
  them type-only. Tool and context-part names come from
  `@/lib/agent-chat/chat-vocabulary`.

## Consumers

The native Desktop chat (`scaffolds/desktop/workbench/native-agent-pane.tsx` and
`native-turn-activity.tsx`).
