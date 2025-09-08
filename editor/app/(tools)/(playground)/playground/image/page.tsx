"use client";

import React from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
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
