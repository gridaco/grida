"use client";

import { PreviewButton } from "@/components/preview-button";
import { Button } from "@app/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@app/ui/components/tooltip";
import { useEditorState } from "@/scaffolds/editor";
import { SitePlayAction } from "./play-actions-site";

export function PlayActions() {
  const [state] = useEditorState();
  const { doctype } = state;
  return (
    <div className="flex gap-2 items-center justify-end">
      {doctype === "v0_form" && <PreviewButton />}
      {doctype === "v0_site" && <SitePlayAction />}
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
