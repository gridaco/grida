"use client";

import { motion, MotionConfig, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import styles from "./home.module.css";

export default function HomeMotion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

export function Reveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ y: 24 }}
      whileInView={{ y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{
        duration: reducedMotion ? 0 : 0.85,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}

/** The canvas journey owns the entrance; this chapter continues its dark surface. */
export function CreativeChapter({ children }: { children: ReactNode }) {
  return (
    <div
      data-testid="home-creative-chapter"
      data-theme="dark"
      className={`dark ${styles.creativeChapter}`}
    >
      {children}
    </div>
  );
}
