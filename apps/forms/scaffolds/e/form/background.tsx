"use client";

import { motion } from "framer-motion";
import type { FormPageBackgroundSchema } from "@/types";
import { useState } from "react";

export function FormPageBackground({ element, src }: FormPageBackgroundSchema) {
  const renderBackground = () => {
    switch (element) {
      case "iframe":
        return <FormPageBackgroundIframe src={src!} />;
      default:
        return <></>;
    }
  };

  return (
    <div className="fixed select-none inset-0 -z-10">{renderBackground()}</div>
  );
}

export function FormPageBackgroundIframe({ src }: { src: string }) {
  // const [isLoaded, setIsLoaded] = useState(false);
  return (
    // prevent flickering
    <motion.iframe
      suppressHydrationWarning
      initial={{ opacity: 0, scale: 1 }}
      animate={{
        opacity: 1,
      }}
      transition={{ delay: 0.1, duration: 0.25 }}
      // onLoad={() => setIsLoaded(true)}
      // @ts-ignore
      allowtransparency="true"
      background="transparent"
      className="absolute inset-0 w-screen h-screen -z-10"
      src={src}
      width="100vw"
      height="100vh"
    />
  );
}
