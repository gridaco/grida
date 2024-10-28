import React from "react";
import { LoadingProgress as Progress } from "@/components/extension/loading-progress";
import { motion } from "framer-motion";

export function GridLoadingProgressLine({ loading }: { loading?: boolean }) {
  return (
    <motion.div
      className="relative w-full"
      initial={{ opacity: 0 }}
      animate={loading ? "visible" : "hidden"}
      variants={{
        hidden: { opacity: 0, transition: { duration: 0.8 } },
        visible: { opacity: 1, transition: { duration: 0.15 } },
      }}
    >
      <Progress className="absolute bottom-0 left-0 right-0 rounded-none h-0.5 w-full" />
    </motion.div>
  );
}