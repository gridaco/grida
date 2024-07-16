import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HalfHeightGradient } from "./gradient-overlay";
import { z } from "zod";
import { SlashIcon } from "@radix-ui/react-icons";
import {
  PropsWithStyle,
  withTemplate,
  ZTemplateSchema,
} from "@/builder/template-builder/with-template";
import { SlotNode } from "@/builder/template-builder/node";
import { Media, MediaSchema } from "./media";
import { TemplateBuilderWidgets } from "../widgets";

const CardSchema = z.object({
  $id: z.literal("ui-model-card"),
  properties: z.object({
    badge: z.string(),
    tags: z.array(z.string()).optional(),
    h1: z.string(),
    p: z.string(),
    date1: z.string(),
    date2: z.string(),
    n: z.number(),
    media: MediaSchema,
  }),
}) satisfies ZTemplateSchema<any>;

type CardProps = z.infer<typeof CardSchema> & { style?: React.CSSProperties };

const Card_001Component: React.FC<PropsWithStyle<CardProps>> = ({
  properties: { h1, p, date1, n, badge, media, date2, tags },
  style,
}) => {
  return (
    <Card
      className="group relative overflow-hidden rounded-lg shadow-lg transition-all hover:shadow-xl"
      style={style}
    >
      <div className="flex overflow-hidden rounded-t-lg">
        {badge && (
          <div className="absolute z-10 top-0 left-0 py-4 px-4">
            <Badge>{badge}</Badge>
          </div>
        )}
        <Media
          type={media.type}
          src={media.src}
          alt={media.alt}
          width={800}
          height={400}
          className="h-full w-full aspect-[4/3] object-cover transition-transform duration-300 ease-in-out group-hover:scale-105"
        />
      </div>
      <div className="space-y-2 bg-background p-4">
        <SlotNode
          component={TemplateBuilderWidgets.Text}
          defaultText={h1}
          node_id={".h1"}
        />
        {/* <h3 className="text-lg font-semibold text-foreground">{h1}</h3> */}
        <div className="text-sm text-muted-foreground">
          <span>{date1}</span>
          <span className="mx-2">·</span>
          <span>{date2}</span>
        </div>
        <div className="text-sm text-muted-foreground">{p}</div>
        <SlotNode
          node_id="tags-layout"
          component={TemplateBuilderWidgets.Flex}
          defaultStyle={{
            gap: 4,
          }}
        >
          {tags?.map((t, i) => <Badge key={i}>{t}</Badge>)}
        </SlotNode>
      </div>
    </Card>
  );
};

const Card_002Component: React.FC<PropsWithStyle<CardProps>> = ({
  properties: { h1, p, date1, date2, n, badge, media, tags },
  style,
}) => {
  return (
    <Card
      className="relative overflow-hidden flex-1 flex flex-col justify-end gap-6 text-foreground w-auto aspect-[4/4]"
      style={style}
    >
      <Media
        type={media.type}
        src={media.src}
        alt={media.alt}
        width={800}
        height={800}
        className="absolute top-0 left-0 w-full h-full object-cover z-0"
      />
      <HalfHeightGradient />
      {badge && (
        <div className="absolute top-0 left-0 py-4 px-4">
          <Badge>{badge}</Badge>
        </div>
      )}
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

const Card_003Component: React.FC<PropsWithStyle<CardProps>> = ({
  properties: { h1, p, date1, date2, n, badge, media, tags },
  style,
}) => {
  return (
    <Card className="p-4" style={style}>
      <SlotNode
        component={TemplateBuilderWidgets.Flex}
        node_id="root"
        defaultStyle={{
          gap: 4,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <div className="flex-1 flex flex-col gap-1 z-20">
          <SlotNode
            node_id="header-layout"
            component={TemplateBuilderWidgets.Flex}
            defaultStyle={{
              gap: 4,
              flexDirection: "column",
            }}
          >
            <div className="flex flex-row items-center gap-2">
              <div className="flex gap-2 items-center justify-between">
                <span>{date1}</span>
              </div>
              <span>
                <strong>{n}</strong>
              </span>
            </div>
            <h1 className="text-lg font-bold break-keep">{h1}</h1>
          </SlotNode>
          <p className="text-xs font-regular opacity-80">{p}</p>
          <SlotNode
            node_id="tags-layout"
            component={TemplateBuilderWidgets.Flex}
            defaultStyle={{
              gap: 4,
            }}
          >
            {tags?.map((t, i) => <Badge key={i}>{t}</Badge>)}
          </SlotNode>
        </div>
        <SlotNode
          node_id="media-layout"
          component={TemplateBuilderWidgets.Container}
          defaultStyle={
            {
              width: 80,
              height: 80,
              borderRadius: 8,
              overflow: "hidden",
            } satisfies React.CSSProperties
          }
        >
          <Media
            type={media.type}
            src={media.src}
            alt={media.alt}
            width={400}
            height={400}
            className="object-cover w-full h-full"
          />
        </SlotNode>
      </SlotNode>
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
export const Card_003 = withTemplate(
  Card_003Component,
  "templates/components/cards/card-003",
  CardSchema
);

const HeroCardSchema = z.object({
  properties: z.object({
    media: MediaSchema,
    h1: z.string(),
    p: z.string(),
  }),
}) satisfies ZTemplateSchema<any>;

type HeroCardProps = z.infer<typeof HeroCardSchema>["properties"];

export const Hero_001 = withTemplate(
  function Hero_001({
    properties: { media, h1, p },
    style,
  }: PropsWithStyle<HeroCardProps>) {
    return (
      <header style={style}>
        <div className="relative">
          <Media
            type={media.type}
            src={media.src}
            alt={media.alt}
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
            <h1 className="text-4xl font-semibold">{h1}</h1>
            <p className="text-lg">{p}</p>
          </div>
        </div>
      </header>
    );
  },
  "templates/components/cards/hero-001",
  HeroCardSchema
);

export const Hero_002 = withTemplate(
  function Hero_002({
    properties: { media, h1, p },
    style,
    ...props
  }: PropsWithStyle<HeroCardProps>) {
    return (
      <header style={style} className="relative aspect-[3/4]">
        <Media
          type={media.type}
          src={media.src}
          alt={media.alt}
          width={800}
          height={400}
          className="w-full h-full object-cover -z-10"
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
          <h1 className="text-4xl font-semibold">{h1}</h1>
          <p className="text-lg">{p}</p>
        </div>
      </header>
    );
  },
  "templates/components/cards/hero-002",
  HeroCardSchema
);
