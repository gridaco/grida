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

function Media({
  type,
  src,
  alt,
  width,
  height,
  className,
}: {
  type: "image" | "video";
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  switch (type) {
    case "image":
      return (
        <img
          width={width}
          height={height}
          className={className}
          src={src}
          alt={alt}
        />
      );
    case "video":
      return (
        <video
          width={width}
          height={height}
          className={className}
          src={src}
          autoPlay
          loop
          muted
        />
      );
  }
}

const MediaSchema = z.object({
  $id: z.literal("media"),
  type: z.union([z.literal("image"), z.literal("video")]),
  src: z.string(),
  alt: z.string().optional(),
});

const CardSchema = z.object({
  $id: z.literal("ui-model-card"),
  props: z.object({
    badge: z.string(),
    h1: z.string(),
    p: z.string(),
    date1: z.string(),
    n: z.number(),
    media: MediaSchema,
  }),
}) satisfies ZTemplateSchema<any>;

type CardProps = z.infer<typeof CardSchema>["props"];

const Card_001Component: React.FC<CardProps> = ({
  h1,
  p,
  date1,
  n,
  badge,
  media,
}) => {
  return (
    <Card className="group relative overflow-hidden rounded-lg shadow-lg transition-all hover:shadow-xl">
      <div className="flex overflow-hidden rounded-t-lg">
        <Media
          type={media.type}
          src={media.src}
          alt={media.alt}
          width={800}
          height={400}
          className="h-full w-full aspect-[4/3] object-cover transition-transform duration-300 ease-in-out group-hover:scale-105"
        />
        {/* <Image
          src={media}
          alt="Event thumbnail"
          width={800}
          height={400}
          className="h-full w-full aspect-[4/3] object-cover transition-transform duration-300 ease-in-out group-hover:scale-105"
        /> */}
      </div>
      <div className="space-y-2 bg-background p-4">
        <h3 className="text-lg font-semibold text-foreground">{h1}</h3>
        <div className="text-sm text-muted-foreground">
          <span>July 20, 2024</span>
          <span className="mx-2">·</span>
          <span>6:00 PM - 9:00 PM</span>
        </div>
        <div className="text-sm text-muted-foreground">{p}</div>
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
  media,
}) => {
  return (
    <Card className="relative overflow-hidden flex-1 flex flex-col justify-end gap-6 text-foreground w-auto aspect-[4/4]">
      <Media
        type={media.type}
        src={media.src}
        alt={media.alt}
        width={800}
        height={800}
        className="absolute top-0 left-0 w-full h-full object-cover z-0"
      />
      {/* <Image
        className="absolute top-0 left-0 w-full h-full object-cover z-0"
        src={media}
        alt={""}
        layout="fill"
      /> */}
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
    media: MediaSchema,
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
          <Media
            type={props.media.type}
            src={props.media.src}
            alt={props.media.alt}
            width={800}
            height={400}
            className="w-full aspect-[3/4] @5xl/preview:aspect-video object-cover -z-10"
          />
          {/* <video
            className="w-full aspect-[3/4] @5xl/preview:aspect-video object-cover -z-10"
            autoPlay
            loop
            muted
            playsInline
            src={props.media}
          /> */}
          <div className="absolute bottom-8 bg-background max-w-md container py-4">
            <h1 className="text-4xl font-semibold">{props.h1}</h1>
            <p className="text-lg">{props.p}</p>
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
          <Media
            type={props.media.type}
            src={props.media.src}
            alt={props.media.alt}
            width={800}
            height={400}
            className="w-full aspect-[3/4] @5xl/preview:aspect-video object-cover -z-10"
          />
          {/* <video
            className="w-full aspect-[3/4] @5xl/preview:aspect-video object-cover -z-10"
            autoPlay
            loop
            muted
            playsInline
            src={props.media}
          /> */}
          <HalfHeightGradient />
          <div className="text-background absolute bottom-8 max-w-md container py-4">
            <h1 className="text-4xl font-semibold">{props.h1}</h1>
            <p className="text-lg">{props.p}</p>
          </div>
        </div>
      </header>
    );
  },
  "templates/components/cards/hero-002",
  HeroCardSchema
);
