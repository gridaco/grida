# `@/kits/agent-chat`

Render-only chat transcript renderer for Grida's agent surfaces. Given a single
AI SDK `UIMessage` (settled or mid-stream) it renders one turn — user bubble or
assistant response — including text (Markdown via Streamdown), reasoning
("thinking") blocks, and tool calls.

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
- **Reasoning** parts → a collapsible `Reasoning` block (auto-open while streaming,
  auto-collapses to "Thought for Ns" once the turn moves on).
- **Tool** parts → a compact `Task` row each; a run of consecutive tool calls
  collapses into one summary `Task` (label from `toolDisplay.summarize`). Known
  Grida tools expand to dedicated bodies (files, grep results, todos, commands,
  skills, images, questions); unknown tools fall back to a readable key/value
  summary.
- **`question` tool** parts → only a passive record in the transcript ("asked you
  …" + the answered summary). The interactive prompt is **session-global**, not a
  transcript card — see below.

Transcript-level indicators (rendered by the surface around the turn list, not
per message): `PendingTurnIndicator` (pre-first-token), `CompactingIndicator`
(in-flight compaction), `ForkedNotice`.

## The agent's question (session-global)

The locked `question` tool **asks** — the run pauses on a human. The kit models
this like a supervised-approval bar, NOT a tool card: the surface finds the one
open question and pins the form above its composer.

```tsx
const pending = findPendingQuestion(messages);
{
  pending && <QuestionCard entry={pending} onAnswer={onAnswerQuestion} />;
}
```

`QuestionCard` owns its in-progress form selections (the same kind of transient
UI state as the collapsibles); the **committed** answer leaves through `onAnswer`
— the surface owns the `Chat` and calls `addToolResult`. The kit never touches
the transport. `AnsweredQuestionSummary` is the read-only echo the transcript
shows once answered.

## Contract (kit rules)

- **Render-only / consumer-stateless**: you pass `message` + `isStreaming`; the kit
  owns only transient UI state (collapsibles' open/close, a `QuestionCard`'s
  in-progress selections). No global stores, no IPC, no route imports; committed
  outcomes leave through callbacks (`onAnswer`).
- **Public API** (`index.ts`):
  - `ChatMessageView` + the transcript indicators (`PendingTurnIndicator`,
    `CompactingIndicator`, `ForkedNotice`).
  - The session-global question prompt: `findPendingQuestion`, `QuestionCard`,
    `AnsweredQuestionSummary`, and the `AnswerQuestionHandler` /
    `QuestionAnswerOutput` types.
  - The `ChatMessage` / `ToolCallEntry` types. `toolDisplay` (label/summary
    formatting) is internal.
- Shared message/tool types live in `@/lib/agent-chat` (the bridge transport +
  session helpers use them too); the kit imports them type-only.

## Provenance

Promoted out of the desktop scaffolds (was render-mis-filed there):

- `message.tsx` ← `scaffolds/desktop/ai-sidebar/chat-message.tsx`
- `tool-display.ts` / `tool-display.test.ts` ← `lib/agent-chat/`

Reasoning rendering was added during the move (the scaffold version dropped
reasoning parts). Consumers (each also pins `QuestionCard` above its composer):
the desktop AI sidebar (`scaffolds/desktop/ai-sidebar/`), the workbench agent
pane (`scaffolds/desktop/workbench/agent-pane.tsx`), and the
`/ui/components/ai-chat` demo.
