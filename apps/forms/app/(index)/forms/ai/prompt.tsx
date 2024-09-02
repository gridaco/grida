"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { shortcuts } from "@/scaffolds/playground/k";
import { ArrowTopRightIcon } from "@radix-ui/react-icons";
import { useMemo, useRef, useState } from "react";

export default function Prompt({ autoFocus }: { autoFocus?: boolean }) {
  const form = useRef<HTMLFormElement>(null);
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const placeholder = useMemo(
    () => shortcuts[Math.floor(Math.random() * shortcuts.length)][1],
    []
  );

  // shortcuts - pick 4 random shortcuts
  const shortcuts4 = useMemo(
    () =>
      shortcuts
        .sort(() => Math.random() - 0.5)
        .slice(0, 4)
        .map(([name, placeholder, content]) => ({
          name,
          placeholder,
          content,
        })),
    []
  );

  return (
    <Card className="w-full max-w-xl mx-auto space-y-4 border rounded-lg shadow-lg p-4">
      <form
        ref={form}
        onSubmit={() => {
          setSubmitted(true);
        }}
        className="space-y-4"
        method="POST"
        action="/playground/with-ai"
      >
        <div className="space-y-1">
          <Textarea
            autoFocus={autoFocus}
            className="min-h-[100px]"
            name="prompt"
            id="prompt"
            placeholder={placeholder}
            value={input}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.metaKey) {
                form.current?.submit();
              }
            }}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>
        <Button disabled={submitted} className="w-full" type="submit">
          Generate <span className="ms-4 text-xs opacity-50">⌘ + ↵</span>
        </Button>
      </form>
      <div className="flex flex-wrap items-center justify-center gap-1">
        {shortcuts4.map(({ name, content }) => (
          <button
            onClick={() => {
              setInput(content);
            }}
            className="flex items-center gap-2 text-sm border rounded-full px-2 py-1 text-opacity-50 text-black dark:text-white dark:text-opacity-75 hover:text-opacity-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            key={name}
          >
            {name}
            <ArrowTopRightIcon />
          </button>
        ))}
      </div>
    </Card>
  );
}
