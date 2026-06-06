"use client";

import React from "react";
import { SidebarProvider } from "@app/ui/components/sidebar";
import { TooltipProvider } from "@app/ui/components/tooltip";
import dynamic from "next/dynamic";

const ImagePlayground = dynamic(() => import("./_page"), {
  ssr: false,
});

export default function ImagePlaygroundPage() {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <ImagePlayground />
      </SidebarProvider>
    </TooltipProvider>
  );
}
