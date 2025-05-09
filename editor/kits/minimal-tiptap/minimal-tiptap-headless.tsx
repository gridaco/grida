import * as React from "react";
import "./styles/index.css";

import type { Editor } from "@tiptap/react";
import { BubbleMenu, EditorContent } from "@tiptap/react";
import { SectionTwo } from "./components/section/two";
import { LinkBubbleMenu } from "./components/bubble-menu/link-bubble-menu";
import { useMinimalTiptapEditor } from "./hooks/use-minimal-tiptap";
import { MeasuredContainer } from "./components/measured-container";
import { StarterKit } from "@tiptap/starter-kit";
import { Typography } from "@tiptap/extension-typography";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Underline } from "@tiptap/extension-underline";
import {
  Link,
  Selection,
  UnsetAllMarks,
  ResetMarksOnEnter,
} from "./extensions";
import { cn } from "@/components/lib/utils";
import { type MinimalTiptapProps } from "./minimal-tiptap";

const createHeadlessExtensions = ({ placeholder }: { placeholder: string }) => [
  StarterKit.configure({
    horizontalRule: false,
    codeBlock: false,
    paragraph: { HTMLAttributes: { class: "text-node" } },
    heading: { HTMLAttributes: { class: "heading-node" } },
    blockquote: { HTMLAttributes: { class: "block-node" } },
    bulletList: { HTMLAttributes: { class: "list-node" } },
    orderedList: { HTMLAttributes: { class: "list-node" } },
    code: { HTMLAttributes: { class: "inline", spellcheck: "false" } },
    dropcursor: { width: 2, class: "ProseMirror-dropcursor border" },
  }),
  Link,
  Underline,
  Selection,
  Typography,
  UnsetAllMarks,
  ResetMarksOnEnter,
  Placeholder.configure({ placeholder: () => placeholder }),
];

const Toolbar = ({
  editor,
  className,
}: {
  editor: Editor;
  className?: string;
}) => (
  <div
    className={cn("shrink-0 border p-1 rounded-md bg-background", className)}
  >
    <div className="flex w-max items-center gap-1">
      <SectionTwo
        editor={editor}
        activeActions={[
          "bold",
          "italic",
          "underline",
          "strikethrough",
          "code",
          "clearFormatting",
        ]}
        mainActionCount={Infinity}
      />
    </div>
  </div>
);

export const MinimalTiptapHeadlessEditor = React.forwardRef<
  HTMLDivElement,
  MinimalTiptapProps
>(
  (
    {
      value,
      placeholder,
      onChange,
      className,
      editorContentClassName,
      ...props
    },
    ref
  ) => {
    const extensions = createHeadlessExtensions({
      placeholder: placeholder ?? "",
    });

    const editor = useMinimalTiptapEditor({
      value,
      onUpdate: onChange,
      extensions,
      ...props,
    });

    if (!editor) {
      return null;
    }

    return (
      <MeasuredContainer
        as="div"
        name="editor"
        ref={ref}
        className={cn(
          "flex h-auto w-full flex-col rounded-md border border-input shadow-sm focus-within:border-primary",
          className
        )}
      >
        <BubbleMenu editor={editor}>
          <Toolbar editor={editor} />
        </BubbleMenu>
        <LinkBubbleMenu editor={editor} />
        <EditorContent
          editor={editor}
          className={cn("minimal-tiptap-editor", editorContentClassName)}
        />
      </MeasuredContainer>
    );
  }
);

MinimalTiptapHeadlessEditor.displayName = "MinimalTiptapEditor";

export default MinimalTiptapHeadlessEditor;
