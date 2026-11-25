# Composer

Tiptap-based prompt composer kit for collecting user intent, lightweight rich text, inline references, attachments, and editor context.

The kit is headless by default at the composition layer: the core model owns message lowering and trigger state, while React components provide a provider/content shell plus small default UI pieces. Consumers decide where attachments, controls, and submitted messages render.

The application supplies draft storage and the send operation. The Desktop
composer binds the editor to a caller-provided draft key and store. It passes
the document captured at Send to the caller so a late acknowledgment can
retire that draft while a newer one stays editable. The binding, submission,
and attachment recovery tests run headlessly.

## Install Surface

Import from the kit entrypoint:

```tsx
import {
  ComposerAttachmentCards,
  ComposerContent,
  ComposerMenuAnchor,
  ComposerProvider,
  ComposerTriggerMenu,
  useComposer,
  type ComposerCatalog,
  type ComposerMessage,
} from "@/kits/composer";
```

`ComposerContent` imports the default editor CSS. The stable styling root is `.composer-content`; call sites can override the CSS variables on that element or pass `className`.
When `editorClassName` constrains the editor height and enables vertical
scrolling, `scrollFade` fades the edges where draft text continues offscreen.

## Basic Usage

```tsx
const catalog: ComposerCatalog = {
  commands: [{ id: "review", title: "Review" }],
  mentions: [{ id: "file-a", label: "a.ts", kind: "file", path: "src/a.ts" }],
};

function PromptComposer() {
  return (
    <ComposerProvider catalog={catalog}>
      <ComposerBox />
    </ComposerProvider>
  );
}

function ComposerBox() {
  const composer = useComposer();

  const submit = () => {
    const message = composer.submit({ submitted_at: Date.now() });
    if (!message) return;
    composer.clear();
  };

  return (
    <ComposerMenuAnchor className="rounded-xl border">
      <ComposerTriggerMenu />
      <ComposerAttachmentCards />
      <ComposerContent
        onSubmitRequest={submit}
        placeholder="Type / for commands"
      />
      <button onClick={submit} type="button">
        Send
      </button>
    </ComposerMenuAnchor>
  );
}
```

## Capabilities

- Slash commands with keyboard selection, Escape and outside-click dismissal.
- An optional inline suggestion in an empty paragraph. Its full text stays
  outside the document until the person presses Tab. It then becomes editable
  text and follows the ordinary Send action.
- Optional host actions on explicit command selection, shared by keyboard and menu clicks.
- Mentions from a caller-provided catalog. The optional `skillMentions`
  catalog opens with `$`. A chosen skill is a removable inline reference with
  a book icon. Its payload is lowered separately from the authored message.
- Type after `@` to see up to eight matches. Exact names and name prefixes
  rank ahead of matches elsewhere in a filename or path. File and folder rows
  show the basename and parent path. Tab and Enter accept the highlighted result.
- File attachments as message parts.
- Inline file references.
- Opaque, read-only directory references (never recursive attachments).
- Select text to add a link or apply bold or italic. Press a link to open it,
  edit its text, or change its destination. Cmd/Ctrl+K opens the destination
  field for the selection. Web links use the same color and destination icons
  in the draft and the transcript. A host can give `ComposerContent` an
  `onLinkClick` handler to route the formatting menu's **Open link** action.
- Markdown shortcuts include lists, block quotes, bold, italic, code, and
  explicit links such as `[label](https://example.com)`.
- Enter submits the draft. Shift+Enter starts a paragraph or adds a list item.
  Use Shift+Enter on an empty list item to leave the list. In a code block,
  Shift+Enter inserts a newline.
- Empty submissions are rejected by default.
- Core accepts duplicate attachment inputs and assigns unique attachment ids; consumers can pass an attachment filter when they want deduping.

