"use client";

import { useEffect, useRef } from "react";
import type { MotionValue } from "motion/react";
import { WorkflowEdges, type WorkflowEdge } from "./workflow-edges";
import styles from "./workflow-edges.module.css";

/** Place directly inside the positioned container holding the named nodes. */
export default function WorkflowEdgesView({
  edges,
  progress,
}: {
  edges: readonly WorkflowEdge[];
  progress?: MotionValue<number>;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const connectors = new WorkflowEdges(ref.current!, edges);
    connectors.setProgress(progress?.get() ?? 1);
    const unsubscribe = progress?.on("change", (value) =>
      connectors.setProgress(value)
    );
    return () => {
      unsubscribe?.();
      connectors.dispose();
    };
  }, [edges, progress]);
  return <svg ref={ref} className={styles.edges} aria-hidden="true" />;
}
