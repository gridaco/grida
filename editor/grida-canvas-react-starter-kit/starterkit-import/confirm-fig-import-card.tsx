import React from "react";
import { Badge } from "@/components/ui/badge";
import { LayersIcon, BoxIcon } from "lucide-react";
import type { FigFileImportResult } from "./use-fig-file-import";

/**
 * Displays the parsed file's thumbnail (if any) and a list of scenes that
 * will be created, shown during the "confirm" step of a Figma binary file
 * import flow (.fig or .deck).
 */
export function ConfirmFigImportCard({
  parsed,
}: {
  parsed: FigFileImportResult;
}) {
  const totalNodes = parsed.scenes.reduce((s, sc) => s + sc.nodeCount, 0);

  return (
    <div className="space-y-4">
      {parsed.thumbnailUrl && (
        <div className="flex justify-center rounded-lg border border-border bg-muted/30 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- Intentional: thumbnail from parsed Figma file. */}
          <img
            src={parsed.thumbnailUrl}
            alt="File thumbnail"
            className="max-w-full max-h-48 rounded-md object-contain"
          />
        </div>
      )}

      {/* Summary badges */}
      <div className="flex items-center gap-2">
        <Badge variant="secondary">
          <LayersIcon className="size-3" />
          {parsed.sceneCount} scene{parsed.sceneCount !== 1 ? "s" : ""}
        </Badge>
        <Badge variant="secondary">
          <BoxIcon className="size-3" />
          {totalNodes} node{totalNodes !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Scene list */}
      <div className="rounded-lg border border-border divide-y divide-border max-h-48 overflow-y-auto">
        {parsed.scenes.map((scene, i) => (
          <div
            key={i}
            className="flex items-center justify-between px-3 py-2 text-sm"
          >
            <span className="font-medium truncate">{scene.name}</span>
            <span className="text-xs text-muted-foreground shrink-0 ml-3">
              {scene.nodeCount} node{scene.nodeCount !== 1 ? "s" : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
