"use client";

import React from "react";
import { Ruler } from "@grida/ruler";
import { useMeasure } from "@uidotdev/usehooks";
export default function RulerDemoPage() {
  const [ref, size] = useMeasure();

  return (
    <main ref={ref} className="w-dvw h-dvh">
      {size.width && size.height && (
        <Ruler
          width={size.width}
          height={24}
          transform={{
            scaleX: 1,
            translateX: 0,
          }}
        />
      )}
    </main>
  );
}
