"use client";

import React, { useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon } from "@radix-ui/react-icons";
import { pdfjs } from "react-pdf";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// pdfjs worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

export function PDFViewer({ file }: { file: string }) {
  const [numPages, setNumPages] = useState<number>();
  const [pageNumber, setPageNumber] = useState<number>(1);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
    setNumPages(numPages);
  }

  return (
    <div className="relative w-full h-full">
      <Document
        className="w-full h-full overflow-scroll"
        file={file ?? ""}
        onLoadSuccess={onDocumentLoadSuccess}
      >
        <Page pageNumber={pageNumber} />
      </Document>
      <footer
        className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-800 p-2.5 text-sm text-gray-700 dark:text-gray-300"
        style={{ zIndex: 999 }}
      >
        <div className="flex gap-2">
          <button
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((prev) => prev - 1)}
          >
            <ArrowLeftIcon />
          </button>
          <p>
            Page {pageNumber} of {numPages}
          </p>
          <button
            disabled={pageNumber >= (numPages ?? 1)}
            onClick={() => setPageNumber((prev) => prev + 1)}
          >
            <ArrowRightIcon />
          </button>
        </div>
      </footer>
    </div>
  );
}
