"use client";
import { useEffect, useState } from "react";

export function useDPR() {
  const [dpr, setDPR] = useState<number>(() => {
    if (typeof window === "undefined") {
      return 1;
    }
    const ratio = window.devicePixelRatio;
    return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const update = () => {
      const ratio = window.devicePixelRatio;
      const next = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
      setDPR((prev) => (Math.abs(prev - next) > 1e-3 ? next : prev));
    };

    update();

    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    let mediaQuery: MediaQueryList | null = null;
    let mediaQueryListener: ((event: MediaQueryListEvent) => void) | null =
      null;

    // Listen for DPR changes (e.g., when moving between displays or browser zoom)
    if (typeof window.matchMedia === "function") {
      mediaQuery = window.matchMedia(`(resolution: ${dpr}dppx)`);
      mediaQueryListener = () => update();
      mediaQuery.addEventListener("change", mediaQueryListener);
    }

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      if (mediaQuery && mediaQueryListener) {
        mediaQuery.removeEventListener("change", mediaQueryListener);
      }
    };
  }, [dpr]);

  return dpr;
}
