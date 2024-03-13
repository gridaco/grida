import React from "react";
import { ReadonlyProperty } from "components/inspector";
import {
  PropertyLine,
  PropertyLines,
  PropertyGroup,
  PropertyGroupHeader,
} from "@editor-ui/property";
import { useTargetContainer } from "hooks/use-target-node";
import { IRadius } from "@reflect-ui/core";
import { InspectLayout } from "./inspect-layout";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@radix-ui/react-collapsible";

import { ChevronUpIcon, ChevronDownIcon } from "@radix-ui/react-icons";
import { useInspectorElement } from "hooks/use-inspector-element";

export function LayoutSection() {
  const { target, root } = useTargetContainer();
  const [inspectorOpen, setInspectorOpen] = React.useState(false);

  if (!target) {
    return <></>;
  }

  const { id, isRoot, x, y, width, height, type } = target;

  // round to 2 decimal places
  const dx = rd(x);
  const dy = rd(y);
  const dw = rd(width);
  const dh = rd(height);

  let tr, tl, br, bl;
  if ("cornerRadius" in target) {
    const { bl: _bl, br: _br, tl: _tl, tr: _tr } = target.cornerRadius;
    tr = numeric(_tr);
    tl = numeric(_tl);
    br = numeric(_br);
    bl = numeric(_bl);
  }

  const hasradius = tr || tl || br || bl;
  const radiusone = tr === tl && tl === br && br === bl;

  return (
    <PropertyGroup>
      <PropertyGroupHeader>
        <h6>Layout</h6>
      </PropertyGroupHeader>
      <PropertyLines key={id}>
        <PropertyLine label="Position">
          <ReadonlyProperty suffix={"X"} value={isRoot ? 0 : dx} />
          <ReadonlyProperty suffix={"Y"} value={isRoot ? 0 : dy} />
        </PropertyLine>
        <PropertyLine label="Size">
          <ReadonlyProperty suffix={"W"} value={dw} />
          <ReadonlyProperty suffix={"H"} value={dh} />
        </PropertyLine>
        {!!hasradius && (
          <PropertyLine label="Radius">
            {radiusone ? (
              <>
                <ReadonlyProperty value={tr} />
              </>
            ) : (
              <>
                <ReadonlyProperty suffix={"tr"} value={tr} />
                <ReadonlyProperty suffix={"tl"} value={tl} />
                <ReadonlyProperty suffix={"br"} value={br} />
                <ReadonlyProperty suffix={"bl"} value={bl} />
              </>
            )}
          </PropertyLine>
        )}
      </PropertyLines>
      <PropertyLines padding={0}>
        <Collapsible open={inspectorOpen} onOpenChange={setInspectorOpen}>
          <CollapsibleTrigger asChild>
            <PropertyGroupHeader>
              <h6>Inspect Layout</h6>
              {inspectorOpen ? (
                <ChevronUpIcon color="white" />
              ) : (
                <ChevronDownIcon color="white" />
              )}
            </PropertyGroupHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <InspectLayout />
          </CollapsibleContent>
        </Collapsible>
      </PropertyLines>
    </PropertyGroup>
  );
}

const numeric = (v: IRadius) => (typeof v === "number" ? rd(v) : null);
const rd = (v: number) => Math.round(v * 100) / 100;
