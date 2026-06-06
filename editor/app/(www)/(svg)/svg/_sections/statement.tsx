"use client";

import React from "react";
import { motion } from "motion/react";

export default function Statement() {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      viewport={{ once: true }}
      whileInView={{ opacity: 1 }}
      transition={{ duration: 1.2, ease: "easeOut" }}
      className="flex flex-col items-center text-center py-10 md:py-20"
    >
      <blockquote className="text-2xl md:text-3xl lg:text-4xl font-medium leading-snug max-w-3xl text-foreground/80">
        “The file is the source of truth. A good editor honors it — and leaves
        no fingerprints of its own.”
      </blockquote>
    </motion.section>
  );
}
