"use client";

import Editor from "@monaco-editor/react";
import * as Popover from "@radix-ui/react-popover";
import { useCallback, useState } from "react";
import { RenderEditCellProps } from "react-data-grid";
import { BlockKeys } from "./block-keys";

// save value
// cancel
// expand
export function JsonEditCell({ column, row }: RenderEditCellProps<any>) {
  const data = row[column.key];
  const { value: initialValue } = data;
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState<string | null>(initialValue);

  const cancelChanges = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <Popover.Root open={open}>
      <Popover.Trigger asChild>
        <button>Open</button>
      </Popover.Trigger>
      <Popover.PopoverPortal>
        <Popover.Content side="bottom" align="start" sideOffset={-35} asChild>
          <div className="bg-white border border-neutral-200 rounded shadow-lg overflow-hidden">
            <BlockKeys
              value={value}
              onEscape={cancelChanges}
              onEnter={() => {}}
            >
              <Editor
                width={300}
                height={200}
                value={value ?? ""}
                defaultLanguage="json"
                options={{
                  // top padding
                  padding: {
                    top: 10,
                  },
                  tabSize: 2,
                  fontSize: 13,
                  minimap: {
                    enabled: false,
                  },
                  glyphMargin: false,
                  folding: false,
                  lineNumbers: "off",
                  lineNumbersMinChars: 0,
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                }}
              />
            </BlockKeys>
            {/* TODO: add edit-save feature */}
            {/* <footer className="flex justify-between p-2 border-t border-neutral-200">
              <button onClick={cancelChanges}>Cancel</button>
              <button>Save</button>
            </footer> */}
          </div>
        </Popover.Content>
      </Popover.PopoverPortal>
    </Popover.Root>
  );
}
