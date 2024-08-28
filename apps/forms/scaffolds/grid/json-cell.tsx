"use client";

import Editor, { useMonaco } from "@monaco-editor/react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import React, { useCallback, useEffect, useState } from "react";
import { BlockKeys } from "./block-keys";
import { useMonacoTheme } from "@/components/monaco";
import { useTheme } from "next-themes";
import { Spinner } from "@/components/spinner";
import { JSONValue } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import toast from "react-hot-toast";

// expand
export function JsonPopupEditorCell({
  value: initialValue,
  onCommitValue,
  readonly,
}: {
  value: JSONValue;
  onCommitValue?: (value: JSONValue) => void;
  readonly?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [txt, setTxt] = useState<string>(
    safeStringifyJson(initialValue, null, 2)
  );
  const [valid, setValid] = useState(true);

  useEffect(() => {
    setValid(isValidJson(txt));
  }, [txt]);

  const cancelChanges = useCallback(() => {
    setOpen(false);
  }, []);

  const onCommit = () => {
    if (valid) {
      if (onCommitValue) {
        const finalval = safeParseJson(txt);
        if (safeStringifyJson(finalval) !== safeStringifyJson(initialValue)) {
          onCommitValue(finalval);
        } else {
          toast("No changes to save");
        }
      }
      setOpen(false);
    } else {
      toast.error("Invalid JSON");
    }
  };

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
        <div className="bg-background border rounded shadow-lg overflow-hidden">
          <BlockKeys value={txt} onEscape={cancelChanges} onEnter={onCommit}>
            <header className="p-2 border-b">
              <Badge
                variant="outline"
                className="text-xs text-muted-foreground font-mono"
              >
                {readonly ? <>READONLY</> : <>EDIT JSON</>}
              </Badge>
            </header>
            <ThemedMonacoEditor
              onMount={(editor) => {
                editor.focus();
              }}
              width="100%"
              height={240}
              value={txt ?? ""}
              onChange={(value) => {
                setTxt(value ?? "");
              }}
              defaultLanguage="json"
              loading={<Spinner />}
              options={{
                readOnly: readonly,
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
            {/* TODO: add edit-save feature */}
            <footer className="flex justify-between p-2 border-t">
              <Button variant="outline" size="sm" onClick={cancelChanges}>
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!valid || readonly}
                onClick={onCommit}
              >
                Save
              </Button>
            </footer>
          </BlockKeys>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ThemedMonacoEditor(props: React.ComponentProps<typeof Editor>) {
  const { resolvedTheme } = useTheme();

  const monaco = useMonaco();
  useMonacoTheme(monaco, resolvedTheme ?? "light");

  return <Editor {...props} />;
}

function safeStringifyJson(
  json: any,
  replacer?: (number | string)[] | null,
  space?: string | number
) {
  if (json === null) return "";
  return JSON.stringify(json, replacer, space);
}

function safeParseJson(jsonString: string) {
  if (jsonString === "") return null;
  return JSON.parse(jsonString);
}

function isValidJson(jsonString: string) {
  if (jsonString === "") return true;
  try {
    JSON.parse(jsonString);
    return true;
  } catch (e) {
    return false;
  }
}
