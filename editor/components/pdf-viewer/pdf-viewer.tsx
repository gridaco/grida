"use client";

import React, { useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon } from "@radix-ui/react-icons";
import { Document, Page } from "react-pdf";
import { pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/spinner";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// pdfjs.GlobalWorkerOptions.workerSrc = new URL(
//   "pdfjs-dist/build/pdf.worker.min.mjs",
//   import.meta.url
// ).toString();

// https://github.com/wojtekmaj/react-pdf/issues/1855
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export function PDFViewer({ file }: { file: string }) {
  return (
    <div className="relative w-full h-full">
      <PDFDocument file={file}>
        <PDFDocumentCurrentPage />
        <PDFPagination
          className="absolute bottom-0 left-0 right-0 bg-background p-2.5"
          style={{ zIndex: 999 }}
        />
      </PDFDocument>
    </div>
  );
}

const PDFDocumentContext = React.createContext<{
  file: string;
  pages: number;
  page: number;
  setPage: (page: number) => void;
} | null>(null);

function usePDFDocument() {
  const context = React.useContext(PDFDocumentContext);
  if (!context) {
    throw new Error("usePDFDocument must be used within a PDFDocumentProvider");
  }

  return context;
}

function PDFDocument({
  file,
  children,
}: React.PropsWithChildren<{ file: string }>) {
  const [pages, setPages] = useState<number>(0);
  const [page, setPage] = useState<number>(1);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setPages(numPages);
  };

  return (
    <PDFDocumentContext.Provider
      value={{ file, pages, page: page, setPage: setPage }}
    >
      <Document
        className="w-full h-full overflow-scroll"
        file={file ?? ""}
        onLoadSuccess={onDocumentLoadSuccess}
      >
        {children}
      </Document>
    </PDFDocumentContext.Provider>
  );
}

function PDFDocumentCurrentPage() {
  const { page } = usePDFDocument();
  return <Page pageNumber={page} loading={<Spinner />} />;
}

function PDFDocumentPage({ pageNumber }: { pageNumber: number }) {
  return <Page pageNumber={pageNumber} loading={<Spinner />} />;
}

function PDFPagination({ ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { pages, page, setPage } = usePDFDocument();
  return (
    <footer {...props}>
      <div className="flex items-center gap-2">
        <Button
          size="icon"
          variant="ghost"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          <ArrowLeftIcon />
        </Button>
        <span className="text-xs text-muted-foreground">
          Page {page} of {pages}
        </span>
        <Button
          size="icon"
          variant="ghost"
          disabled={page >= (pages ?? 1)}
          onClick={() => setPage(page + 1)}
        >
          <ArrowRightIcon />
        </Button>
      </div>
    </footer>
  );
}
