import styled from "@emotion/styled";
import Icon from "components/icon";
import React from "react";
import { motion, useTransform, useViewportScroll } from "framer-motion";
function ElevatedVideoPlayer() {
  const { scrollYProgress } = useViewportScroll();
  const scale = useTransform(scrollYProgress, [0, 0.05], [0.8, 1]);
  return (
    //   video player mouse hover scale motion
    <Frame style={{ scale }}>
      {/* play button click motion */}
      <PlayButtonFrame whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.1 }}>
        <PlayButton name="videoPlay" />
      </PlayButtonFrame>
    </Frame>
  );
}

const Frame = styled(motion.div)`
  background: #ffffff;
  /* landingpage/video-elevation */
  box-shadow: 0px 4px 128px 32px rgba(0, 0, 0, 0.08);
  border-radius: 24px;
  width: 80vw;
  height: 544px;
`;

const PlayButtonFrame = styled(motion.div)`
  position: relative;
  width: 112px;
  height: 112px;
  left: calc(50% - 112px / 2);
  top: calc(50% - 112px / 2);
`;

const PlayButton = styled(Icon)``;

export default ElevatedVideoPlayer;
