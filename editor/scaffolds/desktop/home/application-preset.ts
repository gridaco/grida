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
  WorkflowIcon,
} from "lucide-react";

export type ApplicationPresetId =
  | "general"
  | "slides"
  | "image"
  | "workflows"
  | "video";

export interface ApplicationPresetSpec {
  id: ApplicationPresetId;
  /** Rail tooltip + composer chip label. */
  label: string;
  /** Icon-only rail glyph + composer chip glyph. */
  icon: ComponentType<{ className?: string }>;
  /** Question above the composer, before the workspace picker. */
  composerQuestion: string;
  /**
   * Short description for the rail's hover card.
   */
  description: string;
  /**
   * Public path to the hover card's 16:9 artwork. Presets without artwork use a plain tooltip.
   */
  art?: string;
  /** Tone of the artwork behind the hover-card caption. */
  artTone?: "light" | "dark";
  /** Still artwork for viewers who prefer reduced motion. */
  reducedMotionArt?: string;
  /** User intent prepended to the first message. */
  promptPrefix?: string;
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
      composerQuestion: "What would you like to do",
      description:
        "Start anywhere. Describe an idea or drop a reference — Grida drafts the first version for you.",
    },
    {
      id: "slides",
      label: "Slides",
      icon: PresentationIcon,
      composerQuestion: "What deck are we making",
      description: "Create editable decks.",
      art: "/assets/desktop-home/presets/slides.svg",
      artTone: "light",
      reducedMotionArt: "/assets/desktop-home/presets/slides.svg#still",
      promptPrefix: "Create an editable slide deck.",
    },
    {
      id: "image",
      label: "Images",
      icon: ImageIcon,
      composerQuestion: "What image should we make",
      description: "Generate images from a prompt.",
      art: "/assets/desktop-home/presets/image.svg",
      reducedMotionArt: "/assets/desktop-home/presets/image.svg#still",
    },
    {
      id: "workflows",
      label: "Workflows",
      icon: WorkflowIcon,
      composerQuestion: "What should we automate",
      description: "Build and run FX workflows.",
      art: "/assets/desktop-home/presets/workflows.svg",
      reducedMotionArt: "/assets/desktop-home/presets/workflows.svg#still",
    },
    {
      id: "video",
      label: "Videos",
      icon: VideoIcon,
      composerQuestion: "What should we bring to life",
      description: "Generate short video loops.",
      art: "/assets/desktop-home/presets/video.svg",
      reducedMotionArt: "/assets/desktop-home/presets/video.svg#still",
      comingSoon: true,
    },
  ];

  export function byId(id: ApplicationPresetId): ApplicationPresetSpec {
    return list.find((p) => p.id === id) ?? list[0];
  }

  export function fromParam(value: string | null): ApplicationPresetId {
    return (
      list.find((preset) => preset.id === value && !preset.comingSoon)?.id ??
      DEFAULT
    );
  }

  /** Preserve the user's words and make the selected output explicit. */
  export function prompt(id: ApplicationPresetId, text: string): string {
    const intent = byId(id).promptPrefix;
    return [intent, text.trim()].filter(Boolean).join("\n\n");
  }
}
