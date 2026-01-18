import * as React from "react";
import "./styles/index.css";

import type { Content, Editor } from "@tiptap/react";
import type { UseMinimalTiptapEditorProps } from "./hooks/use-minimal-tiptap";
import { EditorContent } from "@tiptap/react";
import { Separator } from "@/components/ui/separator";
import { SectionOne } from "./components/section/one";
import { SectionTwo } from "./components/section/two";
import { SectionThree } from "./components/section/three";
import { SectionFour } from "./components/section/four";
import { SectionFive } from "./components/section/five";
import { LinkBubbleMenu } from "./components/bubble-menu/link-bubble-menu";
import { useMinimalTiptapEditor } from "./hooks/use-minimal-tiptap";
import { MeasuredContainer } from "./components/measured-container";
import { cn } from "@/components/lib/utils";

export interface MinimalTiptapProps extends Omit<
  UseMinimalTiptapEditorProps,
  "onUpdate"
> {
  value?: Content;
  onChange?: (value: Content) => void;
  className?: string;
  editorContentClassName?: string;
}

const Toolbar = ({ editor }: { editor: Editor }) => (
  <div className="border-border flex h-12 shrink-0 overflow-x-auto border-b p-2">
    <div className="flex w-max items-center gap-px">
      <SectionOne editor={editor} activeLevels={[1, 2, 3, 4, 5, 6]} />

      <Separator orientation="vertical" className="mx-2" />

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
        mainActionCount={3}
      />

      <Separator orientation="vertical" className="mx-2" />

      <SectionThree editor={editor} />

      <Separator orientation="vertical" className="mx-2" />

      <SectionFour
        editor={editor}
        activeActions={["orderedList", "bulletList"]}
        mainActionCount={0}
      />

      <Separator orientation="vertical" className="mx-2" />

      <SectionFive
        editor={editor}
        activeActions={["codeBlock", "blockquote", "horizontalRule"]}
        mainActionCount={0}
      />
    </div>
  </div>
);

export const MinimalTiptapEditor = ({
  value,
  onChange,
  className,
  editorContentClassName,
  ...props
}: MinimalTiptapProps) => {
  const editor = useMinimalTiptapEditor({
    value,
    onUpdate: onChange,
    ...props,
  });

  if (!editor) {
    return null;
  }

  return (
    <MeasuredContainer
      as="div"
      name="editor"
      className={cn(
        "border-input focus-within:border-primary min-data-[orientation=vertical]:h-72 flex h-auto w-full flex-col rounded-md border shadow-xs",
        className
      )}
    >
      <Toolbar editor={editor} />
      <EditorContent
        editor={editor}
        className={cn("minimal-tiptap-editor", editorContentClassName)}
      />
      <LinkBubbleMenu editor={editor} />
    </MeasuredContainer>
  );
};

MinimalTiptapEditor.displayName = "MinimalTiptapEditor";

export default MinimalTiptapEditor;
