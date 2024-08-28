"use client";

import Editor, { useMonaco } from "@monaco-editor/react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useCallback, useEffect, useState } from "react";
import { RenderEditCellProps } from "react-data-grid";
import { BlockKeys } from "./block-keys";
import { useMonacoTheme } from "@/components/monaco";
import { useTheme } from "next-themes";
import { Spinner } from "@/components/spinner";

// save value
// cancel
// expand
export function JsonEditCell({ column, row }: RenderEditCellProps<any>) {
  const data = row.fields[column.key];
  const { value: initialValue } = data ?? {};
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState<string | null>(
    JSON.stringify(initialValue, null, 2)
  );

  const { resolvedTheme } = useTheme();
  const monaco = useMonaco();

  useMonacoTheme(monaco, resolvedTheme ?? "light");

  const cancelChanges = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <Popover open={open}>
      <PopoverTrigger asChild>
        <button className="w-full h-full" />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={-44}
        asChild
        className="w-[--radix-popover-trigger-width] max-h-[--radix-popover-content-available-height] p-0"
      >
        <div className="bg-white border border-neutral-200 rounded shadow-lg overflow-hidden">
          <BlockKeys value={value} onEscape={cancelChanges} onEnter={() => {}}>
            <Editor
              onMount={(editor) => {
                editor.focus();
              }}
              width="100%"
              height={200}
              value={value ?? ""}
              defaultLanguage="json"
              loading={<Spinner />}
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
      </PopoverContent>
    </Popover>
  );
}
