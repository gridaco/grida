"use client";

import { useEffect, useRef, useState } from "react";
import { LocalGltfPreviewController } from "./local-gltf-preview-controller";

export function LocalGltfPreview({
  files,
  active = true,
  showSkeleton = false,
  previewMotion,
  motionPlaying = true,
  onMotionStatusChange,
  onStatusChange,
}: {
  files: readonly File[];
  active?: boolean;
  showSkeleton?: boolean;
  previewMotion?: LocalGltfPreviewController.PreviewMotion;
  motionPlaying?: boolean;
  onMotionStatusChange?: (
    status: LocalGltfPreviewController.MotionStatus
  ) => void;
  onStatusChange?: (status: LocalGltfPreviewController.Status) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<LocalGltfPreviewController>(null);
  const activeRef = useRef(active);
  const skeletonRef = useRef(showSkeleton);
  const motionRef = useRef({ previewMotion, motionPlaying });
  const onMotionStatusChangeRef = useRef(onMotionStatusChange);
  const onStatusChangeRef = useRef(onStatusChange);
  const [status, setStatus] = useState<LocalGltfPreviewController.Status>({
    phase: "idle",
  });

  useEffect(() => {
    skeletonRef.current = showSkeleton;
    controllerRef.current?.setShowSkeleton(showSkeleton);
  }, [showSkeleton]);

  useEffect(() => {
    motionRef.current = { previewMotion, motionPlaying };
    controllerRef.current?.setPreviewMotion(previewMotion);
    controllerRef.current?.setMotionPlaying(motionPlaying);
  }, [previewMotion, motionPlaying]);

  useEffect(() => {
    onMotionStatusChangeRef.current = onMotionStatusChange;
  }, [onMotionStatusChange]);

  useEffect(() => {
    activeRef.current = active;
    controllerRef.current?.setActive(active);
  }, [active]);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const reportStatus = (next: LocalGltfPreviewController.Status) => {
      setStatus(next);
      onStatusChangeRef.current?.(next);
    };
    try {
      const controller = new LocalGltfPreviewController(host, {
        active: activeRef.current,
        showSkeleton: skeletonRef.current,
        ...motionRef.current,
        onMotionStatusChange: (next) => onMotionStatusChangeRef.current?.(next),
        onStatusChange: reportStatus,
      });
      controllerRef.current = controller;
      return () => {
        controllerRef.current = null;
        controller.dispose();
      };
    } catch (error) {
      reportStatus({
        phase: "error",
        message:
          error instanceof Error
            ? error.message
            : "WebGL is unavailable for this preview.",
      });
    }
  }, []);

  useEffect(() => {
    void controllerRef.current?.load(files);
  }, [files]);

  return (
    <div
      ref={hostRef}
      data-testid="preview-local-gltf"
      className="relative h-full min-h-64 w-full overflow-hidden rounded-md bg-neutral-950"
      aria-busy={status.phase === "loading"}
    >
      {status.phase === "loading" && (
        <div
          className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-black/20 text-xs text-white/70"
          role="status"
        >
          Preparing 3D preview…
        </div>
      )}
      {status.phase === "error" && (
        <div
          className="pointer-events-none absolute inset-0 z-10 grid place-items-center p-6 text-center text-xs text-red-200"
          role="alert"
        >
          {status.message}
        </div>
      )}
    </div>
  );
}
