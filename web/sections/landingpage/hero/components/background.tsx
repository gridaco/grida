import React, { useRef, useEffect } from "react";
import styled from "@emotion/styled";
import ClientOnly from "components/clientonly";
import { motion } from "framer-motion";
export function Background() {
  return (
    <HeroGradientBgArtwork>
      {/* <StaticGradient /> */}
      <ClientOnly>
        {/* <DynamicGradient /> */}
        <DynamicGradientIframe />
      </ClientOnly>
    </HeroGradientBgArtwork>
  );
}

function DynamicGradientIframe() {
  return (
    <motion.iframe
      // fade in initially
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: 1,
        delay: 0.1,
      }}
      src="/hero-dynamic-gradient/index.html"
      style={{
        width: "100%",
        height: "calc(100vh + 64px)",
        border: "none",
        overflow: "hidden",
      }}
    />
  );
}

const HeroGradientBgArtwork = styled.div`
  z-index: -99;
  user-select: none;
`;
