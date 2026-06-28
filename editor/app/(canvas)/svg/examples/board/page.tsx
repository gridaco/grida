"use client";

import dynamic from "next/dynamic";

// Browser-only (DOM measurement, pointer/wheel, future svg-editor mount).
const SvgCanvasPlayground = dynamic(() => import("./_page"), { ssr: false });

export default function Page() {
  return <SvgCanvasPlayground />;
}
