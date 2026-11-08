"use client";

import { mediaModelChoices } from "@/lib/desktop/gg-models";
import { catalog as models } from "@grida/ai/catalogue";
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
  const listed = mediaModelChoices(
    models.image.listed_models(),
    providers.gg_models ?? [],
    "image"
  );
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <MediaModelPickerTrigger>
        <SelectValue placeholder="Choose a model" />
      </MediaModelPickerTrigger>
      <SelectContent>
        {listed.map((card) => {
          const nativeCard = models.image.models[card.id];
          const access = MediaModelAvailability.image(
            nativeCard,
            providers,
            false,
            card.id
          );
          return (
            <SelectItem
              key={card.id}
              value={card.id}
              disabled={!access.available}
            >
              {card.label}
              {card.deprecated && (
                <span className="text-muted-foreground"> · Legacy</span>
              )}
              {access.available &&
                nativeCard &&
                providers.configured.includes("fal") &&
                models.image.binding(nativeCard, "fal") &&
                !models.image.binding(nativeCard, "vercel") &&
                !models.image.binding(nativeCard, "openrouter") && (
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
