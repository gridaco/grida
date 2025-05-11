"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { forms_ai_shortcuts } from "@/scaffolds/playground/k";
import { ArrowTopRightIcon } from "@radix-ui/react-icons";
import { useMemo, useRef, useState } from "react";

export default function Prompt({ autoFocus }: { autoFocus?: boolean }) {
  const form = useRef<HTMLFormElement>(null);
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const placeholder = useMemo(
    () =>
      forms_ai_shortcuts[
        Math.floor(Math.random() * forms_ai_shortcuts.length)
      ][1],
    []
  );

  // shortcuts - pick 4 random shortcuts
  const shortcuts4 = useMemo(
    () =>
      forms_ai_shortcuts
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
          <Badge
            variant="outline"
            onClick={() => {
              setInput(content);
            }}
            className="cursor-pointer flex items-center gap-2 text-sm text-muted-foreground rounded-full transition-colors"
            key={name}
          >
            {name}
            <ArrowTopRightIcon />
          </Badge>
        ))}
      </div>
    </Card>
  );
}
