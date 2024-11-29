"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GridaLogo } from "@/components/grida-logo";
import Link from "next/link";
import { ThemedMonacoEditor } from "@/components/monaco";
import { QuestionMarkCircledIcon } from "@radix-ui/react-icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
export default function IOPdfPage() {
  const [src, setSrc] = useState<string>();

  return (
    <main className="w-screen h-screen flex flex-col">
      <header className="flex items-center justify-between p-4 border-b">
        <div className="flex gap-4 items-center">
          <Link href="/canvas">
            <GridaLogo className="w-4 h-4" />
          </Link>
          <div className="flex flex-col">
            <span className="text-sm font-bold font-mono">tools/io-pdf</span>
            <span className="text-xs">
              Partial PDF Portable data format viewer
            </span>
          </div>
        </div>
        <div>
          <AboutDialog />
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 h-full">
          <div className="h-full w-full">
            <div className="w-full h-full overflow-auto">
              <ThemedMonacoEditor
                width="100%"
                height="100%"
                language="json"
                value={src}
                onChange={(value) => setSrc(value)}
                options={{ readOnly: false }}
              />
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="shadow rounded border flex items-center justify-center min-w-40 min-h-40">
            Content
          </div>
        </div>
      </div>
    </main>
  );
}

function AboutDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost">
          <QuestionMarkCircledIcon className="me-2" />
          What is this?
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            What is <code>iopdf</code>?
          </DialogTitle>
          <DialogDescription>
            Grida does not support PDF format.
          </DialogDescription>
        </DialogHeader>
        <article className="prose prose-sm dark:prose-invert">
          But it does not mean you cannot build your own pdf file out of Grida
          designs.
          <code>iopdf</code> provides you a starting point for you to build your
          own PDF maker out of Grida Documents.
          <hr />
          <b>To export a PDF file, you can use following techniques:</b>
          <ul>
            <li>
              Render text with pdf libraries like <code>jsPDF</code>
            </li>
            <li>
              Render complex nodes and incompatable nodes with rasterization
            </li>
            <li>
              Render simple shapes without effects or complex painting with
              Paths
            </li>
          </ul>
        </article>
      </DialogContent>
    </Dialog>
  );
}
