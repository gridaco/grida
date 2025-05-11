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
import { CardsDemo } from "@/grida-theme-shadcn/example/cards";

export default function ThemeToolPage() {
  const [open, setOpen] = useState(false);

  return (
    <main className="container mx-auto my-40 space-y-10">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm">Open Theme Editor</Button>
        </DialogTrigger>
        <DialogContent className="overflow-hidden p-0 min-h-[700px] md:max-h-[500px] md:max-w-[700px] lg:max-w-[800px] !max-w-screen-xl aspect-video">
          <DialogTitle className="sr-only">Theme</DialogTitle>
          <DialogDescription className="sr-only">
            Customize your theme here.
          </DialogDescription>
          <ThemeEditor />
        </DialogContent>
      </Dialog>
      <hr />
      <CardsDemo />
    </main>
  );
}
