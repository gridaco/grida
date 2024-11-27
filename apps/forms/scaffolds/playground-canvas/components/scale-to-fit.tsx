//
// WIP: - this is a concept and does not work with the surface
//

import { cn } from "@/utils";
import { useMeasure } from "@uidotdev/usehooks";
import React, { ReactNode, useEffect, useState } from "react";

interface ScaleToFitProps {
  children: ReactNode;
  className?: string; // To allow additional styling
  minScale?: number; // Minimum allowed scale
  maxScale?: number; // Maximum allowed scale
}

const ScaleToFit: React.FC<ScaleToFitProps> = ({
  children,
  className,
  minScale = 0.5,
  maxScale = 2,
}) => {
  const [rootRef, { width: rootWidth, height: rootHeight }] = useMeasure();
  const [childRef, { width: childWidth, height: childHeight }] = useMeasure();
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (
      (rootWidth ?? 0) > 0 &&
      (rootHeight ?? 0) > 0 &&
      (childWidth ?? 0) > 0 &&
      (childHeight ?? 0) > 0
    ) {
      const scaleX = (rootWidth ?? 0) / (childWidth ?? 0);
      const scaleY = (rootHeight ?? 0) / (childHeight ?? 0);
      const calculatedScale = Math.min(scaleX, scaleY);

      // Clamp the scale between minScale and maxScale
      setScale(Math.max(minScale, Math.min(calculatedScale, maxScale)));
    }
  }, [rootWidth, rootHeight, childWidth, childHeight, minScale, maxScale]);

  return (
    <div ref={rootRef} className={cn("relative overflow-hidden", className)}>
      <div
        ref={childRef}
        className="absolute top-0 left-0 transform origin-top-left"
        style={{
          transform: `scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default ScaleToFit;
