"use client";
import dynamic from "next/dynamic";

const Viewer = dynamic(() => import("@/scaffolds/pdf-page-flip"), {
  ssr: false,
});

export default function PDFViewerTestPage() {
  return (
    <main className="w-dvw h-dvh">
      <Viewer file={"/testfiles/file-example_PDF_1MB.pdf"} />
    </main>
  );
}
