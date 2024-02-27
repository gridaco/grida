import React, { useCallback } from "react";
import {
  PropertyLine,
  PropertyLines,
  PropertyGroup,
  PropertyGroupHeader,
  PropertyInput,
} from "@editor-ui/property";
import * as Popover from "@radix-ui/react-popover";
import { ColorPicker } from "@editor-ui/color-picker";
import { useDispatch } from "core/dispatch";
import { useInspectorElement } from "hooks/use-inspector-element";
import { ColorChip } from "@code-editor/property";

export function CraftBorderSection() {
  const dispatch = useDispatch();

  return (
    <PropertyGroup>
      <PropertyGroupHeader>
        <h6>Border</h6>
      </PropertyGroupHeader>
      <PropertyLines>
        <PropertyLine label="Width">
          <PropertyInput
            min={0}
            max={100}
            stopPropagation
            type="number"
            suffix={"px"}
            onChange={(text) => {
              const val = Number(text);

              if (isNaN(val)) {
                return;
              }
            }}
            value={0}
          />
        </PropertyLine>
        <PropertyLine label="Color">
          <Popover.Root>
            <Popover.Trigger>
              <ColorChip
                outline
                color={{
                  r: 1,
                  g: 1,
                  b: 1,
                  o: 1,
                }}
              />
            </Popover.Trigger>
            <Popover.Content>
              <ColorPicker
              // color={color}
              // onChange={(color) => {
              //   setColor(color);
              //   draftColor(color);
              // }}
              />
            </Popover.Content>
          </Popover.Root>
        </PropertyLine>
      </PropertyLines>
    </PropertyGroup>
  );
}
