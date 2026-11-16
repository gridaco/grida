"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@app/ui/components/tabs";
import { ComposerKitDemo } from "./kit-demo";
import { DesktopComposerDemo } from "./desktop-demo";

export default function ComposerPage() {
  return (
    <Tabs defaultValue="desktop" className="flex min-h-screen flex-col gap-0">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">Composer playground</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Refine the chat composer with local fixtures and shared Desktop
            components.
          </p>
        </div>
        <TabsList aria-label="Composer playground">
          <TabsTrigger value="desktop">Desktop chat</TabsTrigger>
          <TabsTrigger value="kit">Kit and files</TabsTrigger>
        </TabsList>
      </header>
      <TabsContent value="desktop" className="m-0 flex-1">
        <DesktopComposerDemo />
      </TabsContent>
      <TabsContent value="kit" className="m-0 flex-1">
        <ComposerKitDemo />
      </TabsContent>
    </Tabs>
  );
}
