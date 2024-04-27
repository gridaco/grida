"use client";

import { CheckIcon, CopyIcon } from "@radix-ui/react-icons";
import React, { useState } from "react";

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
      <input
        id="npm-install-copy-text"
        type="text"
        className="col-span-6 bg-neutral-50 border border-neutral-300 text-neutral-500 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full px-2.5 py-4 dark:bg-neutral-700 dark:border-neutral-600 dark:placeholder-neutral-400 dark:text-neutral-400 dark:focus:ring-blue-500 dark:focus:border-blue-500"
        defaultValue={value}
        readOnly
      />
      <button
        onClick={onCopyClick}
        data-copy-to-clipboard-target="npm-install-copy-text"
        className="absolute end-2.5 top-1/2 -translate-y-1/2 text-neutral-900 dark:text-neutral-400 hover:bg-neutral-100 dark:bg-neutral-800 dark:border-neutral-600 dark:hover:bg-neutral-700 rounded-lg py-2 px-2.5 inline-flex items-center justify-center bg-white border-neutral-200 border"
        type="button"
      >
        <span
          className="inline-flex items-center"
          style={{
            display: isCopied ? "none" : "inline-flex",
          }}
        >
          <CopyIcon className="w-3 h-3 me-1.5" />
          <span className="text-xs font-semibold">Copy</span>
        </span>
        <span
          className="inline-flex items-center"
          style={{
            display: isCopied ? "inline-flex" : "none",
          }}
        >
          <CheckIcon className="w-3 h-3 text-blue-700 dark:text-blue-500 me-1.5" />
          <span className="text-xs font-semibold text-blue-700 dark:text-blue-500">
            Copied
          </span>
        </span>
      </button>
    </div>
  );
}
