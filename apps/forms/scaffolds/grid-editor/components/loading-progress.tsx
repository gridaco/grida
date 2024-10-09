import React from "react";
import { LoadingProgress as Progress } from "@/components/extension/loading-progress";
import { motion } from "framer-motion";
import { useEditorState } from "@/scaffolds/editor";

export function GridLoadingProgressLine() {
  const [state] = useEditorState();

  const { datagrid_isloading } = state;

  return (
    <motion.div
      className="relative w-full"
      initial={{ opacity: 0 }}
      animate={datagrid_isloading ? "visible" : "hidden"}
      variants={{
        hidden: { opacity: 0, transition: { duration: 0.8 } },
        visible: { opacity: 1, transition: { duration: 0.15 } },
      }}
    >
      <Progress className="absolute bottom-0 left-0 right-0 rounded-none h-0.5 w-full" />
    </motion.div>
  );
}
