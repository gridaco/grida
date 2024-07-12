import React from "react";
import { Card } from "@/components/ui/card";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { HalfHeightGradient } from "../components/gradient-overlay";
import {
  withTemplate,
  ZTemplateSchema,
} from "@/scaffolds/canvas/with-template";
import { z } from "zod";
import { SlashIcon } from "@radix-ui/react-icons";

const CardSchema = z.object({
  props: z.object({
    badge: z.string(),
    h1: z.string(),
    p: z.string(),
    date1: z.string(),
    n: z.number(),
    image: z.string(),
  }),
}) satisfies ZTemplateSchema<any>;

type CardProps = z.infer<typeof CardSchema>["props"];

const Card_001Component: React.FC<{}> = (props) => {
  return (
    <Card className="group relative overflow-hidden rounded-lg shadow-lg transition-all hover:shadow-xl">
      <div className="flex overflow-hidden rounded-t-lg">
        <Image
          src="/images/abstract-placeholder.jpg"
          alt="Event thumbnail"
          width={800}
          height={400}
          className="h-full w-full aspect-[4/3] object-cover transition-transform duration-300 ease-in-out group-hover:scale-105"
        />
      </div>
      <div className="space-y-2 bg-background p-4">
        <h3 className="text-lg font-semibold text-foreground">Tech Meetup</h3>
        <div className="text-sm text-muted-foreground">
          <span>July 20, 2024</span>
          <span className="mx-2">·</span>
          <span>6:00 PM - 9:00 PM</span>
        </div>
        <div className="text-sm text-muted-foreground">
          Hosted at The Innovation Hub
        </div>
      </div>
    </Card>
  );
};

const Card_002Component: React.FC<CardProps> = ({
  h1,
  p,
  date1,
  n,
  badge,
  image,
}) => {
  return (
    <Card className="relative overflow-hidden flex-1 flex flex-col justify-end gap-6 text-foreground w-auto aspect-[4/4]">
      <Image
        className="absolute top-0 left-0 w-full h-full object-cover z-0"
        src={image}
        alt={""}
        layout="fill"
      />
      <HalfHeightGradient />
      <div className="absolute top-0 left-0 py-4 px-4">
        <Badge>{badge}</Badge>
      </div>
      <div className="text-background flex flex-col gap-1 z-20 py-8 px-4 pr-10">
        <div className="flex flex-row items-center gap-2">
          <div className="flex gap-2 items-center justify-between">
            <span>{date1}</span>
          </div>
          <SlashIcon />
          <span>
            <strong>{n}</strong>
          </span>
        </div>
        <h1 className="text-3xl font-bold break-keep max-w-[80%]">{h1}</h1>
        <p className="text-xs font-regular opacity-80">{p}</p>
      </div>
    </Card>
  );
};

export const Card_001 = withTemplate(
  Card_001Component,
  "templates/components/cards/card-001",
  CardSchema
);
export const Card_002 = withTemplate(
  Card_002Component,
  "templates/components/cards/card-002",
  CardSchema
);

//
//
//

const HeroCardSchema = z.object({
  props: z.object({
    background: z.string(),
    h1: z.string(),
    p: z.string(),
  }),
}) satisfies ZTemplateSchema<any>;

type HeroCardProps = z.infer<typeof HeroCardSchema>["props"];

export const Hero_001 = withTemplate(
  function Hero_001(props: HeroCardProps) {
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
  function Hero_002(props: HeroCardProps) {
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
