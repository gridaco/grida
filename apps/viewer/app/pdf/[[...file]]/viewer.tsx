"use client";
import dynamic from "next/dynamic";

type PdfViewerApp = "" | "page-flip";

const Viewer = dynamic(() => import("@/scaffolds/pdf-page-flip"), {
  ssr: false,
});

export default function PDFViewer({
  title,
  app,
  file,
}: {
  app: PdfViewerApp;
  file: string;
  title?: string;
}) {
  switch (app) {
    case "page-flip":
      return (
        <main className="w-dvw h-dvh">
          <Viewer file={file} title={title} />
        </main>
      );
    default:
      return (
        <main className="w-dvw h-dvh">
          <object
            title={title}
            data={file}
            type="application/pdf"
            className="w-full h-full"
          />
        </main>
      );
  }
}
