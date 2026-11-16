/**
 * Home output intents and gallery choices. The shared composer displays the
 * selected intent; prompt lowering makes that choice explicit to the agent.
 * These are ordinary user instructions, not a separate agent or skill protocol.
 */

import type { ComponentType } from "react";
import {
  HouseIcon,
  ImageIcon,
  PresentationIcon,
  VideoIcon,
} from "lucide-react";

export type ApplicationPresetId = "general" | "image" | "video" | "slides";

export interface ApplicationPresetSpec {
  id: ApplicationPresetId;
  /** Rail tooltip + composer chip label. */
  label: string;
  /** Icon-only rail glyph + composer chip glyph. */
  icon: ComponentType<{ className?: string }>;
  /**
   * One-line, marketable pitch for the mode — the body of the rail's
   * tutorial-style hover card.
   */
  description: string;
  /**
   * Public path to the hover card's 16:9 artwork. A static asset (not inline
   * SVG) so it can later be swapped for a proper gif/image without a code change
   * — drop a replacement at the same path under `editor/public`.
   *
   * Doubles as the "is this a marketable mode?" marker: the neutral `general`
   * (Home) base omits it, so the rail shows a plain label (not a hover card) and
   * the composer stamps no chip for it. The three modes carry it.
   */
  art?: string;
  /**
   * Marks a mode as not-yet-available: the rail shows it dimmed + non-clickable
   * with a "coming soon" hint, and it can't be selected as the active preset.
   */
  comingSoon?: boolean;
}

export namespace ApplicationPreset {
  export const DEFAULT: ApplicationPresetId = "general";

  /** Registry — rail order is list order; `general` (home) leads. */
  export const list: readonly ApplicationPresetSpec[] = [
    {
      id: "general",
      label: "Home",
      icon: HouseIcon,
      description:
        "Start anywhere. Describe an idea or drop a reference — Grida drafts the first version for you.",
    },
    {
      id: "slides",
      label: "Slides",
      icon: PresentationIcon,
      description:
        "Go from a topic to a full, editable deck. Structured slides in seconds.",
      art: "/assets/desktop-home/presets/slides.svg",
    },
    {
      id: "image",
      label: "Images",
      icon: ImageIcon,
      description:
        "Generate product shots, logos, and illustrations from a single sentence.",
      art: "/assets/desktop-home/presets/image.svg",
    },
    {
      id: "video",
      label: "Videos",
      icon: VideoIcon,
      description:
        "Turn a prompt into short looping motion — logo reveals, pans, and animations.",
      art: "/assets/desktop-home/presets/video.svg",
      comingSoon: true,
    },
  ];

  export function byId(id: ApplicationPresetId): ApplicationPresetSpec {
    return list.find((p) => p.id === id) ?? list[0];
  }

  /** Preserve the user's words and make the selected output explicit. */
  export function prompt(id: ApplicationPresetId, text: string): string {
    const intent =
      id === "slides"
        ? "Create an editable slide deck."
        : id === "image"
          ? "Create an image."
          : "";
    return [intent, text.trim()].filter(Boolean).join("\n\n");
  }
}
