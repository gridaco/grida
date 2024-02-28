import React, { useState, useCallback } from "react";
import {
  PropertyLine,
  PropertyLines,
  PropertyGroup,
  PropertyGroupHeader,
  PropertyInput,
} from "@editor-ui/property";
import { PlusIcon } from "@radix-ui/react-icons";
import type { RGBA } from "@reflect-ui/core";
import * as Popover from "@radix-ui/react-popover";
import { ColorPicker } from "@editor-ui/color-picker";
import { useDispatch } from "core/dispatch";
import { useInspectorElement } from "hooks/use-inspector-element";
import { ColorChip } from "@code-editor/property";
import { rgb255to_rgb1 } from "utils/color-convert";

export function CraftBoxShadowSection() {
  const element = useInspectorElement();
  const dispatch = useDispatch();

  const onBoxShadowAdd = useCallback(() => {
    dispatch({
      type: "(craft)/node/box-shadow/add",
    });
  }, [dispatch]);

  const onBoxShadowColorChange = useCallback(
    (color: RGBA) => {
      dispatch({
        type: "(craft)/node/box-shadow/color",
        color,
      });
    },
    [dispatch]
  );

  const onBoxShadowOffsetChange = useCallback(
    (dx?: number, dy?: number) => {
      dispatch({
        type: "(craft)/node/box-shadow/offset",
        dx,
        dy,
      });
    },
    [dispatch]
  );

  const onBoxShadowBlurRadiusChange = useCallback(
    (radius: number) => {
      dispatch({
        type: "(craft)/node/box-shadow/blur-radius",
        radius,
      });
    },
    [dispatch]
  );

  const onBoxShadowSpreadChange = useCallback(
    (radius: number) => {
      dispatch({
        type: "(craft)/node/box-shadow/spread",
        radius,
      });
    },
    [dispatch]
  );

  if (!element) {
    return <></>;
  }

  const hasBoxShadow = !!element.style.boxShadow;

  if (!hasBoxShadow) {
    return (
      <PropertyGroup>
        <PropertyGroupHeader onClick={onBoxShadowAdd} dividers asButton>
          <h6>Box Shadow</h6>
          <button>
            <PlusIcon />
          </button>
        </PropertyGroupHeader>
      </PropertyGroup>
    );
  }

  const { color, blurRadius, offset, spreadRadius } = element.style.boxShadow;

  return (
    <PropertyGroup>
      <PropertyGroupHeader>
        <h6>Box Shadow</h6>
      </PropertyGroupHeader>
      <PropertyLines>
        <PropertyLine label="Offset">
          <PropertyInput
            value={offset.dx}
            min={0}
            stopPropagation
            type="number"
            suffix={"px"}
            prefix="x"
            onChange={(text) => {
              const val = Number(text);

              if (isNaN(val)) {
                return;
              }

              onBoxShadowOffsetChange(val, undefined);
            }}
          />
          <PropertyInput
            value={offset.dy}
            min={0}
            stopPropagation
            type="number"
            suffix={"px"}
            prefix="y"
            onChange={(text) => {
              const val = Number(text);

              if (isNaN(val)) {
                return;
              }

              onBoxShadowOffsetChange(undefined, val);
            }}
          />
        </PropertyLine>
        <PropertyLine label="Blur">
          <PropertyInput
            value={blurRadius}
            min={0}
            stopPropagation
            type="number"
            suffix={"px"}
            onChange={(text) => {
              const val = Number(text);

              if (isNaN(val)) {
                return;
              }

              onBoxShadowBlurRadiusChange(val);
            }}
          />
        </PropertyLine>
        <PropertyLine label="Spread">
          <PropertyInput
            value={spreadRadius}
            min={0}
            stopPropagation
            type="number"
            suffix={"px"}
            onChange={(text) => {
              const val = Number(text);

              if (isNaN(val)) {
                return;
              }

              onBoxShadowSpreadChange(val);
            }}
          />
        </PropertyLine>
        <PropertyLine label="Color">
          <Popover.Root>
            <Popover.Trigger>
              <ColorChip
                outline
                color={color ? rgb255to_rgb1(color as RGBA) : undefined}
              />
            </Popover.Trigger>
            <Popover.Content>
              <ColorPicker
                color={color as RGBA}
                onChange={(color) => {
                  onBoxShadowColorChange(color);
                }}
              />
            </Popover.Content>
          </Popover.Root>
        </PropertyLine>
      </PropertyLines>
    </PropertyGroup>
  );
}