Desktop opts into `ComposerHistory` with a logical draft key and a prompt source.
An optional `beforeRecall` callback can handle the first Up press, fall through
to previous prompts, or report that the action is blocked. Desktop uses it to
open a waiting message. `ComposerTiptapHistory` uses native editor transactions
for undo, including recall, Send, and attachment-only changes. A host
supplies staged attachment operations and keeps custody of the files.

## Public Model

`composer.submit()` returns a `ComposerMessage | null`.

Messages contain ordered `parts` such as:

- `text`
- `command`
- `mention`
- `file-ref`
- `file-attachment`
- `editor-context`

Message metadata includes the plain text, attachments, and submission time.
When the draft contains structured formatting, `composer.submit()` also
provides `meta.markdown`. Desktop uses that text for sending and falls back to
`meta.text` for a plain draft.

## Customization

`ComposerMenuAnchor` is the shared full-composer anchor for completion and
toolbar menus. `ComposerTriggerMenu` and `ComposerActionMenu` both open directly
above it with the same width, spacing and surface. Toolbar menus portal into
that root so a clipping toolbar does not hide them. A dismissed completion keeps
its draft and stays closed through focus and catalog refresh; editing the draft
or leaving and re-entering its token makes completion available again.

`ComposerActionMenu` renders the composer’s + button. Pass an `items` array of
`{ id, title, description?, icon?, disabled?, onSelect }`; actions stay owned by
the caller. It supports keyboard selection, Escape and outside-click dismissal,
and hides itself when no actions exist. Selecting an action preserves the draft.
Opening it dismisses active text completion so the two menus cannot overlap.

Pair footer controls with `composerToolbarButtonClassName` for the shared 28px
height and pill shape. `ComposerToolbarTooltip` accepts a short label and an
optional shortcut keycap for a binding the host already supports.
`ComposerToolbarChip` renders removable modes and shares the permission
control’s icon-only layout below a 26rem composer width.

Use the provider/controller for behavior:

- `addAttachment(input, { filter })`
- `removeAttachment(id)`
- `insertFileReference(reference)`
- `setContexts(contexts)`
- `submit({ submitted_at })`
- `clear()`
- `dismissTrigger()`

`ComposerProvider` accepts an optional synchronous
`onCommandSelect?: (command: ComposerCommand) => boolean`. It runs once when a
command is explicitly selected through the keyboard or menu, never when a prefix
is merely typed. Return `true` to handle that command as a host action: the kit
removes only the typed slash trigger, closes its menu, and retains editor focus.
Other draft text, formatting, references, attachments, and context remain intact.
Return `false`, or omit the callback, to insert the usual command chip. Mentions
do not invoke this callback. The callback receives only catalog command data;
its implementation and result never become message parts.

```tsx
<ComposerProvider
  catalog={catalog}
  onCommandSelect={(command) => {
    if (command.id !== "choose-intent") return false;
    chooseIntent();
    return true;
  }}
>
  <ComposerBox />
</ComposerProvider>
```

`ComposerContent` accepts `onTransfer(event)` for paste/drop gestures that
contain browser `File` objects. The event preserves `source` (`paste` or
`drop`), each resource's `kind` (`file` or `directory`), its ordering, and the
original `File`; the caller decides whether it becomes provider-native media,
scratch-backed input, a path reference, or is rejected. File pickers and
Library browsing remain caller-owned UI and should enter the caller's same
policy with their own honest source.

`ComposerDropArea` wraps the entire intended target: the full Home viewport or
an individual chat pane. It supplies the same `ComposerDropOverlay` and transfer
intake for all consumers. Drops outside the editor enter the surface callback;
drops handled by the editor are not forwarded a second time. Internal image,
text and link drags keep their existing behavior. Keep the overlay presentation
in the kit so refinements apply to every surface.

The older `onFiles(files)` and `onDirectories(directories)` callbacks remain as
compatibility projections. They are invoked only when `onTransfer` is omitted,
because calling both would materialize one gesture twice.

