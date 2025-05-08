"use client";

import React from "react";
import { motion } from "motion/react";

export function Rotate({
  children,
  ...props
}: React.PropsWithChildren<{
  className?: string;
  style?: React.CSSProperties;
}>) {
  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{
        repeatDelay: 3,
        duration: 1,
        repeat: Infinity,
        repeatType: "loop",
      }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
