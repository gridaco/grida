import { ColorPicker } from "@editor-ui/color-picker";
import * as Popover from "@radix-ui/react-popover";
import type { RGBA, RGBAF } from "@reflect-ui/core";
import { ColorChip, GradientChip } from "@code-editor/property";
import { useDispatch } from "core/dispatch";
import { useCallback, useState } from "react";
import {
  PropertyGroup,
  PropertyGroupHeader,
  PropertyLine,
  PropertyLines,
} from "@editor-ui/property";
import { rgb255to_rgb1 } from "utils/color-convert";
import { useInspectorElement } from "hooks/use-inspector-element";

export function CraftForegroundColorSection() {
  const element = useInspectorElement();
  const dispatch = useDispatch();
  const [color, setColor] = useState<RGBA>({
    r: 255,
    g: 255,
    b: 255,
    a: 1,
  });

  const draftColor = useCallback(
    (color: RGBA) => {
      dispatch({
        type: "(draft)/(craft)/node/foreground-color",
        color: color,
      });
    },
    [dispatch]
  );

  if (!element || !element.style.color) {
    return <></>;
  }

  return (
    <PropertyGroup>
      <PropertyGroupHeader>
        <h6>Foreground</h6>
      </PropertyGroupHeader>
      <PropertyLines>
        <PropertyLine label="Color">
          <Popover.Root>
            <Popover.Trigger>
              <ColorChip
                outline
                color={color ? rgb255to_rgb1(color) : undefined}
              />
            </Popover.Trigger>
            <Popover.Content>
              <ColorPicker
                color={color}
                onChange={(color) => {
                  setColor(color);
                  draftColor(color);
                }}
              />
            </Popover.Content>
          </Popover.Root>
        </PropertyLine>
      </PropertyLines>
    </PropertyGroup>
  );
}
