import React from "react";
import { type Metadata } from "next";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import ImagePlayground from "./_page";

export const metadata: Metadata = {
  title: "Image Playground",
  description: "Playground for generating images",
};

export default function ImagePlaygroundPage() {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <ImagePlayground />
      </SidebarProvider>
    </TooltipProvider>
  );
}
