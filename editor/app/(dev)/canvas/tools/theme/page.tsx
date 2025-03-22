"use client";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ThemeEditor } from "@/grida-react-canvas-starter-kit/starterkit-theme-editor";

export default function ThemeToolPage() {
  const [open, setOpen] = useState(true);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Open Dialog</Button>
      </DialogTrigger>
      <DialogContent className="overflow-hidden p-0 min-h-[700px] md:max-h-[500px] md:max-w-[700px] lg:max-w-[800px] !max-w-screen-xl aspect-video">
        <DialogTitle className="sr-only">Theme</DialogTitle>
        <DialogDescription className="sr-only">
          Customize your theme here.
        </DialogDescription>
        <ThemeEditor />
      </DialogContent>
    </Dialog>
  );
}