For operating-system folder drops, prefer the `directory` resources delivered
through `onTransfer` (or pass the compatibility `onDirectories` callback). The
kit uses `DataTransfer.items` entry metadata to separate directories from
ordinary files (including unknown-MIME files) and forwards the original
disk-backed `File` unchanged. It never enumerates the tree. A capable host can
exchange that trusted handle for a reference; browsers without such a host can
reject the gesture without copying the directory into attachment storage.

A metadata-only folder resource can use a file attachment with MIME
`inode/directory`; its card says **Folder**. This is separate from the opaque
read-only directory scope attachment: displaying a resource grants no access.

Use CSS variables for the default editor skin:

```css
.my-composer .composer-content {
  --composer-content-min-height: 3.5rem;
  --composer-editor-font-size: 0.875rem;
  --composer-chip-color: var(--color-blue-600);
}
```

`Dictation` coordinates a single recording and accepts host-provided microphone
capture and recognition. Subscribe to its snapshot to render starting,
recording, finishing, and error states. During recording, the snapshot exposes
the stream for a waveform to borrow. The caller inserts the returned transcript
into the current draft.

```ts
const dictation = new Dictation(openMicrophone);
const transcript = dictation.start(recognize);
// Wire Stop to dictation.stop() and Cancel or teardown to dictation.cancel().
```

The recognizer receives the captured stream and an abort signal. It returns a
result promise and a `stop` method that stops collecting audio and requests the
final transcript. Dictation closes the microphone tracks after requesting the
final result or when the session ends. The recognizer handles its own teardown
on abort. The playground supplies a Web Speech recognizer with a sample fallback.

For custom UI, keep `ComposerProvider` and `ComposerContent`, then replace `ComposerTriggerMenu` and `ComposerAttachmentCards` with call-site components built on `useComposer()`.

`ComposerController.ready` says when document operations can be applied.
`ComposerContent` accepts `readOnly` to freeze the mounted editor during a
pending confirmation. The Desktop `AgentComposerInput` uses these capabilities
for caller-owned `editing` sessions: it temporarily shows another message in the
same input, preserves the ordinary rich draft, and restores it after Send or
Escape. The caller supplies the edit identity, initial text and cancel callback.
The ordinary `onSubmit` handler receives the edited text. Use `canSubmit` to
defer saving while keeping the input available. Use `allowEmptySubmit` when a
retained message has other content and an empty caption is valid.

When using the default attachment cards with host-owned resources such as object URLs, pass `onRemoveAttachment` to release those resources when a card is removed.
The strip scrolls horizontally as attachments accumulate. Images and files use
square cards, and folders use a compact card. Hosts can supply a `poster` URL
for a file with a preview and omit `onRemove` for a retained attachment.

## Boundaries

This kit does not upload files, fetch mention results, own chat rendering, or bind to workbench/editor global state. Callers provide catalogs, attachments, editor contexts, and submission handling.

Command actions remain host-owned. The kit does not define product modes, run
commands, or host a plugin registry.

The current home is `editor/kits/composer` because the API is reusable inside the editor but not yet promoted to a separately versioned package.

## Validation

Use `/ui/components/composer` as the canonical UI playground. Its default
Desktop chat example uses the production composer, queued-message previews,
model picker and chat-tab excerpt component with local fixtures; it needs no
agent session or provider connection. The Kit and files tab preserves the raw
kit's file/reference examples. See
`editor/app/(dev)/ui/components/composer/README.md` for scenarios and its
isolated browser test command.

Run the pure model, adapter mapping, and transfer tests from `editor` with
`pnpm exec vitest run kits/composer`. The real-editor command selection tests
require installed Google Chrome:

```sh
pnpm exec vitest run --config kits/composer/vitest.browser.config.ts
```

These browser tests exercise keyboard and menu-equivalent selection against
Tiptap, including draft preservation, retained focus, normal chips, mentions,
and duplicate/re-entrant selection guards.
