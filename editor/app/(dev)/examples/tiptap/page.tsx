"use client";

import React, { useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Content } from "@tiptap/react";
import { MinimalTiptapEditor } from "@/kits/minimal-tiptap";

export default function TiptapDevPage() {
  const [value, setValue] = useState<Content>("");

  return (
    <main className="container mx-auto max-w-xl my-10">
      <TooltipProvider>
        <MinimalTiptapEditor
          value={value}
          onChange={setValue}
          className="w-full"
          editorContentClassName="p-5"
          output="html"
          placeholder="Type your description here..."
          autofocus={true}
          editable={true}
          editorClassName="focus:outline-none"
        />
      </TooltipProvider>
    </main>
  );
}
