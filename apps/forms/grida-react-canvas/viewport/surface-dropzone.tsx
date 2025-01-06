import { useEffect } from "react";
import { useDataTransferEventTarget } from "../provider";
import { cn } from "@/utils";

export function EditorSurfaceDropzone({
  className,
  children,
}: React.PropsWithChildren<{ className?: string }>) {
  const { ondragover, ondrop, onpaste } = useDataTransferEventTarget();

  useEffect(() => {
    const cb = (e: ClipboardEvent) => {
      onpaste(e);
    };
    window.addEventListener("paste", cb);
    return () => window.removeEventListener("paste", cb);
  }, [onpaste]);

  return (
    <div
      onDropCapture={ondrop}
      onDragOverCapture={ondragover}
      className={cn("w-full h-full", className)}
    >
      {children}
    </div>
  );
}
