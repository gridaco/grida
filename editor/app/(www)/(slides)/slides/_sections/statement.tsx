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
      <p className="text-2xl md:text-3xl lg:text-4xl font-semibold leading-snug max-w-3xl text-foreground/80">
        Presentations, built as graphics.
        <br />
        <span className="text-muted-foreground/50">
          Grida Slides gives teams a precise, vector-native way to design
          decks.
        </span>
      </p>
    </motion.section>
  );
}
