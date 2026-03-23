"use client";

import React from "react";
import {
  useCurrentEditor,
  useEditorState,
} from "@/grida-canvas-react";
import { WithSize } from "@/grida-canvas-react/viewport/size";
import { useDPR } from "@/grida-canvas-react/viewport/hooks/use-dpr";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function RefigCanvas({
  canvasRef,
}: {
  canvasRef: (n: HTMLCanvasElement | null) => void;
}) {
  const dpr = useDPR();
  return (
    <WithSize
      className="w-full h-full max-w-full max-h-full min-h-px min-w-px"
      style={{ contain: "strict" }}
    >
      {({ width, height }) =>
        width > 0 && height > 0 ? (
          <canvas
            id="canvas"
            ref={canvasRef}
            width={width * dpr}
            height={height * dpr}
            style={{
              width,
              height,
            }}
          />
        ) : null
      }
    </WithSize>
  );
}

export function SceneSelector() {
  const ed = useCurrentEditor();
  const scenesRef = useEditorState(ed, (s) => s.document.scenes_ref);
  const sceneId = useEditorState(ed, (s) => s.scene_id);
  const nodes = useEditorState(ed, (s) => s.document.nodes);

  if (scenesRef.length <= 1) {
    return null;
  }

  return (
    <Select
      value={sceneId ?? ""}
      onValueChange={(v) => {
        ed.commands.loadScene(v);
      }}
    >
      <SelectTrigger className="w-[min(100%,280px)] h-8 text-xs">
        <SelectValue placeholder="Scene" />
      </SelectTrigger>
      <SelectContent>
        {scenesRef.map((id) => {
          const n = nodes[id];
          const label =
            n && "name" in n && typeof n.name === "string" ? n.name : id;
          return (
            <SelectItem key={id} value={id}>
              {label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
