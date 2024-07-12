import {
  withTemplate,
  ZTemplateSchema,
} from "@/scaffolds/canvas/with-template";
import { HalfHeightGradient } from "./gradient-overlay";
import { z } from "zod";

const HeroCardSchema = z.object({
  props: z.object({
    background: z.string(),
    h1: z.string(),
    p: z.string(),
  }),
}) satisfies ZTemplateSchema<any>;

type CardProps = z.infer<typeof HeroCardSchema>["props"];

export const Hero_001 = withTemplate(
  function Hero_001() {
    return (
      <header>
        <div className="relative">
          <video
            className="w-full aspect-[3/4] @5xl/preview:aspect-video object-cover -z-10"
            autoPlay
            loop
            muted
            playsInline
            src="https://player.vimeo.com/progressive_redirect/playback/860123788/rendition/1080p/file.mp4?loc=external&log_user=0&signature=ac9c2e0d2e367d8a31af6490edad8c1f7bae87d085c4f3909773a7ca5a129cb6"
          />
          <div className="absolute bottom-8 bg-background max-w-md container py-4">
            <h1 className="text-4xl font-semibold">The Bundle</h1>
            <p className="text-lg">
              A collection of events and meetups for developers and designers.
            </p>
          </div>
        </div>
      </header>
    );
  },
  "templates/components/cards/hero-001",
  HeroCardSchema
);

export const Hero_002 = withTemplate(
  function Hero_002() {
    return (
      <header>
        <div className="relative">
          <video
            className="w-full aspect-[3/4] @5xl/preview:aspect-video object-cover -z-10"
            autoPlay
            loop
            muted
            playsInline
            src="https://player.vimeo.com/progressive_redirect/playback/860123788/rendition/1080p/file.mp4?loc=external&log_user=0&signature=ac9c2e0d2e367d8a31af6490edad8c1f7bae87d085c4f3909773a7ca5a129cb6"
          />
          <HalfHeightGradient />
          <div className="text-background absolute bottom-8 max-w-md container py-4">
            <h1 className="text-4xl font-semibold">The Bundle</h1>
            <p className="text-lg">
              A collection of events and meetups for developers and designers.
            </p>
          </div>
        </div>
      </header>
    );
  },
  "templates/components/cards/hero-002",
  HeroCardSchema
);
