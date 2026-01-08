"use client";

import { Button } from "@/components/ui/button";
import React, { useMemo } from "react";
import {
  ScreenBackground,
  ScreenCenter,
  ScreenRoot,
  TextAlign,
} from "@/theme/templates/kit/components";
import type grida from "@grida/schema";
import { NodeElement } from "@/grida-canvas-react-renderer-dom/nodes/node";
import { useCTAContext } from "../../kit/contexts/cta.context";
import { factory } from "@grida/tokens";

const userprops = {
  title: { type: "string" },
  subtitle: { type: "string" },
  background: { type: "image" },
} satisfies grida.program.document.template.TemplateDocumentDefinition["properties"];

type UserProps = grida.program.schema.TInferredPropTypes<typeof userprops>;

export default function _003() {
  return <Consumer />;
}

function Consumer() {
  const { onClick } = useCTAContext();

  return (
    <ScreenRoot>
      <ScreenCenter>
        <section className="px-4 max-w-screen-sm z-10">
          <TextAlign align="center">
            <div className="flex flex-col justify-center items-center gap-4">
              <h1 className="text-6xl font-bold w-4/5">
                <NodeElement node_id="003.title" />
              </h1>
              <div className="text-lg text-foreground/80 w-4/5">
                <NodeElement node_id="003.subtitle" />
                {/* {data.subtitle} */}
              </div>
            </div>
          </TextAlign>
          <div className="flex justify-center items-center p-4 py-10">
            <Button disabled={closed} onClick={onClick}>
              Start Now
            </Button>
          </div>
        </section>
        <NodeElement node_id="003.background" />
      </ScreenCenter>
    </ScreenRoot>
  );
}

_003.definition = {
  type: "template",
  name: "003",
  properties: userprops,
  version: "1.0.0",
  default: {
    title: "Enter Title",
    subtitle: "Enter Subtitle",
    background: "/images/abstract-placeholder.jpg",
  },
  links: {},
  nodes: {
    "003.title": {
      id: "003.title",
      active: true,
      locked: false,
      type: "tspan",
      name: "Title",
      text: factory.createPropertyAccessExpression(["props", "title"]),
      font_weight: 700,
      font_kerning: true,
      font_size: 60,
      text_align: "center",
      text_align_vertical: "center",
      text_decoration_line: "none",
      opacity: 1,
      z_index: 0,
      rotation: 0,
      layout_target_width: "auto",
      layout_target_height: "auto",
      position: "relative",
    },
    "003.subtitle": {
      id: "003.subtitle",
      active: true,
      locked: false,
      type: "tspan",
      name: "Subtitle",
      text: factory.createPropertyAccessExpression(["props", "subtitle"]),
      font_weight: 400,
      font_kerning: true,
      font_size: 18,
      text_align: "center",
      text_align_vertical: "center",
      text_decoration_line: "none",
      opacity: 1,
      z_index: 0,
      rotation: 0,
      layout_target_width: "auto",
      layout_target_height: "auto",
      position: "relative",
    },
    "003.background": {
      id: "003.background",
      active: true,
      locked: false,
      type: "image",
      name: "Background",
      src: factory.createPropertyAccessExpression(["props", "background"]),
      opacity: 1,
      z_index: 0,
      rotation: 0,
      fit: "cover",
      layout_target_width: "auto",
      layout_target_height: "auto",
      corner_radius: 0,
      position: "absolute",
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
    },
  },
} satisfies grida.program.document.template.TemplateDocumentDefinition;
