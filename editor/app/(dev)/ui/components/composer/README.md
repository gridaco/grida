# Composer playground

`/ui/components/composer` is the canonical local surface for composer UI work.
Start the normal editor development server and open
`http://localhost:3000/ui/components/composer`. No Desktop bridge, account,
provider or running agent is needed.

The default **Desktop chat** example uses the production `AgentComposer` assembly (input, completion/+ menu,
access control, intent chips and model/effort picker), `NativeComposerQueue`, and
`ChatTabPreviewContent`. Its conversation uses the production `Conversation`,
`ChatMessageView`, native message/attachment projection, and `NativeTurnActivity`.
Change those production components when refining the
experience; keep this page as their fixture consumer. File/image actions stage
local examples. The **Kit and files** tab preserves the reusable kit's existing
file picker, drop/reference examples, and message log.

Useful scenarios:

- Switch **Surface** between **Workspace** and **Home**. Both use the same mounted
  production composer. Home hides conversation, queue and context usage while
  retaining Files/Image, Goal/Plan, model and effort controls. Switching surfaces
  keeps the text, attachment, modes and effort, so this is also a quick way to
  compare their control layout. Home sends stay in the local conversation, which
  is visible again on the Workspace surface. Destination admission, real file
  preparation and the Home-to-workspace handoff are covered by their owning
  controller tests rather than simulated here.

- Drag an operating-system file over the whole simulated Home or chat surface,
  including its empty surrounding space. The production `ComposerDropArea`
  shows the same full-surface overlay and uses the same intake as an editor
  drop; dropping on the editor stages one attachment. Image/file transfers use
  the local reference image/file examples. Text and in-page drags keep their
  normal behavior, and leaving, cancelling or blurring clears the overlay.
- Choose a **Conversation** example to inspect user/agent text, Markdown and
  code; image captions and image-only messages; file/folder cards and unavailable
  previews; settled tool activity; partial streaming and an empty conversation.
  Image thumbnails use the real preview/fullscreen components with local bytes.
- Choose **SVG text selection** to preview the selection indicator in the
  composer and above a sent message. Use **SVG text selected** to change the
  simulated selection, or turn on Plan mode or attach a file to check when the
  composer omits the indicator. A local Send captures the selection state for
  that message. Changing it afterward leaves the sent indicator in place.
- Turn **Running turn** off and hover a text user bubble to choose **Edit and
  resubmit**. The production inline message editor replaces that bubble with
  a multiline input and **Cancel** / **Send**; the composer and its unsent draft
  stay in place. Enter sends, Shift+Enter adds a line, and Cancel or Escape
  restores the bubble. Send updates the local
  request and removes its later example messages. **Hold submission** also
  applies to inline Send: inspect its spinner, refuse it to retain the edit, or
  accept it to return to the transcript. Attachment messages keep editing
  unavailable. These are local presentation examples; retained history and
  retry receipts remain the native integration's responsibility.
- Type `/` or `@`; dismiss outside or with Escape; continue editing to reopen.
- Open `+` and compare its full-composer placement and keyboard behavior.
- Choose **Goal** or **Plan mode** from `+`, or select `/goal` and `/plan`.
  Both preserve the draft and use Desktop's icon chips, remove controls,
  a constant “Ask anything…” placeholder and Goal-specific model-picker copy. The modes can coexist;
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
  A running empty composer shows **Pause**. Focus the input and press Escape to
  see the hint, then press it again within two seconds to pause. Typing shows
  **Send**. Plan, Goal and Ultra queue entries retain their labels and cannot
  be steered.
- With **Running turn** on, choose **Steer** on a plain text row. It leaves the
  queue and its full text appears in a local steering preview. Image and
  unavailable rows keep Steer disabled; turning **Running turn** off hides it.
- Toggle **Hold submission**, then Send to inspect the pending spinner without a running agent. **Accept submission** settles the send; **Refuse submission** keeps the draft for retry. The spinner remains visible if you edit or clear the text while the send waits.
- Toggle **Narrow composer** to inspect clipping, model picker and menu width.
- **Reset examples** restores the initial state and clears the composer.

Fixture definitions live in `desktop-fixtures.ts` and
`desktop-conversation-fixtures.ts`; `DesktopQueueFixture` handles
their local ordering, removal, editing and steering examples. Neither makes
provider calls.
`AgentComposer` receives caller-owned capabilities, actions, modes, model state
and submission callbacks. Desktop keeps its real capability
and permission conditions, while this page supplies deterministic example state.
Streaming is a frozen partial answer controlled by **Running turn**, and tool
results are deterministic records. No timer simulates model work. The inline
edit fixture changes only its local messages; native history revision and
file actions remain covered by their owning integration.
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
