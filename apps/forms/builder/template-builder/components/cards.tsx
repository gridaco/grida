import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HalfHeightGradient } from "./gradient-overlay";
import { SlashIcon } from "@radix-ui/react-icons";
import { withTemplateDefinition } from "@/builder/template-builder/with-template";
import { NodeElement } from "@/builder/template-builder/node";
import { Media } from "./media";
import { TemplateBuilderWidgets } from "../widgets";
import { grida } from "@/grida";

const card_properties_definition = {
  badge: { type: "string" },
  tags: { type: "array", items: { type: "string" } },
  h1: { type: "string" },
  p: { type: "string" },
  date1: { type: "string" },
  date2: { type: "string" },
  n: { type: "number" },
  media: { type: "image" },
  // media: MediaSchema,
} satisfies grida.program.document.template.TemplateDocumentDefinition["properties"];

type CardUserProps = grida.program.schema.TInferredPropTypes<
  typeof card_properties_definition
>;

type CardMasterProps =
  grida.program.document.template.IUserDefinedTemplateNodeReactComponentRenderProps<CardUserProps>;

export const Card_001 = withTemplateDefinition(
  ({
    props: { h1, p, date1, n, badge, media, date2, tags },
    style,
  }: CardMasterProps) => {
    return (
      <Card
        className="group relative overflow-hidden rounded-lg shadow-lg transition-all hover:shadow-xl"
        style={grida.program.css.toReactCSSProperties(style)}
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
            alt={""}
            width={800}
            height={400}
            className="h-full w-full aspect-[4/3] object-cover transition-transform duration-300 ease-in-out group-hover:scale-105"
          />
        </div>
        <div className="space-y-2 bg-background p-4">
          <NodeElement
            // text={h1}
            node_id={".h1"}
          />
          {/* <h3 className="text-lg font-semibold text-foreground">{h1}</h3> */}
          <div className="text-sm text-muted-foreground">
            <span>{date1}</span>
            <span className="mx-2">·</span>
            <span>{date2}</span>
          </div>
          <div className="text-sm text-muted-foreground">{p}</div>
          <NodeElement
            node_id="tags-layout"
            style={{
              gap: 4,
            }}
          >
            {tags?.map((t, i) => <Badge key={i}>{t}</Badge>)}
          </NodeElement>
        </div>
      </Card>
    );
  },
  "templates/components/cards/card-001",
  {
    name: "templates/components/cards/card-001",
    default: {
      h1: "Title",
      p: "Description",
      date1: "2021-01-01",
      n: 0,
      badge: "New",
      media: { type: "image", src: "" },
      date2: "2021-01-01",
      tags: ["tag1", "tag2"],
    },
    nodes: {
      ".h1": {
        id: ".h1",
        active: true,
        locked: false,
        type: "text",
        name: "Title",
        text: "Title",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
      ".p": {
        id: ".p",
        active: true,
        locked: false,
        type: "text",
        name: "Description",
        text: "Description",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
      ".date1": {
        id: ".date1",
        active: true,
        locked: false,
        type: "text",
        name: "Date 1",
        text: "2021-01-01",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
      ".n": {
        id: ".n",
        active: true,
        locked: false,
        type: "text",
        name: "Number",
        text: "0",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
      ".badge": {
        id: ".badge",
        active: true,
        locked: false,
        type: "text",
        name: "Badge",
        text: "New",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
      ".media": {
        id: ".media",
        active: true,
        locked: false,
        type: "image",
        name: "Media",
        src: "",
        alt: "",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
      ".date2": {
        id: ".date2",
        active: true,
        locked: false,
        type: "text",
        name: "Date 2",
        text: "2021-01-01",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
      ".tags": {
        id: ".tags",
        active: true,
        locked: false,
        type: "container",
        name: "Tags",
        expanded: false,
        opacity: 1,
        zIndex: 0,
        style: {},
      },
    },
    type: "template",
    properties: card_properties_definition,
    version: "0.0.0",
  }
);

export const Card_002 = withTemplateDefinition(
  ({
    props: { h1, p, date1, n, badge, media, date2, tags },
    style,
  }: CardMasterProps) => {
    return (
      <Card
        className="relative overflow-hidden flex-1 flex flex-col justify-end gap-6 text-foreground w-auto aspect-[4/4]"
        style={grida.program.css.toReactCSSProperties(style)}
      >
        <Media
          type={media.type}
          src={media.src}
          // alt={media.alt}
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
  },
  "templates/components/cards/card-002",
  {
    name: "templates/components/cards/card-002",
    default: {
      h1: "Title",
      p: "Description",
      date1: "2021-01-01",
      n: 0,
      badge: "New",
      media: { type: "image", src: "" },
      date2: "2021-01-01",
      tags: ["tag1", "tag2"],
    },
    nodes: {
      ".h1": {
        id: ".h1",
        active: true,
        locked: false,
        type: "text",
        name: "Title",
        text: "Title",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
      ".p": {
        id: ".p",
        active: true,
        locked: false,
        type: "text",
        name: "Description",
        text: "Description",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
      ".date1": {
        id: ".date1",
        active: true,
        locked: false,
        type: "text",
        name: "Date 1",
        text: "2021-01-01",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
      ".n": {
        id: ".n",
        active: true,
        locked: false,
        type: "text",
        name: "Number",
        text: "0",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
      ".badge": {
        id: ".badge",
        active: true,
        locked: false,
        type: "text",
        name: "Badge",
        text: "New",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
      ".media": {
        id: ".media",
        active: true,
        locked: false,
        type: "image",
        name: "Media",
        src: "",
        alt: "",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
      ".date2": {
        id: ".date2",
        active: true,
        locked: false,
        type: "text",
        name: "Date 2",
        text: "2021-01-01",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
      ".tags": {
        id: ".tags",
        active: true,
        locked: false,
        type: "container",
        name: "Tags",
        expanded: false,
        opacity: 1,
        zIndex: 0,
        style: {},
      },
    },
    type: "template",
    properties: card_properties_definition,
    version: "0.0.0",
  }
);

export const Card_003 = withTemplateDefinition(
  ({
    props: { h1, p, date1, n, badge, media, date2, tags },
    style,
  }: CardMasterProps) => {
    return (
      <Card
        className="p-4"
        style={grida.program.css.toReactCSSProperties(style)}
      >
        <NodeElement
          node_id="root"
          style={{
            gap: 4,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <div className="flex-1 flex flex-col gap-1 z-20">
            <NodeElement
              node_id="header-layout"
              style={{
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
            </NodeElement>
            <p className="text-xs font-regular opacity-80">{p}</p>
            <NodeElement
              node_id="tags-layout"
              style={{
                gap: 4,
              }}
            >
              {tags?.map((t, i) => <Badge key={i}>{t}</Badge>)}
            </NodeElement>
          </div>
          <NodeElement
            node_id="media-layout"
            style={{
              width: 80,
              height: 80,
              // borderRadius: 8,
              // overflow: "hidden",
            }}
          >
            <Media
              type={media.type}
              src={media.src}
              // alt={media.alt}
              width={400}
              height={400}
              className="object-cover w-full h-full"
            />
          </NodeElement>
        </NodeElement>
      </Card>
    );
  },
  "templates/components/cards/card-003",
  {
    name: "templates/components/cards/card-003",
    default: {
      h1: "Title",
      p: "Description",
      date1: "2021-01-01",
      n: 0,
      badge: "New",
      media: { type: "image", src: "" },
      date2: "2021-01-01",
      tags: ["tag1", "tag2"],
    },
    nodes: {
      ".h1": {
        id: ".h1",
        active: true,
        locked: false,
        type: "text",
        name: "Title",
        text: "Title",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
      ".p": {
        id: ".p",
        active: true,
        locked: false,
        type: "text",
        name: "Description",
        text: "Description",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
      ".date1": {
        id: ".date1",
        active: true,
        locked: false,
        type: "text",
        name: "Date 1",
        text: "2021-01-01",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
      ".n": {
        id: ".n",
        active: true,
        locked: false,
        type: "text",
        name: "Number",
        text: "0",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
      ".badge": {
        id: ".badge",
        active: true,
        locked: false,
        type: "text",
        name: "Badge",
        text: "New",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
      ".media": {
        id: ".media",
        active: true,
        locked: false,
        type: "image",
        name: "Media",
        src: "",
        alt: "",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
      ".date2": {
        id: ".date2",
        active: true,
        locked: false,
        type: "text",
        name: "Date 2",
        text: "2021-01-01",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
      ".tags": {
        id: ".tags",
        active: true,
        locked: false,
        type: "container",
        name: "Tags",
        expanded: false,
        opacity: 1,
        zIndex: 0,
        style: {},
      },
    },
    type: "template",
    properties: card_properties_definition,
    version: "0.0.0",
  }
);

const hero_card_properties_definition = {
  media: { type: "image" },
  h1: { type: "string" },
  p: { type: "string" },
} satisfies grida.program.document.template.TemplateDocumentDefinition["properties"];

type HeroCardProps = grida.program.schema.TInferredPropTypes<
  typeof hero_card_properties_definition
>;

type HeroCardMasterProps =
  grida.program.document.template.IUserDefinedTemplateNodeReactComponentRenderProps<HeroCardProps>;

export const Hero_001 = withTemplateDefinition(
  function Hero_001({ props: { h1, p, media }, style }: HeroCardMasterProps) {
    return (
      <header style={grida.program.css.toReactCSSProperties(style)}>
        <div className="relative">
          <Media
            type={media.type}
            src={media.src}
            // alt={media.alt}
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
  {
    name: "templates/components/cards/hero-001",
    default: {
      h1: "Title",
      p: "Description",
      media: { type: "image", src: "" },
    },
    nodes: {
      ".h1": {
        id: ".h1",
        active: true,
        locked: false,
        type: "text",
        name: "Title",
        text: "Title",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
      ".p": {
        id: ".p",
        active: true,
        locked: false,
        type: "text",
        name: "Description",
        text: "Description",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
      ".media": {
        id: ".media",
        active: true,
        locked: false,
        type: "image",
        name: "Media",
        src: "",
        alt: "",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
    },
    type: "template",
    properties: hero_card_properties_definition,
    version: "0.0.0",
  }
);

export const Hero_002 = withTemplateDefinition(
  function Hero_002({ props: { h1, p, media }, style }: HeroCardMasterProps) {
    return (
      <header
        style={grida.program.css.toReactCSSProperties(style)}
        className="relative aspect-[3/4]"
      >
        {media && (
          <Media
            type={media.type}
            src={media.src}
            // alt={media.alt}
            width={800}
            height={400}
            className="w-full h-full object-cover -z-10"
          />
        )}
        <HalfHeightGradient />
        <div className="text-background absolute bottom-8 max-w-md container py-4">
          <h1 className="text-4xl font-semibold">{h1}</h1>
          <p className="text-lg">{p}</p>
        </div>
      </header>
    );
  },
  "templates/components/cards/hero-002",
  {
    name: "templates/components/cards/hero-002",
    default: {
      h1: "Title",
      p: "Description",
      media: { type: "image", src: "" },
    },
    nodes: {
      ".h1": {
        id: ".h1",
        active: true,
        locked: false,
        type: "text",
        name: "Title",
        text: "Title",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
      ".p": {
        id: ".p",
        active: true,
        locked: false,
        type: "text",
        name: "Description",
        text: "Description",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
      ".media": {
        id: ".media",
        active: true,
        locked: false,
        type: "image",
        name: "Media",
        src: "",
        alt: "",
        opacity: 1,
        zIndex: 0,
        style: {},
      },
    },
    type: "template",
    properties: hero_card_properties_definition,
    version: "0.0.0",
  }
);
