"use client";
import React, { useState, useRef, useEffect } from "react";
import HTMLFlipBook from "react-pageflip";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { pdfjs } from "react-pdf";
import { useMeasure, useMediaQuery } from "@uidotdev/usehooks";
import { PDFDocumentProxy } from "pdfjs-dist";

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
}

const FlipPage: React.FC<FlipPageProps> = React.forwardRef((props, ref) => {
  return (
    <div
      className="shadow-lg rounded overflow-hidden"
      ref={ref as React.RefObject<HTMLDivElement>}
    >
      <Page
        pageNumber={props.pageNumber}
        width={props.width}
        height={props.height}
        renderAnnotationLayer={false}
        renderTextLayer={false}
      />
    </div>
  );
});

FlipPage.displayName = "FlipPage";

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

  const isPortrait = useMediaQuery("only screen and (max-width : 768px)");
  const [ref, { width: _width, height: _height }] = useMeasure();

  const onDocumentLoadSuccess: OnDocumentLoadSuccess = (
    document: PDFDocumentProxy
  ) => {
    if (!title) {
      document.getMetadata().then(({ info }) => {
        try {
          const pdfTitle = (info as any)["Title"];
          if (pdfTitle) setTitle(pdfTitle);
        } catch (e) {}
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
                showPageCorners={true}
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
                  />
                ))}
              </HTMLFlipBook>
            )}
          </Document>
        </div>
        <NavigationControlOverlay
          hasNext={currentPage + 2 < numPages}
          hasPrev={currentPage > 0}
          onNext={nextPage}
          onPrev={prevPage}
        />
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
    <div className="absolute inset-0 z-10 pointer-events-none">
      <button
        disabled={!hasPrev}
        onClick={onPrev}
        className="px-4 absolute top-0 left-0 bottom-0 pointer-events-auto cursor-pointer disabled:opacity-50"
      >
        <ChevronLeft size={20} />
      </button>
      <button
        disabled={!hasNext}
        onClick={onNext}
        className="px-4 absolute top-0 right-0 bottom-0 pointer-events-auto cursor-pointer disabled:opacity-50"
      >
        <ChevronRight size={20} />
      </button>
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
          className="w-7 rounded border text-center"
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
