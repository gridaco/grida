"use client";

import type { models } from "@grida/ai-models";
import { SidebarProvider } from "@app/ui/components/sidebar";
import { TooltipProvider } from "@app/ui/components/tooltip";
import dynamic from "next/dynamic";

const ImagePlayground = dynamic(() => import("./_page"), {
  ssr: false,
});

export default function ImagePlaygroundClient({
  initialModelId,
}: {
  initialModelId?: models.image.ImageModelId;
}) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <ImagePlayground initialModelId={initialModelId} />
      </SidebarProvider>
    </TooltipProvider>
  );
}
