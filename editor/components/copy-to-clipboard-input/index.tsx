"use client";

import * as React from "react";
import { CheckIcon, CopyIcon } from "@radix-ui/react-icons";
import { toast } from "sonner";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

export function CopyToClipboardInput({ value }: { value: string }) {
  const inputId = React.useId();
  const [isCopied, setIsCopied] = React.useState(false);

  const onCopyClick = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setIsCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  }, [value]);

  return (
    <InputGroup className="w-full">
      <InputGroupInput
        id={inputId}
        type="text"
        value={value}
        readOnly
        className="min-w-0 font-mono"
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          aria-label="Copy"
          title="Copy"
          variant="outline"
          size="icon-xs"
          onClick={onCopyClick}
          data-copy-to-clipboard-target={inputId}
          type="button"
        >
          {isCopied ? (
            <CheckIcon className="size-3" />
          ) : (
            <CopyIcon className="size-3" />
          )}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
