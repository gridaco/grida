"use client";

import { models } from "@grida/ai-models";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@app/ui/components/select";

/**
 * Provider-hidden video-model picker (#908). Lists only the curated
 * (`listed: true`) video models by friendly label — never by provider. The
 * agent host resolves the provider per request from the user's connected key.
 */
export function VideoModelPicker({
  value,
  onValueChange,
  disabled,
}: {
  value: string;
  onValueChange: (id: string) => void;
  disabled?: boolean;
}) {
  const listed = models.video.listed_models();
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Choose a model" />
      </SelectTrigger>
      <SelectContent>
        {listed.map((card) => (
          <SelectItem key={card.id} value={card.id}>
            {card.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
