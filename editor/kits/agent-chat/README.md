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
- **User attachments** → a separate row outside the text bubble. Raster images
  show only a natural-aspect, bounded thumbnail that opens fullscreen; their
  filename stays in accessible and download metadata. Videos, ordinary files
  and folders keep individual named cards. A folder carries no access grant or
  invented content size. Missing image previews keep a named fallback.
- **Reasoning** parts → not rendered. Chain-of-thought tokens are internal
  transport/session data, not transcript content. While reasoning is the only
  streamed content, the existing compact `Thinking` indicator remains visible.
- **Tool** parts → a compact `Task` row each; a run of consecutive tool calls
  collapses into one summary `Task` (label from `toolDisplay.summarize`). Known
  Grida tools expand to dedicated bodies (files, grep results, todos, commands,
  skills, images, questions); unknown tools fall back to a readable key/value
  summary.
  Running tool labels shimmer, including a collapsed group's summary while any
  call is running. Completed, failed and approval-waiting calls stay static.
  Group icons and summary clauses share a ranking by action frequency, with
  the most recently occurring action winning ties. File totals still count
  distinct files; expanding a group keeps its calls in their original order.
- **`question` tool** parts → only a passive record in the transcript ("asked you
  …" + the answered summary). The interactive prompt is **session-global**, not a
  transcript card — see below.

Transcript-level indicators (rendered by the surface around the turn list, not
per message): `PendingTurnIndicator` (labelled **Thinking**, immediately before
first output and after 1.5 seconds of later quiet) and `CompactionNotice` (where
earlier context was summarized). Pass a `progress` identity that changes only
when streamed text or tool activity changes. Progress hides the pending indicator
immediately and restarts its quiet delay; polling and history replay must not
reset it. Set `immediate` while the active turn has no output yet. The surface
hides it when paused, finished or waiting for the person,
and keys it by turn identity to reset its elapsed counter.

Only prose enters the user bubble's height measurement, collapse control,
copy action and edit flow. Attachment-only messages do not create an empty
bubble; their time and status note can still be shown.

Sent-message editing is controlled through `ChatMessageView.edit`. It replaces
the user bubble with a multiline editor and Cancel/Send actions in place; the
composer keeps its independent draft. The consumer supplies the text and
callbacks, submission state, optional read-only retry state and any explanation
of resubmission effects. The kit owns no history or transport. Escape cancels
an unlocked edit; Enter sends and Shift+Enter inserts a line break. Pending sends show a spinner and
lock the editor, and a read-only retry can retain its submitted text.

File context entries can supply a bounded inline `poster` and `caption`.
An exact raster `mimeType` distinguishes image thumbnails from video posters.
For retained PNG, JPEG, WebP and GIF originals, entries instead carry an opaque `previewId`; the host supplies
`loadAttachmentPreview(previewId): Promise<Blob>` to `ChatMessageView`. Its
thumbnail read starts when visible, shares one bounded original read with fullscreen,
and releases its object URL on cleanup. A rejected or retired capability keeps
the named fallback. The kit never resolves a filesystem path or discovers a
preview URL. Ordinary image FileUIParts use their explicit raster data, blob or
HTTP(S) source; file and custom schemes are not display capabilities.

Successful `view_image` parts can carry retained `output.images` with opaque
`previewId` values. Supply the separate `loadToolImage(previewId): Promise<Blob>`
to `ChatMessageView` or `ToolCallGroupView`. It reuses the same retained-raster
thumbnail/fullscreen viewer, bounded loading and URL cleanup as attachments;
its host authorizes the exact tool result through a distinct read capability.
The kit never rereads the displayed source path. Missing capability or bytes
show **Preview unavailable**, and failed calls show their failure text without
loading pixels. Legacy inline `{ok, mime, data}` results remain displayable.

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
