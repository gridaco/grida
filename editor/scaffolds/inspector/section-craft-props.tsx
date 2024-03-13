import React, { useCallback } from "react";
import {
  PropertyCheckboxInput,
  PropertyGroup,
  PropertyGroupHeader,
  PropertyInput,
  PropertyLine,
  PropertyLines,
  PropertyNumericInput,
} from "@editor-ui/property";
import { useDispatch } from "core/dispatch";
import { useInspectorElement } from "hooks/use-inspector-element";

export function CraftPropsSection() {
  return (
    <PropertyGroup>
      <PropertyGroupHeader>
        <h6>Properties</h6>
      </PropertyGroupHeader>
      <PropertyLines>
        <PropertyLine>
          <FiledLine />
        </PropertyLine>
      </PropertyLines>
    </PropertyGroup>
  );
}

function FiledLine() {
  // types
  // - text
  // - number
  // - boolean
  // - color
  // - select (enum, literal type alias)
  // - src (image, video, audio)
  // - date / time
  // - T struct
  // - json
  // - children
  // - array<T>
  // - latlng
  // - ref

  return <div>{/*  */}</div>;
}
