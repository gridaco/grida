# Composer

Tiptap-based prompt composer kit for collecting user intent, lightweight rich text, inline references, attachments, and editor context.

The kit is headless by default at the composition layer: the core model owns message lowering and trigger state, while React components provide a provider/content shell plus small default UI pieces. Consumers decide where attachments, controls, and submitted messages render.

## Install Surface

Import from the kit entrypoint:

```tsx
import {
  ComposerAttachmentCards,
  ComposerContent,
  ComposerProvider,
  ComposerTriggerMenu,
  useComposer,
  type ComposerCatalog,
  type ComposerMessage,
} from "@/kits/composer";
```

`ComposerContent` imports the default editor CSS. The stable styling root is `.composer-content`; call sites can override the CSS variables on that element or pass `className`.

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
    <div className="relative rounded-lg border">
      <ComposerTriggerMenu />
      <ComposerAttachmentCards className="px-2 pt-2" />
      <ComposerContent
        onSubmitRequest={submit}
        placeholder="Type / for commands"
      />
      <button onClick={submit} type="button">
        Send
      </button>
    </div>
  );
}
```

## Capabilities

- Slash commands with keyboard selection.
- Mentions from a caller-provided catalog.
- File attachments as message parts.
- Inline file references.
- Minimal formatting: bullet lists, ordered lists, inline code, and code blocks.
- Empty submissions are rejected by default.
- Core accepts duplicate attachment inputs and assigns unique attachment ids; consumers can pass an attachment filter when they want deduping.

## Public Model

`composer.submit()` returns a `ComposerMessage | null`.

Messages contain ordered `parts` such as:

- `text`
- `command`
- `mention`
- `file-ref`
- `file-attachment`
- `editor-context`

The message `meta` intentionally includes only stable submission metadata: plain text, attachments, and `submitted_at`. Raw Tiptap HTML/JSON is not part of the public message contract.

## Customization

Use the provider/controller for behavior:

- `addAttachment(input, { filter })`
- `removeAttachment(id)`
- `insertFileReference(reference)`
- `setContexts(contexts)`
- `submit({ submitted_at })`
- `clear()`

Use CSS variables for the default editor skin:

```css
.my-composer .composer-content {
  --composer-content-min-height: 3.5rem;
  --composer-editor-font-size: 0.875rem;
  --composer-chip-color: var(--color-blue-600);
}
```

For custom UI, keep `ComposerProvider` and `ComposerContent`, then replace `ComposerTriggerMenu` and `ComposerAttachmentCards` with call-site components built on `useComposer()`.

## Boundaries

This kit does not upload files, fetch mention results, own chat rendering, or bind to workbench/editor global state. Callers provide catalogs, attachments, editor contexts, and submission handling.

The current home is `editor/kits/composer` because the API is reusable inside the editor but not yet promoted to a separately versioned package.
