"use client";

import { CheckIcon, CopyIcon } from "@radix-ui/react-icons";
import React, { useState } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

export function CopyToClipboardInput({ value }: { value: string }) {
  const [isCopied, setIsCopied] = useState(false);

  const onCopyClick = () => {
    navigator.clipboard.writeText(value);
    setIsCopied(true);
    setTimeout(() => {
      setIsCopied(false);
    }, 2000);
  };

  return (
    <div className="relative">
      <Input
        id="npm-install-copy-text"
        type="text"
        defaultValue={value}
        readOnly
      />
      <Button
        variant="outline"
        size="icon"
        onClick={onCopyClick}
        data-copy-to-clipboard-target="npm-install-copy-text"
        className="absolute end-0 top-1/2 -translate-y-1/2"
        type="button"
      >
        <span
          className="inline-flex items-center"
          style={{
            display: isCopied ? "none" : "inline-flex",
          }}
        >
          <CopyIcon className="w-3 h-3" />
        </span>
        <span
          className="inline-flex items-center justify-center"
          style={{
            display: isCopied ? "inline-flex" : "none",
          }}
        >
          <CheckIcon />
        </span>
      </Button>
    </div>
  );
}
