"use client";
import dynamic from "next/dynamic";
import { redirect, useSearchParams } from "next/navigation";

const Viewer = dynamic(() => import("@/scaffolds/pdf-page-flip"), {
  ssr: false,
});

type PdfViewerApp = "" | "page-flip";

type Params = Promise<{ file: string[] }>;

export default async function PDFViewerPage({ params }: { params: Params }) {
  const searchparams = useSearchParams();
  const qapp: PdfViewerApp = (searchparams.get("app") as PdfViewerApp) ?? "";
  const qfile = searchparams.get("file");
  const pfile = (await params).file?.[0];

  const file = (pfile || qfile)!;

  switch (qapp) {
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
