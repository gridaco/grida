"use client";

import React, { useEffect, useState } from "react";
import { FormFieldInit } from "@/types";
import { LightningBoltIcon, MagicWandIcon } from "@radix-ui/react-icons";
import { draftid } from "@/utils/id";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/spinner";

export function FormFieldAssistant({
  onSuggestion,
}: {
  onSuggestion?: (schema: FormFieldInit) => void;
}) {
  const [description, setDescription] = useState("");
  const [schema, setSchema] = useState<FormFieldInit | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const assist = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/private/editor/ai/schema", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ description }),
      });

      if (response.ok) {
        let data: FormFieldInit = await response.json();

        // process the response to match the schema
        data = {
          ...data,
          options:
            data.options?.map((option) => ({
              ...option,
              id: draftid(),
            })) || [],
        };

        setSchema(data);
        console.log("assist", data);
      } else {
        const error = await response.json();
        console.error(error);
      }
    } catch (error) {
      console.error("AI assistance error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (schema) {
      onSuggestion?.(schema);
    }
  }, [schema]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.metaKey) {
      assist();
    }
  };

  return (
    <div className="w-full border rounded-lg p-4 shadow-sm bg-background">
      <div className="flex items-center mb-4">
        <LightningBoltIcon className="w-4 h-4 mr-2" />
        <span className="font-semibold">Ask AI</span>
      </div>
      <div className="grid gap-3">
        <Textarea
          autoFocus
          value={description}
          placeholder="Describe the field..."
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={onKeyDown}
          rows={4}
          disabled={isLoading}
        />
        <Button
          variant="outline"
          className={`w-full`}
          onClick={assist}
          disabled={isLoading}
        >
          {isLoading ? (
            <Spinner className="w-5 h-5" />
          ) : (
            <MagicWandIcon className="w-5 h-5" />
          )}
          <span className="ml-2">Generate</span>
        </Button>
      </div>
    </div>
  );
}
