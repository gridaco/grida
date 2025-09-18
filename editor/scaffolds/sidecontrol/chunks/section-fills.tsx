"use client";

import React from "react";
import { FillControl } from "../controls/fill";
import { ChunkPaints } from "./chunk-paints";

export function SectionFills({ node_id }: { node_id: string }) {
  return (
    <ChunkPaints
      node_id={node_id}
      paintTarget="fill"
      title="Fills"
      ControlComponent={FillControl}
    />
  );
}
