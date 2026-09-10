"use client";

import { catalog as models } from "@grida/ai-models/grida";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@app/ui/components/select";
import { MediaModelPickerTrigger } from "../shared/media-model-picker-trigger";

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
      <MediaModelPickerTrigger>
        <SelectValue placeholder="Choose a model" />
      </MediaModelPickerTrigger>
      <SelectContent>
        {listed.map((card) => (
          <SelectItem key={card.id} value={card.id}>
            {card.label}
            {card.deprecated && (
              <span className="text-muted-foreground"> · Legacy</span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
