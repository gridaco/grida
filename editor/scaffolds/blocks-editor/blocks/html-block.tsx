"use client";

import React, { useCallback } from "react";
import { CodeIcon, DotsHorizontalIcon, TrashIcon } from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditorFlatFormBlock } from "@/scaffolds/editor/state";
import {
  BlockAction,
  BlockHeader,
  FlatBlockBase,
  useBlockFocus,
  useDeleteBlock,
} from "./base-block";
import { useEditorState } from "@/scaffolds/editor";
import { Button } from "@/components/ui/button";
import { ThemedMonacoEditor, useMonacoTheme } from "@/components/monaco";

export function HtmlBlock({ id, body_html }: EditorFlatFormBlock) {
  const [state, dispatch] = useEditorState();
  const [focused, setFocus] = useBlockFocus(id);
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
      focused={focused}
      onPointerDown={setFocus}
    >
      <BlockHeader>
        <div className="flex flex-row items-center gap-8">
          <div className="flex flex-col gap-1">
            <span className="flex flex-row gap-2 items-center">
              <CodeIcon className="size-3" />
              <span className="text-xs">HTML Block</span>
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
        <BlockAction>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <DotsHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => deleteBlock(id)}>
                <TrashIcon className="size-3.5" />
                Delete Block
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </BlockAction>
      </BlockHeader>
      <div>
        <div className="rounded-sm overflow-hidden border aspect-auto">
          <ThemedMonacoEditor
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
