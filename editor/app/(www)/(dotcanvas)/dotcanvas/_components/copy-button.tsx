"use client";

import React from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { cn } from "@app/ui/lib/utils";

/** A tiny copy-to-clipboard affordance for an inline install command. */
export function CopyButton({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const onCopy = React.useCallback(() => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }, [value]);

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label="Copy to clipboard"
      className={cn(
        "shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className
      )}
    >
      {copied ? (
        <CheckIcon className="size-3.5" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
    </button>
  );
}
