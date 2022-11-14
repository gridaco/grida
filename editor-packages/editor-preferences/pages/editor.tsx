import React from "react";
import styled from "@emotion/styled";
import { PageContentLayout } from "../layouts";
import { CanvasModeSelectItem } from "../components";
import { PreferencePageProps } from "core";

export function EditorPreferencePage({ dispatch, state }: PreferencePageProps) {
  const { renderer } = state.config.canvas;
  return (
    <PageContentLayout>
      <h1>Editor</h1>

      <section>
        <h2>Canvas Renderer</h2>
        <div style={{ height: 16 }} />
        <CanvasModeSelection
          selection={renderer}
          onSelectionChange={(renderer) => {
            dispatch({
              type: "configure",
              update: {
                canvas: {
                  renderer,
                },
              },
            });
          }}
        />
        <div style={{ height: 20 }} />
        <Description>
          💁‍♀️ <strong>What is it?</strong>
          <br />
          {canvas_mode_card_meta[renderer].description}
        </Description>
      </section>
    </PageContentLayout>
  );
}

const Description = styled.p`
  max-width: 260px;
  color: white;
  opacity: 0.8;
  font-size: 0.8em;
`;

const renderer_engines = [
  "bitmap-renderer",
  // "figma-renderer",
  "vanilla-renderer",
] as const;

function CanvasModeSelection({
  selection,
  onSelectionChange,
}: {
  selection: typeof renderer_engines[number];
  onSelectionChange: (selection: typeof renderer_engines[number]) => void;
}) {
  return (
    <SelectionLayout>
      {renderer_engines.map((item) => {
        const { name } = canvas_mode_card_meta[item];
        return (
          <CanvasModeSelectItem
            key={item}
            mode={item}
            label={name}
            onClick={() => onSelectionChange(item)}
            selected={selection === item}
          />
        );
      })}
    </SelectionLayout>
  );
}

const SelectionLayout = styled.div`
  display: flex;
  flex-direction: row;
  gap: 16px;
`;

const canvas_mode_card_meta = {
  "bitmap-renderer": {
    name: "Bitmap Renderer",
    description:
      "[Bitmap Renderer] renders canvas with static bitmap images, bootups slower, efficient on large canvas",
  },
  // "figma-renderer": {
  //   name: "Figma Renderer",
  // },
  "vanilla-renderer": {
    name: "Vanilla Renderer (Beta)",
    description:
      "[Vanilla Renderer] renders canvas with code-translated html/css iframes, bootups faster, can be heavy on large canvas.",
  },
} as const;
