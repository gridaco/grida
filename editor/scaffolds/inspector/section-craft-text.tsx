import React from "react";
import {
  PropertyLine,
  PropertyGroup,
  PropertyGroupHeader,
  PropertyInput,
} from "@editor-ui/property";
import { useInspectorElement } from "hooks/use-inspector-element";
import { useDispatch } from "core/dispatch";

export function CrafContentSection() {
  const dispatch = useDispatch();
  const target = useInspectorElement();

  const onChange = (txt: string) => {
    dispatch({
      type: "(craft)/node/text/data",
      data: txt,
    });
  };

  if (target && "text" in target) {
    const txt = target.text;

    return (
      <PropertyGroup>
        <PropertyGroupHeader>
          <h6>Content</h6>
        </PropertyGroupHeader>
        <PropertyLine>
          <PropertyInput
            value={txt}
            stopPropagation
            onChange={(txt) => {
              onChange(txt);
            }}
          />
        </PropertyLine>
      </PropertyGroup>
    );
  }

  return <></>;
}
