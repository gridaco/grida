"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  PresentationEngine,
  type PresentationEngineOptions,
  type PresentationEngineState,
} from "@/grida-canvas/presentation-engine";

export interface PresentationOverlayProps extends PresentationEngineOptions {
  onExit: () => void;
}

export function PresentationOverlay({
  onExit,
  ...engineOptions
}: PresentationOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PresentationEngine | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const [state, setState] = useState<PresentationEngineState>({
    currentIndex: engineOptions.startSlide ?? 0,
    slideCount: engineOptions.slideIds.length,
  });
  const [hudVisible, setHudVisible] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const engine = new PresentationEngine(engineOptions);
    engineRef.current = engine;
    const unsub = engine.subscribe(setState);

    engine.mount(canvas, dpr).catch((err) => {
      console.error("[PresentationOverlay] mount failed:", err);
    });

    return () => {
      unsub();
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.requestFullscreen?.().catch(() => {});

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) onExitRef.current();
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (document.fullscreenElement === el) document.exitFullscreen?.();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let rafId = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const dpr = window.devicePixelRatio || 1;
        const { width, height } = canvas.getBoundingClientRect();
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        engineRef.current?.resize(canvas.width, canvas.height);
      });
    });
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const show = () => {
      setHudVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setHudVisible(false), 2000);
    };
    show();
    window.addEventListener("mousemove", show);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", show);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const engine = engineRef.current;
      if (!engine) return;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case " ":
        case "Enter":
          e.preventDefault();
          if (!engine.next()) onExitRef.current();
          break;
        case "ArrowLeft":
        case "ArrowUp":
          e.preventDefault();
          engine.prev();
          break;
        case "Escape":
          e.preventDefault();
          onExitRef.current();
          break;
        case "Home":
          e.preventDefault();
          engine.goToSlide(0);
          break;
        case "End":
          e.preventDefault();
          engine.goToSlide(engine.slideCount - 1);
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const onClick = useCallback(() => {
    const engine = engineRef.current;
    if (engine && !engine.next()) onExitRef.current();
  }, []);

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "#000",
        cursor: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          color: "rgba(255, 255, 255, 0.7)",
          fontSize: 14,
          fontFamily: "system-ui, sans-serif",
          fontVariantNumeric: "tabular-nums",
          pointerEvents: "none",
          transition: "opacity 300ms ease",
          opacity: hudVisible ? 1 : 0,
        }}
      >
        {state.currentIndex + 1} / {state.slideCount}
      </div>
    </div>
  );
}
