---
title: AI Agent for the /svg demo page
description: Two-tool virtual filesystem (read_file / update_file) over the SVG editor, served by a ToolLoopAgent route and the @ai-sdk/react Chat class.
format: md
---

# AI Agent for `/svg`

> Status: shipped on `feature/svg-editor`. Scope: the demo page at
> [editor/app/(canvas)/svg/](<https://github.com/gridaco/grida/tree/main/editor/app/(canvas)/svg/>).
> The `@grida/svg-editor` package stays AI-agnostic; all AI glue lives under
> the page's private `_ai/` folder.

## Goal

Let Claude and a human collaborate on **one** SVG document. The model edits
via two code-agent-style tools; the human edits via the existing
`SvgEditorCanvas`. They share the same `SvgEditor` instance — no separate
buffer, no merge step.

| Tool          | Input                  | Output                              |
| ------------- | ---------------------- | ----------------------------------- |
| `read_file`   | `{}`                   | `{ content: string, version: int }` |
| `update_file` | `{ content, version }` | `{ ok, version }` or error          |

The "file" is the live `SvgEditor` document. `version` is `editor.state.version`,
a counter that bumps on every emit (human gesture, undo, AI write).

## Architecture

```
┌──── /svg page (client) ──────────────────────────────────────┐
│                                                              │
│  SvgEditorCanvas ──┐                                         │
│                    ├──► SvgEditor (state.version++)          │
│  AISvgChatPanel ───┤        ▲                                │
│   (floating)       │        │  read() / write()              │
│   useChat({chat})  │     ┌──┴─────┐                          │
│                    └────►│AgentVFS│  per-session tracker     │
│                          └────────┘                          │
│           ▲                                                  │
│           │  DefaultChatTransport                            │
└───────────┼──────────────────────────────────────────────────┘
            │  POST /private/ai/svg/chat (SSE)
            ▼
┌──── route handler ──────────────────────────────────────────┐
│  createAgentUIStreamResponse({ agent: svgEditorAgent, ... }) │
│  Tools have NO execute() — client-resolved.                  │
│  Agent loop owned by ToolLoopAgent server-side; client       │
│  re-sends when sendAutomaticallyWhen fires.                  │
└──────────────────────────────────────────────────────────────┘
```

This is the canvas chat pattern verbatim, with a different toolset.

## Safety contract

Encoded once in `AgentVFS`, enforced before every `editor.load()`:

| Precondition                        | Error         | Recovery                                 |
| ----------------------------------- | ------------- | ---------------------------------------- |
| No `read_file` this session         | `not_read`    | Model calls `read_file`, retries         |
| `editor.state.version !== expected` | `stale`       | Model calls `read_file`, merges, retries |
| `editor.load(content)` throws       | `parse_error` | Model fixes the SVG and retries          |

Freshness token: `EditorState.version` from
[editor.ts](https://github.com/gridaco/grida/blob/main/packages/grida-svg-editor/src/core/editor.ts).
A successful write counts as a read (the new version becomes the next baseline).

## Files

```
editor/app/(canvas)/svg/_ai/
  agent-vfs.ts          AgentVFS class — read(), write(content, version)
  agent-vfs.test.ts     Node unit tests (6 cases)
  tools.ts              read_file / update_file zod schemas + TOOL_NAMES
  prompt.ts             System prompt teaching the read-before-write contract
  server-agent.ts       ToolLoopAgent definition; exports SvgEditorAgentMessage
  client-chat.ts        makeSvgEditorChat(vfs) → Chat<SvgEditorAgentMessage>
  provider.tsx          <AISvgChatProvider> + useSvgAgentChat()
  panel.tsx             <AISvgChatPanel> — floating overlay
editor/app/(api)/private/ai/svg/chat/route.ts
                        POST handler; auth + org id + createAgentUIStreamResponse.
```

## Why this shape

- **`ToolLoopAgent` + HTTP route + `Chat` class** is the canonical
  AI-SDK-v6 pattern for client-side tools with streaming and the agentic
  loop. Sibling pattern: the canvas agent at
  [editor/app/(api)/private/ai/chat/route.ts](<https://github.com/gridaco/grida/blob/main/editor/app/(api)/private/ai/chat/route.ts>)
  and [editor/grida-canvas-hosted/ai/](https://github.com/gridaco/grida/tree/main/editor/grida-canvas-hosted/ai/).
- **Tools have no `execute()`** — both `read_file` and `update_file` are
  client-resolved against the live `SvgEditor` via `chat.onToolCall`.
- **`getToolName` / `isToolUIPart` / `isTextUIPart`** from `ai` drive the
  panel's part rendering — no hand-rolled type discrimination.
- **The billing seam (GRIDA-SEC-003)** carries through `providerOptions.grida`
  injected by the agent's `prepareCall`, exactly like the canvas agent.

## What this design intentionally avoids

- **No `Edit`-style `old_string/new_string` tool** — whole-file replace only.
- **No streaming partial SVG into the canvas** — `update_file` commits
  one complete document per call.
- **No conversation persistence** across reloads.
- **No model selector** in the UI (`pro` is hard-coded in `server-agent.ts`).
- **No second VFS entry** — one file: `canvas.svg`.

## What this design intentionally reuses

- `@ai-sdk/react`'s `Chat` class + `useChat` for streaming, instant user
  echo, and the tool-call lifecycle.
- `@/components/ai-elements/*` primitives (`Conversation`, `Message`,
  `MessageContent`, `MessageResponse`, `Tool`, `ToolHeader`, `ToolContent`,
  `ToolInput`, `ToolOutput`, `Shimmer`).
- `AgentInput` from the canvas scaffold for the input box.
- `model("pro")` from
  [editor/lib/ai/server.ts](https://github.com/gridaco/grida/blob/main/editor/lib/ai/server.ts)
  (Claude Sonnet 4.6 via Vercel AI Gateway, with billing middleware).
