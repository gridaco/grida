"use client";

import { useState } from "react";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import {
  FetchNodeResult,
  ImportFromFigmaDialog,
} from "@/grida-canvas-react-starter-kit/starterkit-import";
import { Button } from "@/components/ui/button";
import { FigmaLogoIcon } from "@radix-ui/react-icons";
import { GridaLogo } from "@/components/grida-logo";
import { ThemedMonacoEditor } from "@/components/monaco";
import Link from "next/link";

export default function IOFigmaPage() {
  const dialog = useDialogState("io-figma-import", { defaultOpen: true });
  const [fig, setFig] = useState<FetchNodeResult | null>(null);

  return (
    <main className="w-dvw h-dvh">
      <ImportFromFigmaDialog {...dialog.props} onImport={setFig} />
      <div className="flex flex-col w-full h-full">
        <header className="flex items-center justify-between p-4 border-b">
          <div className="flex gap-4 items-center">
            <Link href="/canvas">
              <GridaLogo className="size-4" />
            </Link>
            <div className="flex flex-col">
              <span className="text-sm font-bold font-mono">
                tools/io-figma
              </span>
              <span className="text-xs">Figma Restful API Json Viewer</span>
            </div>
          </div>
          <Button onClick={dialog.openDialog}>
            <FigmaLogoIcon />
            Import Figma
          </Button>
        </header>
        <ThemedMonacoEditor
          width="100%"
          height="100%"
          language="json"
          value={fig ? JSON.stringify(fig, null, 2) : ""}
          options={{ readOnly: true }}
        />
      </div>
    </main>
  );
}
