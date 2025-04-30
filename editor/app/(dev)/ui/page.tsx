"use client";
import { Spinner } from "@/components/spinner";
import { TagInput } from "@/components/tag";
import { MinimalTiptapEditor } from "@/kits/minimal-tiptap";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { useState } from "react";

export default function AllComponentsPage() {
  return (
    <TooltipProvider>
      <main className="max-w-screen-lg mx-auto">
        <div className="h-10" />
        <div className="space-y-10">
          <__Spinner />
          <hr />
          <__Tags />
          <hr />
          <__RichTextEditor />
        </div>
        <div className="h-10" />
      </main>
    </TooltipProvider>
  );
}

function __Spinner() {
  return (
    <div className="grid gap-4">
      <label>Spinner</label>
      <Spinner />
    </div>
  );
}

function __Tags() {
  const options = [
    { id: "apple", text: "apple" },
    { id: "banana", text: "banana" },
    { id: "cherry", text: "cherry" },
    { id: "date", text: "date" },
    { id: "elderberry", text: "elderberry" },
    { id: "fig", text: "fig" },
    { id: "grape", text: "grape" },
    { id: "honeydew", text: "honeydew" },
    { id: "kiwi", text: "kiwi" },
    { id: "lemon", text: "lemon" },
  ];
  const [tags, setTags] = useState<{ id: string; text: string }[]>([]);
  return (
    <div className="grid gap-4">
      <label>Tag Input</label>
      <TagInput
        tags={tags}
        setTags={setTags}
        enableAutocomplete
        autocompleteOptions={options}
        activeTagIndex={null}
        setActiveTagIndex={() => {}}
      />
    </div>
  );
}

function __RichTextEditor() {
  return (
    <div className="grid gap-4">
      <MinimalTiptapEditor />
    </div>
  );
}
