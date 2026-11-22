"use client";

import { Button } from "@app/ui/components/button";
import { Input } from "@app/ui/components/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@app/ui/components/tooltip";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { BubbleMenu, useEditorState, type Editor } from "@tiptap/react";
import {
  BoldIcon,
  CheckIcon,
  ExternalLinkIcon,
  ItalicIcon,
  Link2Icon,
  PencilIcon,
  UnlinkIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type MouseEventHandler,
} from "react";
import { ComposerTiptap, composerLinkDestination } from "./composer-tiptap";

type LinkEdit = NonNullable<ReturnType<typeof ComposerTiptap.linkTarget>> & {
  doc: ProseMirrorNode;
  field: "url" | "text";
};

const formats = [
  { name: "bold", label: "Bold", icon: BoldIcon, command: "toggleBold" },
  {
    name: "italic",
    label: "Italic",
    icon: ItalicIcon,
    command: "toggleItalic",
  },
] as const;

const buttonProps = {
  type: "button",
  size: "icon-xs",
  variant: "ghost",
} as const;

function FormatButton({
  label,
  ...props
}: ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button {...buttonProps} aria-label={label} {...props} />
      </TooltipTrigger>
      <TooltipContent sideOffset={4}>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ComposerFormattingMenu({
  editor,
  disabled,
  onLinkClick,
}: {
  editor: Editor;
  disabled: boolean;
  onLinkClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const [linkEdit, setLinkEdit] = useState<LinkEdit | null>(null);
  const editField = useRef<HTMLInputElement>(null);
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      link: ComposerTiptap.linkTarget(editor),
    }),
  });

  const openLinkEditor = useCallback(
    (field: LinkEdit["field"]) => {
      const target = ComposerTiptap.linkTarget(editor);
      if (!target || !editor.isEditable || disabledRef.current) return false;
      if (editor.state.selection.empty)
        editor.commands.setTextSelection(target);
      setLinkEdit({ ...target, doc: editor.state.doc, field });
      return true;
    },
    [editor]
  );

  useEffect(() => {
    const input = editor.view.dom;
    function shortcut(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() === "k" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        !event.isComposing &&
        !event.defaultPrevented &&
        openLinkEditor("url")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    const closeEditor = () => setLinkEdit(null);
    input.addEventListener("keydown", shortcut);
    input.addEventListener("pointerdown", closeEditor);
    return () => {
      input.removeEventListener("keydown", shortcut);
      input.removeEventListener("pointerdown", closeEditor);
    };
  }, [editor, openLinkEditor]);

  useEffect(() => {
    if (disabled) setLinkEdit(null);
  }, [disabled]);

  useEffect(() => {
    if (!linkEdit) return;
    editField.current?.focus();
    editField.current?.select();
  }, [linkEdit]);

  function closeLinkEditor() {
    setLinkEdit(null);
    editor.commands.focus();
  }

  function applyLinkEdit(remove = false) {
    const field = editField.current;
    if (!field || !linkEdit) return;
    if (!editor.isEditable || editor.state.doc !== linkEdit.doc) {
      closeLinkEditor();
      return;
    }
    const { from, to } = linkEdit;
    if (linkEdit.field === "text") {
      if (!field.value.trim()) return;
      ComposerTiptap.replaceLinkText(editor, { from, to }, field.value);
    } else {
      const href = remove ? "" : composerLinkDestination(field.value);
      const chain = editor.chain().setTextSelection({ from, to });
      if (!(href ? chain.setLink({ href }) : chain.unsetLink()).run()) return;
    }
    closeLinkEditor();
  }

  const linkHref = state.link?.href;
  const editingText = linkEdit?.field === "text";

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="composerFormatting"
      updateDelay={0}
      shouldShow={({ editor, element, view, state, from, to }) =>
        editor.isEditable &&
        !disabledRef.current &&
        !editor.isActive("codeBlock") &&
        (view.hasFocus() || element.contains(document.activeElement)) &&
        (from === to
          ? editor.isActive("link")
          : !!state.doc.textBetween(from, to).trim())
      }
      tippyOptions={{
        appendTo: "parent",
        hideOnClick: "toggle",
        placement: "top",
        getReferenceClientRect: () => ComposerTiptap.selectionRect(editor),
        zIndex: 30,
        onClickOutside: (instance) => instance.hide(),
        onHide: () => setLinkEdit(null),
      }}
    >
      <div
        data-composer-formatting
        role="group"
        aria-label={
          linkEdit
            ? "Link editor"
            : linkHref
              ? "Link actions"
              : "Text formatting"
        }
        className="composer-formatting-bubble flex items-center gap-0.5 bg-popover text-popover-foreground shadow-md"
        style={disabled ? { display: "none" } : undefined}
        onMouseDown={(event) => {
          if (!linkEdit) event.preventDefault();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && linkEdit) {
            event.preventDefault();
            event.stopPropagation();
            closeLinkEditor();
          }
        }}
      >
        {linkEdit ? (
          <>
            <Input
              ref={editField}
              type="text"
              inputMode={editingText ? undefined : "url"}
              aria-label={editingText ? "Link text" : "Link URL"}
              placeholder={editingText ? "Link text" : "https://example.com"}
              defaultValue={
                editingText
                  ? linkEdit.doc.textBetween(linkEdit.from, linkEdit.to)
                  : linkEdit.href
              }
              className="h-6 w-44 px-1.5 py-0 text-xs md:text-xs"
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing)
                  return;
                event.preventDefault();
                event.stopPropagation();
                applyLinkEdit();
              }}
            />
            <Button
              {...buttonProps}
              aria-label="Apply"
              title="Apply"
              onClick={() => applyLinkEdit()}
            >
              <CheckIcon />
            </Button>
            {linkEdit.href && !editingText && (
              <Button
                {...buttonProps}
                aria-label="Remove link"
                title="Remove link"
                onClick={() => applyLinkEdit(true)}
              >
                <UnlinkIcon />
              </Button>
            )}
          </>
        ) : linkHref ? (
          <>
            <Button size="xs" variant="ghost" asChild>
              <a
                href={linkHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onLinkClick}
              >
                <ExternalLinkIcon />
                Open link
              </a>
            </Button>
            <Button
              {...buttonProps}
              size="xs"
              onClick={() => openLinkEditor("text")}
            >
              <PencilIcon />
              Edit text
            </Button>
            <Button
              {...buttonProps}
              size="xs"
              onClick={() => openLinkEditor("url")}
            >
              <Link2Icon />
              Edit link
            </Button>
          </>
        ) : (
          <TooltipProvider delayDuration={300} disableHoverableContent>
            <FormatButton
              label="Add link"
              aria-keyshortcuts="Meta+K Control+K"
              disabled={!state.link}
              onClick={() => openLinkEditor("url")}
            >
              <Link2Icon />
            </FormatButton>
            {formats.map(({ name, label, icon: Icon, command }) => (
              <FormatButton
                key={name}
                label={label}
                aria-pressed={state[name]}
                className="aria-pressed:bg-accent"
                onClick={() => editor.chain().focus()[command]().run()}
              >
                <Icon />
              </FormatButton>
            ))}
          </TooltipProvider>
        )}
      </div>
    </BubbleMenu>
  );
}
