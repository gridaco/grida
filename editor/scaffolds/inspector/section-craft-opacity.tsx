import React, { useCallback } from "react";
import {
  PropertyLine,
  PropertyLines,
  PropertyGroup,
  PropertyGroupHeader,
  PropertyInput,
  PropertySliderInput,
} from "@editor-ui/property";
import { useDispatch } from "core/dispatch";
import { useInspectorElement } from "hooks/use-inspector-element";

export function CraftOpacitySection() {
  const dispatch = useDispatch();
  const element = useInspectorElement();

  const onOpacityChange = useCallback(
    (value100: number) => {
      dispatch({
        type: "(craft)/node/opacity",
        opacity: value100 / 100,
      });
    },
    [dispatch]
  );

  if (!element) {
    return <></>;
  }

  const opacity100 = ((element?.style?.opacity as number) || 1) * 100;

  return (
    <PropertyGroup>
      <PropertyGroupHeader>
        <h6>Opacity</h6>
      </PropertyGroupHeader>
      <PropertyLines>
        <PropertyLine label="Opacity">
          {/* <PropertySliderInput
            value={[100]}
            min={0}
            max={100}
            step={1}
            onValueChange={(value) => {}}
          /> */}
          <PropertyInput
            min={0}
            max={100}
            stopPropagation
            type="number"
            suffix={"%"}
            onChange={(text) => {
              const val = Number(text);

              if (isNaN(val)) {
                return;
              }

              onOpacityChange(val);
            }}
            value={opacity100}
          />
        </PropertyLine>
      </PropertyLines>
    </PropertyGroup>
  );
}
