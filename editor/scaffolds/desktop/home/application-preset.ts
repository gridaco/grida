/**
 * `application_preset` — the home's mode registry (data only; UI lives in the
 * sibling `preset-rail.tsx` and `preset-chip.tsx`).
 *
 * SPIKE (see PR discussion): the desktop home is a SINGLE shared surface
 * (composer + reference gallery). "Images / Videos / Slides" are NOT separate
 * routes or workspaces — they're presets that re-theme the one home:
 *
 *   - the icon rail on the left mutates the active preset,
 *   - the composer stamps a mode CHIP for it (except neutral `general`),
 *   - the placeholder advertises what the mode makes,
 *   - (next seam) the gallery filters its visual references by the mode, and
 *     the preset rides the `welcome_handoff` so the created project's first
 *     turn already knows the outcome the user was aiming at.
 *
 * We're "overselling" a mode switch as if it were a destination — the rail
 * items act as the mutator, nothing structural changes underneath.
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
  /** Composer placeholder — the mode's representative example. */
  placeholder: string;
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
      placeholder: "Describe an image to create, or start from a reference…",
    },
    {
      id: "slides",
      label: "Slides",
      icon: PresentationIcon,
      description:
        "Go from a topic to a full, editable deck. Structured slides in seconds.",
      art: "/assets/desktop-home/presets/slides.svg",
      placeholder: "e.g., Create a 12-slide minimalist product launch deck.",
    },
    {
      id: "image",
      label: "Images",
      icon: ImageIcon,
      description:
        "Generate product shots, logos, and illustrations from a single sentence.",
      art: "/assets/desktop-home/presets/image.svg",
      placeholder: "e.g., A studio product photo of a ceramic mug on marble.",
    },
    {
      id: "video",
      label: "Videos",
      icon: VideoIcon,
      description:
        "Turn a prompt into short looping motion — logo reveals, pans, and animations.",
      art: "/assets/desktop-home/presets/video.svg",
      placeholder: "e.g., A 5-second looping animation of falling confetti.",
      comingSoon: true,
    },
  ];

  export function byId(id: ApplicationPresetId): ApplicationPresetSpec {
    return list.find((p) => p.id === id) ?? list[0];
  }
}
