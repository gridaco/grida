"use client";
import React, { useState, useRef, useEffect } from "react";
import HTMLFlipBook from "react-pageflip";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Document, Page } from "react-pdf";
import { pdfjs } from "react-pdf";
import { useMeasure, useMediaQuery } from "@uidotdev/usehooks";
import { PDFDocumentProxy } from "pdfjs-dist";
// import { PDFLinkService } from "pdfjs-dist/web/pdf_viewer";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

type OnDocumentLoadSuccess = (document: PDFDocumentProxy) => void;

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

function scaltToFit(
  maxWidth: number,
  maxHeight: number,
  pageWidth: number,
  pageHeight: number
) {
  const factor = Math.min(maxWidth / pageWidth, maxHeight / pageHeight);
  return {
    factor,
    width: pageWidth * factor,
    height: pageHeight * factor,
  };
}

interface FlipPageProps {
  number: number;
  width: number;
  height: number;
  pageNumber: number;
  onLinkClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}

const FlipPage: React.FC<FlipPageProps> = React.forwardRef<HTMLDivElement, FlipPageProps>(
  ({ onLinkClick, pageNumber, width, height }, ref) => {
    return (
      <div
        className="shadow-lg rounded-sm overflow-hidden"
        ref={ref as React.RefObject<HTMLDivElement>}
      >
        <Page
          pageNumber={pageNumber}
          width={width}
          height={height}
          renderAnnotationLayer={true}
          renderTextLayer={true}
          onClick={(e) => {
            const anchor = (e.target as HTMLElement).closest("a");
            if (anchor) {
              onLinkClick?.(e);
            }
            //
          }}
        />
      </div>
    );
  }
);

FlipPage.displayName = "FlipPage";

/**
 * Finds the page number targeted by a link annotation based on its annotation ID.
 *
 * @param pdfDoc - The PDF document proxy object from PDF.js.
 * @param annotationId - The unique identifier of the annotation to locate.
 * @returns The 1-based page number the annotation links to, or `null` if not found.
 */
async function findPageNumberByAnnotationId(
  pdfDoc: PDFDocumentProxy,
  annotationId: string
): Promise<number | null> {
  const numPages = pdfDoc.numPages;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const annotations = await page.getAnnotations();

    for (const annotation of annotations) {
      // Match the annotation ID (usually stored in annotation.id or annotation.ref)
      if (
        annotation.id === annotationId ||
        (annotation.ref && annotation.ref.toString() === annotationId)
      ) {
        // For link annotations, destination contains the target page information
        if (annotation.dest) {
          const dest = annotation.dest;
          const targetPageIndex = await pdfDoc.getPageIndex(dest[0]);
          return targetPageIndex + 1; // pageIndex is 0-based, add 1 for the correct page number
        } else if (
          annotation.action === "GoTo" &&
          annotation.unsafeUrl === undefined
        ) {
          const dest = annotation.dest || annotation.newWindow;
          if (dest) {
            const targetPageIndex = await pdfDoc.getPageIndex(dest[0]);
            return targetPageIndex + 1;
          }
        }
      }
    }
  }

  return null; // Annotation not found
}

