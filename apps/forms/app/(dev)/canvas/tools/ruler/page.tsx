"use client";

import React from "react";
import { Ruler } from "@grida/ruler";
import { useMeasure } from "@uidotdev/usehooks";
export default function RulerDemoPage() {
  const [ref, size] = useMeasure();

  return (
    <main ref={ref} className="w-dvw h-dvh">
      {size.width && size.height && (
        <>
          <div className="fixed top-0 left-0 right-0 border-b">
            <Ruler
              axis="x"
              width={size.width}
              height={24}
              transform={{
                scaleX: 1,
                translateX: 0,
              }}
            />
          </div>
          <div className="fixed top-0 left-0 bottom-0 border-r">
            <Ruler
              axis="y"
              width={24}
              height={size.height}
              transform={{
                scaleX: 1,
                translateX: 0,
              }}
            />
          </div>
        </>
      )}
    </main>
  );
}
