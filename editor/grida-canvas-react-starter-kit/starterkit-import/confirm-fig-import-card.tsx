import React from "react";
import { Card } from "@/components/ui/card";
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
  return (
    <Card className="p-4 space-y-4">
      {parsed.thumbnailUrl && (
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- Intentional: thumbnail from parsed Figma file. */}
          <img
            src={parsed.thumbnailUrl}
            alt="File thumbnail"
            className="max-w-full max-h-48 rounded-md border border-border object-contain"
          />
        </div>
      )}
      <div className="space-y-2">
        <p className="text-sm font-medium">
          This will add {parsed.sceneCount} new scene(s) to your document:
        </p>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside max-h-40 overflow-y-auto">
          {parsed.scenes.map((scene, i) => (
            <li key={i}>
              {scene.name} ({scene.nodeCount} node(s))
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
