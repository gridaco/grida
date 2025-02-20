import React, { useRef, useEffect } from "react";
import styled from "@emotion/styled";
import { motion } from "framer-motion";
export function Background() {
  return (
    <HeroGradientBgArtwork>
      {/* <StaticGradient /> */}
      <DynamicGradientIframe />
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
        height: "1033px",
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
