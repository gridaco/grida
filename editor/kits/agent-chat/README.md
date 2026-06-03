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
  collapses into one summary `Task` (label from `toolDisplay.summarize`). Each row
  expands to its input/output JSON.

## Contract (kit rules)

- **Render-only / consumer-stateless**: you pass `message` + `isStreaming`; the kit
  owns only the stock collapsibles' open/close state. No global stores, no IPC, no
  route imports.
- **Public API** (`index.ts`): `ChatMessageView` plus the `ChatMessage` /
  `ToolCallEntry` types. `toolDisplay` (label/summary formatting) is internal.
- Shared message/tool types live in `@/lib/agent-chat` (the bridge transport +
  session helpers use them too); the kit imports them type-only.

## Provenance

Promoted out of the desktop scaffolds (was render-mis-filed there):

- `message.tsx` ← `scaffolds/desktop/ai-sidebar/chat-message.tsx`
- `tool-display.ts` / `tool-display.test.ts` ← `lib/agent-chat/`

Reasoning rendering was added during the move (the scaffold version dropped
reasoning parts). Consumers: the desktop AI sidebar (`scaffolds/desktop/ai-sidebar/`),
the workspace pane (`scaffolds/desktop/workspace/`), and the
`/ui/components/ai-chat` demo.
