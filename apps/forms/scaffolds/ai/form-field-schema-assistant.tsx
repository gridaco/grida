"use client";

import React, { useEffect, useState } from "react";
import { NewFormFieldInit } from "@/types";
import { LightningBoltIcon } from "@radix-ui/react-icons";

export function FormFieldAssistant({
  onSuggestion,
}: {
  onSuggestion?: (schema: NewFormFieldInit) => void;
}) {
  const [description, setDescription] = useState("");
  const [schema, setSchema] = useState<NewFormFieldInit | null>(null);
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
        const data = await response.json();
        setSchema(data);
        console.log(data);
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
    <div className="w-full border dark:border-neutral-700 rounded-lg p-4 shadow-sm bg-white dark:bg-black">
      <div className="flex items-center mb-4">
        <LightningBoltIcon className="w-4 h-4 mr-2" />
        <span className="font-semibold text-neutral-800 dark:text-neutral-200">
          Ask AI
        </span>
      </div>
      <textarea
        autoFocus
        className="block p-2.5 w-full text-sm text-neutral-900 bg-neutral-50 rounded-lg border border-neutral-300 focus:ring-blue-500 focus:border-blue-500 dark:bg-neutral-700 dark:border-neutral-600 dark:placeholder-neutral-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
        value={description}
        placeholder="Describe the field..."
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={onKeyDown}
        rows={4}
        disabled={isLoading}
      />
      <button
        className={`mt-3 w-full inline-flex justify-center items-center gap-2 rounded-md p-2 text-white ${isLoading ? "bg-neutral-400" : "bg-blue-600 hover:bg-blue-700"} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
        onClick={assist}
        disabled={isLoading}
      >
        {isLoading ? (
          <svg
            className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        ) : (
          <LightningBoltIcon className="w-5 h-5" />
        )}
        Generate
      </button>
    </div>
  );
}
