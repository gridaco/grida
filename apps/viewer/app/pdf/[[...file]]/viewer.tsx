"use client";
import dynamic from "next/dynamic";

type PdfViewerApp = "" | "page-flip";

const Viewer = dynamic(() => import("@/scaffolds/pdf-page-flip"), {
  ssr: false,
});

export default function PDFViewer({
  app,
  file,
}: {
  app: PdfViewerApp;
  file: string;
}) {
  switch (app) {
    case "page-flip":
      return (
        <main className="w-dvw h-dvh">
          <Viewer file={file} />
        </main>
      );
    default:
      return (
        <main className="w-dvw h-dvh">
          <object
            data={file}
            type="application/pdf"
            className="w-full h-full"
          />
        </main>
      );
  }
}
