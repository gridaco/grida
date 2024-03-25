"use client";

import React, { useCallback } from "react";
import { CodeIcon, DotsHorizontalIcon, TrashIcon } from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@editor-ui/dropdown-menu";
import { EditorFlatFormBlock } from "@/scaffolds/editor/state";
import { BlockHeader, FlatBlockBase, useDeleteBlock } from "./base-block";
import { useEditorState } from "@/scaffolds/editor";
import { Editor } from "@monaco-editor/react";

export function HtmlBlock({ id, body_html }: EditorFlatFormBlock) {
  const [state, dispatch] = useEditorState();

  const onEditBody = useCallback(
    (html: string) => {
      dispatch({
        type: "blocks/html/body",
        block_id: id,
        html,
      });
    },
    [dispatch, id]
  );

  const deleteBlock = useDeleteBlock();

  return (
    <FlatBlockBase
      // TODO: add syntax validation
      invalid={false}
    >
      <BlockHeader>
        <div className="flex flex-row items-center gap-8">
          <div className="flex flex-col gap-1">
            <span className="flex flex-row gap-2 items-center">
              <CodeIcon />
              HTML Block
            </span>
            <p className="text-xs opacity-50">
              By default, the content will be styled with{" "}
              <a
                className="underline"
                href="https://github.com/tailwindlabs/tailwindcss-typography"
                target="_blank"
              >
                tailwind prose
              </a>{" "}
              style. you don&apos;t need to add styles in most cases. This will
              NOT rendered in iframe. Consider using embed block for dynamic
              content.
            </p>
          </div>
        </div>
        <div>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button>
                <DotsHorizontalIcon />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => deleteBlock(id)}>
                <TrashIcon />
                Delete Block
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </BlockHeader>
      <div>
        <div className="bg-neutral-200 rounded overflow-hidden border border-black/20 aspect-auto">
          <Editor
            height={400}
            defaultLanguage="html"
            value={body_html ?? ""}
            onChange={(value) => onEditBody(value ?? "")}
            options={{
              padding: { top: 10, bottom: 10 },
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
            }}
          />
        </div>
      </div>
    </FlatBlockBase>
  );
}
