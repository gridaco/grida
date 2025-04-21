"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowUpIcon } from "lucide-react";
import TextareaAutoResize from "react-textarea-autosize";

export function ChatBox({
  disabled,
  onValueCommit,
}: {
  disabled?: boolean;
  onValueCommit?: (value: string) => void;
}) {
  const [txt, setTxt] = React.useState<string>("");

  const clear = () => {
    setTxt("");
  };

  const onSubmit = () => {
    if (disabled) return;
    onValueCommit?.(txt);
    clear();
  };

  return (
    <div className="w-full flex flex-col rounded-xl border border-input bg-muted p-4">
      <TextareaAutoResize
        placeholder="Chat with your prompt..."
        className="resize-none border-none outline-none bg-transparent"
        value={txt}
        onChange={(e) => setTxt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      <div className="flex items-center justify-between mt-2">
        <div />
        <Button
          disabled={disabled}
          onClick={onSubmit}
          variant="default"
          size="icon"
          className="rounded-full"
        >
          <ArrowUpIcon className="size-5" />
        </Button>
      </div>
    </div>
  );
}
