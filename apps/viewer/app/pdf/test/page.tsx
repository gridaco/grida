import PDFViewer from "@/scaffolds/pdf-page-flip";

export default function PDFViewerTestPage() {
  return (
    <main className="w-dvw h-dvh">
      <PDFViewer file={"/testfiles/file-example_PDF_1MB.pdf"} />
    </main>
  );
}
