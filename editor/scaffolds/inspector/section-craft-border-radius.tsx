import React, { useCallback } from "react";
import {
  PropertyLine,
  PropertyGroup,
  PropertyGroupHeader,
  PropertyInput,
  PropertyLines,
} from "@editor-ui/property";
import { CornersIcon } from "@radix-ui/react-icons";
import { useInspectorElement } from "hooks/use-inspector-element";
import { useDispatch } from "core/dispatch";

export function CraftBorderRadiusSection() {
  const dispatch = useDispatch();
  const element = useInspectorElement();

  const onBorderRadiusChange = useCallback(
    (value: number) => {
      dispatch({
        type: "(craft)/node/corners",
        radius: value,
      });
    },
    [dispatch]
  );

  if (!element) {
    return <></>;
  }

  return (
    <PropertyGroup>
      <PropertyGroupHeader>
        <h6>Corner Radius</h6>
      </PropertyGroupHeader>
      <PropertyLines>
        <PropertyLine>
          <PropertyInput
            value={element.style.borderRadius || 0}
            stopPropagation
            min={0}
            type="number"
            suffix={<CornersIcon />}
            onChange={(txt) => {
              const val = Number(txt);
              if (isNaN(val)) {
                return;
              }
              onBorderRadiusChange(val);
            }}
          />
        </PropertyLine>
      </PropertyLines>
    </PropertyGroup>
  );
}
