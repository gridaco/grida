"use client";

import React from "react";

import { Button } from "@/components/ui/button";
import { PresetID, blockpresets } from "./blocks/data";

export function InsertPanel({
  onInsert,
}: {
  onInsert: (preset: PresetID) => void;
}) {
  return (
    <div className="p-4 flex flex-col gap-2 w-full">
      {blockpresets.map((block) => (
        <Button
          variant="outline"
          className="h-20"
          key={block.preset}
          onClick={() => {
            onInsert(block.preset);
          }}
        >
          {React.createElement(block.icon, {
            className: "w-6 h-6 me-2",
          })}
          {block.label}
        </Button>
      ))}
    </div>
  );
}
