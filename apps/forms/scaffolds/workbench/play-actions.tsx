"use client";

import { PreviewButton } from "@/components/preview-button";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditorState } from "@/scaffolds/editor";

export function PlayActions() {
  const [state] = useEditorState();
  const { doctype } = state;
  return (
    <div className="px-4 flex gap-4 items-center justify-end">
      {doctype === "v0_form" && <PreviewButton />}
      {doctype === "v0_site" && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Button variant="outline" disabled>
                  Preview
                </Button>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              Preview is not available for database documents
            </TooltipContent>
          </Tooltip>
        </>
      )}
      {doctype === "v0_schema" && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Button variant="outline" disabled>
                  Preview
                </Button>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              Preview is not available for database documents
            </TooltipContent>
          </Tooltip>
        </>
      )}
    </div>
  );
}