const PDFViewer = ({
  file,
  title: _title,
  logo,
}: {
  file: string;
  title?: string;
  logo?: string;
}) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [title, setTitle] = useState<string | undefined>(_title);
  const [currentPage, setCurrentPage] = useState(0);
  const [rawSize, setRawSize] = useState<
    { width: number; height: number } | undefined
  >(undefined);
  const [cachedDimensions, setCachedDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const book = useRef(null);
  const doc = useRef<PDFDocumentProxy | null>(null);
  const isPortrait = useMediaQuery("only screen and (max-width : 768px)");
  const [ref, { width: _width, height: _height }] = useMeasure();

  const onDocumentLoadSuccess: OnDocumentLoadSuccess = async (
    document: PDFDocumentProxy
  ) => {
    doc.current = document;

    if (!title) {
      document.getMetadata().then(({ info }) => {
        const infoRecord = info as Record<string, unknown> | null | undefined;
        const pdfTitle =
          typeof infoRecord?.Title === "string" ? infoRecord.Title : undefined;
        if (pdfTitle) setTitle(pdfTitle);
      });
    }
    setNumPages(document.numPages);
    document.getPage(1).then((page) => {
      const [, , width, height] = page.view;
      setRawSize({ width, height });
    });
  };

  // Cache dimensions once resolved; ignore subsequent resizes.
  useEffect(() => {
    if (_width && _height && rawSize && !cachedDimensions) {
      const computed = scaltToFit(
        _width / (isPortrait ? 1 : 2),
        _height,
        rawSize.width,
        rawSize.height
      );
      setCachedDimensions({ width: computed.width, height: computed.height });
    }
  }, [_width, _height, rawSize, isPortrait, cachedDimensions]);

  const nextPage = () => {
    if (book.current) {
      // @ts-expect-error legacy
      book.current.pageFlip().flipNext();
    }
  };

  const prevPage = () => {
    if (book.current) {
      // @ts-expect-error legacy
      book.current.pageFlip().flipPrev();
    }
  };

  const setPage = (page: number) => {
    if (page < 0 || page >= numPages) return;
    if (book.current) {
      // @ts-expect-error legacy
      book.current.pageFlip().flip(page);
    }
  };

  const onFlip = (e: { data: number }) => {
    setCurrentPage(e.data);
  };

  return (
    <main className="w-full h-full flex flex-col overflow-hidden bg-neutral-100 dark:bg-neutral-800">
      {title && (
        <header className="border-b py-2 px-5 z-50">
          <h1 className="text-sm font-semibold">{title}</h1>
        </header>
      )}
      <div className="relative w-full h-full p-8 md:p-20 z-10">
        <NavigationControlOverlay
          hasNext={currentPage + 2 < numPages}
          hasPrev={currentPage > 0}
          onNext={nextPage}
          onPrev={prevPage}
        />
        <div
          ref={ref}
          className="w-full h-full flex flex-col justify-center items-center"
        >
          <Document
            file={file}
            onLoadSuccess={onDocumentLoadSuccess}
            loading=""
          >
            {!cachedDimensions ? null : (
              // @ts-expect-error legacy
              <HTMLFlipBook
                width={cachedDimensions.width}
                height={cachedDimensions.height}
                maxShadowOpacity={0.5}
                showCover={true}
                mobileScrollSupport={true}
                onFlip={onFlip}
                ref={book}
                startPage={0}
                showPageCorners={false}
                flippingTime={600}
                usePortrait={isPortrait}
                startZIndex={0}
                drawShadow={true}
                autoSize={false}
              >
                {Array.from(new Array(numPages), (_, index) => (
                  <FlipPage
                    key={index}
                    width={cachedDimensions.width}
                    height={cachedDimensions.height}
                    number={index + 1}
                    pageNumber={index + 1}
                    onLinkClick={(e) => {
                      const anchor = (e.target as HTMLElement).closest("a");
                      if (!anchor) return;
                      const href = anchor.getAttribute("href");
                      if (!href || href === "#") {
                        const id = anchor.dataset.elementId;
                        if (id) {
                          e.preventDefault();
                          const currentDoc = doc.current;
                          if (!currentDoc) return;
                          findPageNumberByAnnotationId(currentDoc, id).then(
                            (pagenum) => {
                              if (pagenum) {
                                setPage(pagenum);
                              }
                            }
                          );
                        }
                      }
                    }}
                  />
                ))}
              </HTMLFlipBook>
            )}
          </Document>
        </div>
        <div className="absolute bottom-4 left-0 right-0 w-full flex justify-center z-20 pointer-events-none">
          <NavigationPageNumberControl
            page={currentPage}
            numPages={numPages}
            onPageChange={setPage}
            isPortrait={isPortrait}
          />
        </div>
      </div>
      {logo && (
        <div className="fixed bottom-4 right-4 z-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logo}
            alt="logo"
            className="w-full h-full max-w-32 max-h-24"
          />
        </div>
      )}
    </main>
  );
};

function NavigationControlOverlay({
  hasNext,
  hasPrev,
  onPrev,
  onNext,
}: {
  hasNext: boolean;
  hasPrev: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="w-full h-full flex justify-between pointer-events-none">
        <aside
          className="flex-1 pointer-events-auto cursor-w-resize"
          onClick={onPrev}
        >
          <button
            disabled={!hasPrev}
            className="px-4 absolute top-0 left-0 bottom-0 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            <ChevronLeft size={20} />
          </button>
        </aside>
        <div className="w-10" />
        <aside
          className="flex-1 pointer-events-auto cursor-e-resize"
          onClick={onNext}
        >
          <button
            disabled={!hasNext}
            className="px-4 absolute top-0 right-0 bottom-0 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            <ChevronRight size={20} />
          </button>
        </aside>
      </div>
    </div>
  );
}

function NavigationPageNumberControl({
  page,
  numPages,
  isPortrait,
  onPageChange,
}: {
  page: number;
  numPages: number;
  isPortrait: boolean;
  onPageChange?: (page: number) => void;
}) {
  const start = page + 1;
  const end = Math.min(page + 2, numPages);
  const isStart = start === 1;
  const isEnd = end === numPages;
  const [txt, setTxt] = useState<string>(
    isPortrait || isStart || isEnd ? start.toString() : `${start}-${end}`
  );

  useEffect(() => {
    if (isPortrait || isStart || isEnd) {
      setTxt(start.toString());
    } else {
      setTxt(`${start}-${end}`);
    }
  }, [start, end, isPortrait, isStart, isEnd]);

  return (
    <div className="mt-4 flex items-center gap-4 pointer-events-auto">
      <span className="text-sm">
        <input
          type="text"
          autoComplete="off"
          className="w-7 rounded-sm border text-center"
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          onBlur={() => {
            const page = parseInt(txt);
            if (page > 0 && page <= numPages) {
              onPageChange && onPageChange(page - 1);
            }
          }}
        />
        <span> / </span>
        <span>{numPages}</span>
      </span>
    </div>
  );
}

export default PDFViewer;
