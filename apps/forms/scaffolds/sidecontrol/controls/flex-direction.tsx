"use client";

import { useEffect, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "./utils/toggle-group";
import { ViewHorizontalIcon, ViewVerticalIcon } from "@radix-ui/react-icons";

type FlexDirection = "row" | "column" | "row-reverse" | "column-reverse";
type Direction = "row" | "column";

export function FlexDirectionControl({
  value,
  onValueChange,
}: {
  value?: FlexDirection;
  onValueChange?: (value?: FlexDirection) => void;
}) {
  const [direction, setDirection] = useState<Direction>();
  const [reverse, setReverse] = useState<"reverse">();

  useEffect(() => {
    if (value === "row" || value === "row-reverse") {
      setDirection("row");
    } else {
      setDirection("column");
    }
    setReverse(
      value === "row-reverse" || value === "column-reverse"
        ? "reverse"
        : undefined
    );
  }, [value]);

  const onDirectionChange = (value: Direction) => {
    setDirection(value);
    onValueChange?.((value + (reverse ? "-reverse" : "")) as FlexDirection);
  };

  const onReverseChange = (value: "reverse") => {
    setReverse(value);
    onValueChange?.((direction + (value ? "-reverse" : "")) as FlexDirection);
  };

  return (
    <div className="w-full space-y-2">
      <ToggleGroup
        type="single"
        id="flex-direction"
        value={direction}
        onValueChange={onDirectionChange}
      >
        <ToggleGroupItem value="row">
          <ViewVerticalIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value="column">
          <ViewHorizontalIcon />
        </ToggleGroupItem>
      </ToggleGroup>
      <ToggleGroup
        type="single"
        id="reverse"
        value={reverse}
        onValueChange={onReverseChange}
      >
        <ToggleGroupItem value="reverse">Reverse</ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
