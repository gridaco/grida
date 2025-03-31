"use client";
import { ThemedMonacoEditor } from "@/components/monaco";
import { Authentication } from "@/lib/auth";
import { useState } from "react";

export function AuthPolicyJsonEditor({
  defaultValue,
  onValueChange,
}: {
  defaultValue: Authentication.Challenge[];
  onValueChange?: (value: Authentication.Challenge[]) => void;
}) {
  const [challengesJson, setChallengesJson] = useState(
    JSON.stringify(defaultValue, null, 2)
  );
  const [jsonError, setJsonError] = useState("");

  const handleJsonChange = (value: string | undefined) => {
    setChallengesJson(value ?? "");
    setJsonError("");

    try {
      const parsedChallenges = JSON.parse(value ?? "");
      if (!Array.isArray(parsedChallenges)) {
        setJsonError("Challenges must be an array");
        return;
      }

      // Validate each challenge has a type
      for (const challenge of parsedChallenges) {
        if (!challenge.type) {
          setJsonError("Each challenge must have a 'type' property");
          return;
        }
      }

      onValueChange?.(parsedChallenges);

      //
    } catch (error) {
      setJsonError("Invalid JSON format");
    }
  };

  return (
    <div className="w-full h-[400px]">
      <ThemedMonacoEditor
        language="json"
        width="100%"
        height="100%"
        onChange={handleJsonChange}
        value={challengesJson}
      />
      {jsonError && <p className="text-sm text-destructive">{jsonError}</p>}
    </div>
  );
}
