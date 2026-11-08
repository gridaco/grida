"use client";

import {
  mediaModelChoices,
  type CurrentGGModel,
} from "@/lib/desktop/gg-models";
import { MediaModelAvailability } from "../shared/media-model-availability";
import { catalog as models } from "@grida/ai/catalogue";
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
  current,
  providers,
}: {
  value: string;
  onValueChange: (id: string) => void;
  disabled?: boolean;
  current: readonly CurrentGGModel[] | null;
  providers: MediaModelAvailability.VideoProviderState;
}) {
  const listed = mediaModelChoices(
    models.video.listed_models(),
    current,
    "video"
  );
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <MediaModelPickerTrigger>
        <SelectValue placeholder="Choose a model" />
      </MediaModelPickerTrigger>
      <SelectContent>
        {value && !listed.some((card) => card.id === value) && (
          <SelectItem value={value} disabled>
            {value} · Unavailable
          </SelectItem>
        )}
        {listed.map((card) => (
          <SelectItem
            key={card.id}
            value={card.id}
            disabled={
              !MediaModelAvailability.video(card.id, current, providers)
                .available
            }
          >
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
