"use client";

import { useState } from "react";
import {
  SvgEditorCanvas,
  SvgEditorProvider,
  useEditorLoad,
} from "@grida/svg-editor/react";
import type { DomSurfaceHandle } from "@grida/svg-editor/dom";
import { SvgShell } from "./_components/svg-shell";
import { SvgToolbar } from "./_components/svg-toolbar";
import SAMPLE_SVG from "./_fixtures/simple";
// import SAMPLE_SVG from "./_fixtures/default";
import { AISvgChatProvider } from "./_ai/provider";
import { AISvgChatPanel } from "./_ai/panel";

export default function SvgEditorDevPage() {
  return (
    <SvgEditorProvider initialSvg={SAMPLE_SVG}>
      <AISvgChatProvider>
        <SvgEditorDevPageBody />
        <AISvgChatPanel />
      </AISvgChatProvider>
    </SvgEditorProvider>
  );
}

/** Lives inside the provider so `useEditorLoad()` resolves. */
function SvgEditorDevPageBody() {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [handle, setHandle] = useState<DomSurfaceHandle | null>(null);
  const load = useEditorLoad();

  const loadSvgFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      if (!text.includes("<svg")) {
        setLoadError(`"${file.name}" does not contain an <svg> element.`);
        return;
      }
      setLoadError(null);
      setSourceName(file.name);
      load(text);
    };
    reader.onerror = () => setLoadError("Failed to read file.");
    reader.readAsText(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!dragging) setDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setDragging(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) loadSvgFile(file);
  };

  return (
    <SvgShell
      title="Canvas / SVG"
      badge="DEMO"
      handle={handle}
      sourceName={sourceName}
      loadError={loadError}
      onPickFile={loadSvgFile}
      onReset={() => {
        setLoadError(null);
        setSourceName(null);
        load(SAMPLE_SVG);
      }}
      canvas={
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className="absolute inset-0 bg-[radial-gradient(circle,theme(colors.border)_1px,transparent_1px)] [background-size:20px_20px] data-[dragging=true]:outline-2 data-[dragging=true]:outline-dashed data-[dragging=true]:outline-primary data-[dragging=true]:-outline-offset-2"
          data-dragging={dragging}
        >
          <SvgEditorCanvas fit onAttach={setHandle} className="w-full h-full" />
          <SvgToolbar />
          {dragging && (
            <div className="absolute inset-0 flex items-center justify-center bg-primary/5 text-primary text-sm font-semibold pointer-events-none">
              Drop SVG to load
            </div>
          )}
        </div>
      }
    />
  );
}
