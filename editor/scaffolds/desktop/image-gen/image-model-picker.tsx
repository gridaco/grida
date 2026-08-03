"use client";

import { models } from "@grida/ai-models";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@app/ui/components/select";
import { MediaModelPickerTrigger } from "../shared/media-model-picker-trigger";

/**
 * Provider-hidden image-model picker (#908). Lists only the curated
 * (`listed: true`) models by their friendly label and what they're good for —
 * never by provider. The provider is implied by the user's connected key and
 * resolved per request by the agent host.
 */
export function ImageModelPicker({
  value,
  onValueChange,
  disabled,
}: {
  value: string;
  onValueChange: (id: string) => void;
  disabled?: boolean;
}) {
  const listed = models.image.listed_models();
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <MediaModelPickerTrigger>
        <SelectValue placeholder="Choose a model" />
      </MediaModelPickerTrigger>
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
