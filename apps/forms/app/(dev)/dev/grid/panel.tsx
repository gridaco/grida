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
    <div className="p-4 grid grid-cols-2 gap-2 w-full">
      {blockpresets.map((block) => (
        <Button
          variant="outline"
          className="flex flex-col justify-center h-20"
          key={block.preset}
          onClick={() => {
            onInsert(block.preset);
          }}
        >
          {React.createElement(block.icon, {
            className: "w-6 h-6 me-2",
          })}
          <span className="text-sm">{block.label}</span>
        </Button>
      ))}
    </div>
  );
}
