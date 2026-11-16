# Composer playground

`/ui/components/composer` is the canonical local surface for composer UI work.
Start the normal editor development server and open
`http://localhost:3000/ui/components/composer`. No Desktop bridge, account,
provider or running agent is needed.

The default **Desktop chat** example uses `AgentComposerInput`, the shared
`AgentComposerTools` toolbar (completion/+ menu, access control and intent chips),
`NativeModelPicker`, `NativeComposerQueue`, and
`ChatTabPreviewContent`. Its conversation uses the production `Conversation`,
`ChatMessageView`, native message/attachment projection, and `NativeTurnActivity`.
Change those production components when refining the
experience; keep this page as their fixture consumer. File/image actions stage
local examples. The **Kit and files** tab preserves the reusable kit's existing
file picker, drop/reference examples, and message log.

Useful scenarios:

- Choose a **Conversation** example to inspect user/agent text, Markdown and
  code; image captions and image-only messages; file/folder cards and unavailable
  previews; settled tool activity; partial streaming and an empty conversation.
  Image thumbnails use the real preview/fullscreen components with local bytes.
- Type `/` or `@`; dismiss outside or with Escape; continue editing to reopen.
- Open `+` and compare its full-composer placement and keyboard behavior.
- Choose **Goal** or **Plan mode** from `+`, or select `/goal` and `/plan`.
  Both preserve the draft and use Desktop's icon chips, remove controls,
  placeholders and Goal-specific model-picker copy. The modes can coexist;
  **Plan mode** toggles off from `+`. **Goal** prevents attachment selection,
  and an existing attachment prevents Goal entry. **Access: Default** opens
  the same informational popover as Desktop. All actions remain local fixtures.
- Hover, focus or click queued text to inspect its paragraphs and line breaks.
  Every row keeps its queue icon; the image row adds a thumbnail alongside it.
  The unavailable row exercises the read failure state.
- Drag a queued row by its left handle to reorder it. With the keyboard, focus
  the handle, press Space, move with arrow keys, then press Space to drop (Escape
  cancels). The row's menu also provides Move up/down and text editing.
- Choose a text or attachment row's **… → Edit**. It opens in the same composer
  and leaves the row marked **Editing**. Save replaces only the queued text;
  Cancel or Escape restores your existing draft, attachment and mode chips.
  Attachment captions can be cleared while retaining the attachment, and
  captured Plan/Ultra settings stay with the queued entry. Ordinary draft
  autosave never stores the temporary edit. Goal entries keep Edit disabled;
  older hosts without text-preserving replacement also disable attachment edits.
- Submit with **Running turn** on to append a local queued message; turn it off
  to send to the local conversation through the production message renderer.
  Add an example attachment through `+`; its image or file card remains visible
  in the sent user message.
  A running empty composer shows **Pause**; typing shows **Send**. Plan, Goal
  and Ultra queue entries retain their labels and cannot be steered.
- With **Running turn** on, choose **Steer** on a plain text row. It leaves the
  queue and its full text appears in a local steering preview. Image and
  unavailable rows keep Steer disabled; turning **Running turn** off hides it.
- Toggle **Narrow composer** to inspect clipping, model picker and menu width.
- The **Chat tab previews** app window uses the existing `MacOSWindow` frame and
  Desktop's shared `WorkbenchPanelTab` view. Hover or focus **Current chat**,
  **Waiting for reply**, **Image reference** or **New chat** to inspect user
  bubbles, assistant replies, attachment-only text and the empty state.
  Preview text flattens Markdown formatting, links and code fences; role labels
  are omitted from the visible card. It remains inert text without chat actions.
  Hover leaves selection unchanged; click or Enter selects a tab. Close buttons
  work with mouse or keyboard, and **Reset tabs** restores the examples.
  **Current chat** follows the live conversation above.
- **Reset examples** restores the initial state and clears the composer.

Fixture definitions live in `desktop-fixtures.ts` and
`desktop-conversation-fixtures.ts`; `DesktopQueueFixture` handles
their local ordering, removal, editing and steering examples. Neither makes
provider calls.
`AgentComposerTools` receives caller-owned actions, labels, icons and callbacks;
it imports no native controller or bridge. Desktop keeps its real capability
and permission conditions, while this page supplies deterministic example state.
Streaming is a frozen partial answer controlled by **Running turn**, and tool
results are deterministic records. No timer simulates model work. History
revision and native file actions require their owning integration rather than
fake host callbacks in this page.
Production attachment authorization and queue mutation semantics remain covered
by their native/controller tests, rather than being simulated as security
claims here.

Automated browser integration, following the composer kit's Vitest/Chrome setup:

```sh
pnpm --filter editor exec vitest run --config 'app/(dev)/ui/components/composer/vitest.browser.config.ts'
pnpm --filter editor exec vitest run --config kits/composer/vitest.browser.config.ts
```

Use these fixtures and focused regressions when iterating on composer UI. A real
agent session is needed only for uncertainty about host integration that the
fixture and native tests do not settle.
