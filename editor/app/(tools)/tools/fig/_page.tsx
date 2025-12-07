"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  DragEvent,
  ClipboardEvent,
  useState,
  useEffect,
  useCallback,
} from "react";
import {
  readHTMLMessage,
  readFigFile,
  type ParsedFigmaHTML,
  type ParsedFigmaArchive,
} from "@grida/io-figma/fig-kiwi";
import { FigmaFile } from "./inspector";
import { toast } from "sonner";
import { UploadIcon, ClipboardIcon } from "lucide-react";
import { FigmaLogoIcon } from "@radix-ui/react-icons";
import Header from "@/www/header";
import { Kbd } from "@/components/ui/kbd";

type ParsedData = ParsedFigmaArchive | ParsedFigmaHTML | null;

export default function FigParserTool() {
  const [file, setFile] = useState<File | null>(null);
  const [pasteContent, setPasteContent] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedData>(null);
  const [progress, setProgress] = useState(0);
  const [canPaste, setCanPaste] = useState(false);

  useEffect(() => {
    const ok =
      typeof navigator !== "undefined" &&
      !!navigator.clipboard &&
      "read" in navigator.clipboard;
    setCanPaste(ok);
  }, []);

  const handleParseFile = useCallback(async () => {
    if (!file) return;

    setParsing(true);
    setProgress(0);

    try {
      // Read file with progress tracking
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();

        reader.onprogress = (e) => {
          if (e.lengthComputable) {
            const fileProgress = Math.round((e.loaded / e.total) * 100);
            setProgress(fileProgress);
          }
        };

        reader.onload = () => {
          setProgress(100);
          resolve(reader.result as ArrayBuffer);
        };

        reader.onerror = () => reject(reader.error);

        reader.readAsArrayBuffer(file);
      });

      const fileBytes = new Uint8Array(buffer);
      const result = readFigFile(fileBytes);
      setParsed(result);
    } catch (error) {
      toast.error("Failed to parse .fig file");
      console.error(error);
    } finally {
      setParsing(false);
      setProgress(0);
    }
  }, [file]);

  const handleParseClipboard = useCallback(async () => {
    if (!pasteContent) return;

    setParsing(true);
    setProgress(0);

    try {
      const result = readHTMLMessage(pasteContent);
      setParsed(result);
    } catch (error) {
      toast.error("Not a Figma clipboard data. Copy something from Figma");
      console.error(error);
      setPasteContent(null);
    } finally {
      setParsing(false);
      setProgress(0);
    }
  }, [pasteContent]);

  // Auto-parse when file is selected
  useEffect(() => {
    if (file && !parsed && !parsing) {
      handleParseFile();
    }
  }, [file, parsed, parsing, handleParseFile]);

  // Auto-parse when clipboard content is set
  useEffect(() => {
    if (pasteContent && !parsed && !parsing) {
      handleParseClipboard();
    }
  }, [pasteContent, parsed, parsing, handleParseClipboard]);

  function onDrop<E extends DragEvent>(e: E) {
    e.preventDefault();
    setFile(e.dataTransfer.files[0]);
    setPasteContent(null);
    setParsed(null);
  }

  function onPaste<E extends ClipboardEvent>(e: E) {
    e.preventDefault();

    // If there's a file being pasted
    if (e.clipboardData.files.length) {
      setFile(e.clipboardData.files[0]);
      setPasteContent(null);
      setParsed(null);
    } else if (e.clipboardData.getData("Text")) {
      // If there's text being pasted
      setPasteContent(e.clipboardData.getData("text/html"));
      setFile(null);
      setParsed(null);
    }
  }

  async function onPasteButton() {
    if (!navigator.clipboard || !("read" in navigator.clipboard)) {
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      const item = items.find((item) => item.types.includes("text/html"));
      if (!item) {
        toast.error("Not a Figma clipboard data. Copy something from Figma");
        return;
      }
      const blob = await item.getType("text/html");
      // Convert blob to string
      let html = await blob.text();
      // New chrome bug, we're seeing &lt; and &gt; instead of < and >
      html = html.replace("&lt;!--(figmeta)", "<!--(figmeta)");
      html = html.replace("(/figmeta)--&gt;", "(/figmeta)-->");
      html = html.replace("&lt;!--(figma)", "<!--(figma)");
      html = html.replace("(/figma)--&gt;", "(/figma)-->");

      setPasteContent(html);
      setFile(null);
      setParsed(null);
    } catch (error) {
      toast.error("Not a Figma clipboard data. Copy something from Figma");
      console.error(error);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length) {
      setFile(e.target.files[0]);
      setPasteContent(null);
      setParsed(null);
    }
  }

  if (parsing) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <p className="text-muted-foreground">Parsing...</p>
          {progress > 0 && <Progress value={progress} className="w-64" />}
        </div>
      </div>
    );
  }

  if (parsed) {
    return <FigmaFile data={parsed} />;
  }

  return (
    <div className="flex h-full w-full flex-col">
      <Header />
      <div
        onDrop={onDrop}
        onPaste={onPaste}
        onDragOver={(e) => e.preventDefault()} // Required to make droppable area
        className="flex flex-1 w-full overflow-y-auto"
      >
        <Empty className="w-full max-w-2xl mx-auto">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FigmaLogoIcon className="size-6" />
            </EmptyMedia>
            <EmptyTitle>Figma .fig File Parser and Viewer</EmptyTitle>
            <EmptyDescription>
              Parse and inspect Figma .fig files and clipboard data. Explore
              Kiwi format structure, node hierarchies, and binary data—all
              processed locally in your browser.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-center w-full">
              <Button
                disabled={!canPaste}
                onClick={onPasteButton}
                size="lg"
                variant="outline"
                className="w-full sm:w-auto"
              >
                <ClipboardIcon className="size-4 mr-2" />
                Paste from Figma <Kbd className="ml-2">⌘V</Kbd>
              </Button>
              <span className="text-sm text-muted-foreground">or</span>
              <div className="w-full sm:w-auto">
                <Input
                  id="file"
                  type="file"
                  accept=".fig"
                  onChange={onFileChange}
                  className="hidden"
                />
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => document.getElementById("file")?.click()}
                  className="w-full sm:w-auto"
                >
                  <UploadIcon className="size-4 mr-2" />
                  Select .fig File
                </Button>
              </div>
            </div>
            <p className="text-xs text-center text-muted-foreground mt-2">
              Your data is processed locally—nothing is uploaded to any server
            </p>
          </EmptyContent>
        </Empty>
      </div>
    </div>
  );
}
