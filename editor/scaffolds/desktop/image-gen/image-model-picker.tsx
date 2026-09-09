"use client";

import { models } from "@grida/ai-models";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@app/ui/components/select";
import { MediaModelPickerTrigger } from "../shared/media-model-picker-trigger";
import { MediaModelAvailability } from "../shared/media-model-availability";

/**
 * Provider-hidden image-model picker (#908). Lists only the curated
 * (`listed: true`) models by their friendly label. Provider-limited models
 * name their required key; the agent host resolves the connected provider.
 */
export function ImageModelPicker({
  value,
  onValueChange,
  disabled,
  providers,
}: {
  value: string;
  onValueChange: (id: string) => void;
  disabled?: boolean;
  providers: MediaModelAvailability.ImageProviderState;
}) {
  const listed = models.image.listed_models();
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <MediaModelPickerTrigger>
        <SelectValue placeholder="Choose a model" />
      </MediaModelPickerTrigger>
      <SelectContent>
        {listed.map((card) => {
          const access = MediaModelAvailability.image(card, providers);
          return (
            <SelectItem
              key={card.id}
              value={card.id}
              disabled={!access.available}
            >
              {card.label}
              {access.available &&
                models.image.binding(card, "fal") &&
                !models.image.binding(card, "vercel") &&
                !models.image.binding(card, "openrouter") && (
                  <span className="text-muted-foreground">
                    {" "}
                    · fal key required
                  </span>
                )}
              {!access.available && (
                <span className="text-muted-foreground">
                  {" "}
                  · {access.reason}
                </span>
              )}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
