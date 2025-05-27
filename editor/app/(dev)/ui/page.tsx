"use client";
import React, { useState } from "react";
import { Spinner } from "@/components/spinner";
import { TagInput } from "@/components/tag";
import { Progress } from "@/components/ui/progress";
import { Progress as EditorProgress } from "@/components/ui-editor/progress";
import { MinimalTiptapEditor } from "@/kits/minimal-tiptap";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import OriginComp569 from "./comp/comp-569";
import { PhoneInput } from "@/components/extension/phone-input";
import { Timeline } from "@/grida-react-timeline-wd";

export default function AllComponentsPage() {
  return (
    <TooltipProvider>
      <main className="container max-w-screen-lg mx-auto">
        <div className="h-10" />
        <div className="space-y-10">
          <__Spinner />
          <hr />
          <__Progress />
          <hr />
          <__Tags />
          <hr />
          <__PhoneInput />
          <hr />
          <__RichTextEditor />
          <hr />
          <__Timeline />
          <hr />
          <OriginComp569 />
        </div>
        <div className="h-10" />
      </main>
    </TooltipProvider>
  );
}

function __Progress() {
  return (
    <div className="grid gap-4">
      <label>Progress</label>
      <Progress value={50} />
      <EditorProgress indeterminate />
    </div>
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

function __PhoneInput() {
  return (
    <div className="grid gap-4">
      <label>Phone Input</label>
      <PhoneInput />
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

function __Timeline() {
  return (
    <div className="grid gap-4">
      <Timeline />
    </div>
  );
}
