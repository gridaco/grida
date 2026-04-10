import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import iofigma from "@grida/io-figma";
import { readFigFile, getThumbnail } from "@grida/io-figma/fig-kiwi";

const FigImporter = iofigma.kiwi.FigImporter;

/**
 * Parsed summary of a Figma binary file (.fig or .deck), surfaced to the
 * import dialog for the user to confirm before running the import pipeline.
 */
export interface FigFileImportResult {
  file: File;
  sceneCount: number;
  scenes: Array<{
    name: string;
    nodeCount: number;
  }>;
  thumbnailUrl?: string;
}

export type FigFileImportStep = "select" | "confirm";

/**
 * State machine for the Figma binary file import flow.
 *
 * Owns file selection, parsing progress, thumbnail extraction, and the
 * confirm → import hand-off. Dialog components layer their own markup on
 * top (labels, dropzone, header) and call {@link runImport} when the user
 * commits.
 */
export function useFigFileImport(
  onImportFig: ((result: FigFileImportResult) => Promise<void>) | undefined
) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [step, setStep] = useState<FigFileImportStep>("select");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<FigFileImportResult | null>(null);
  const [progress, setProgress] = useState(0);
  const parseRunIdRef = useRef(0);

  const reset = useCallback(() => {
    setSelectedFile(null);
    setParsed(null);
    setStep("select");
    setProgress(0);
  }, []);

  const parse = useCallback(async (file: File, runId: number) => {
    const isStale = () => parseRunIdRef.current !== runId;

    setParsing(true);
    setParsed(null);
    setStep("select");
    setProgress(0);

    try {
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();

        reader.onprogress = (e) => {
          if (isStale()) return;
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        };

        reader.onload = () => {
          if (isStale()) return;
          setProgress(100);
          resolve(reader.result as ArrayBuffer);
        };

        reader.onerror = () => reject(reader.error);

        reader.readAsArrayBuffer(file);
      });

      if (isStale()) return;

      const fileBytes = new Uint8Array(buffer);

      // Thumbnail extraction is optional — silently skip failures.
      let thumbnailUrl: string | undefined;
      try {
        const figData = readFigFile(fileBytes);
        const thumbnailBytes = getThumbnail(figData.zip_files);
        if (thumbnailBytes) {
          const blob = new Blob([new Uint8Array(thumbnailBytes)], {
            type: "image/png",
          });
          thumbnailUrl = URL.createObjectURL(blob);
        }
      } catch (e) {
        console.debug("Could not extract thumbnail:", e);
      }

      if (isStale()) {
        if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl);
        return;
      }

      const figFile = FigImporter.parseFile(fileBytes);
      if (isStale()) return;

      setParsed({
        file,
        sceneCount: figFile.pages.length,
        scenes: figFile.pages.map((page) => ({
          name: page.name,
          nodeCount: page.rootNodes.length,
        })),
        thumbnailUrl,
      });
      setStep("confirm");
    } catch (error) {
      toast.error("Failed to parse file");
      console.error(error);
      if (!isStale()) {
        // Mark failure to prevent repeated attempts for the same file
        setParsed({
          file,
          sceneCount: 0,
          scenes: [],
          thumbnailUrl: undefined,
        });
      }
    } finally {
      if (!isStale()) {
        setParsing(false);
      }
    }
  }, []);

  // Auto-parse when file is selected
  useEffect(() => {
    if (!selectedFile) return;

    const nextRunId = parseRunIdRef.current + 1;
    parseRunIdRef.current = nextRunId;

    parse(selectedFile, nextRunId);
  }, [selectedFile, parse]);

  // Cleanup thumbnail URL on unmount or when parsed changes
  useEffect(() => {
    return () => {
      if (parsed?.thumbnailUrl) URL.revokeObjectURL(parsed.thumbnailUrl);
    };
  }, [parsed?.thumbnailUrl]);

  const runImport = useCallback(
    async (onClose: () => void) => {
      if (!parsed || !selectedFile || !onImportFig) return;

      const importPromise = onImportFig(parsed);

      toast.promise(importPromise, {
        loading: "Importing scenes...",
        success: `Imported ${parsed.sceneCount} scene(s)`,
        error: "Failed to import",
      });

      await importPromise;

      if (parsed.thumbnailUrl) URL.revokeObjectURL(parsed.thumbnailUrl);
      reset();
      onClose();
    },
    [parsed, selectedFile, onImportFig, reset]
  );

  return {
    selectedFile,
    setSelectedFile,
    step,
    parsed,
    parsing,
    progress,
    runImport,
    reset,
  };
}
