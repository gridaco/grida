import styled from "@emotion/styled";
import Icon from "components/icon";
import React, { useCallback } from "react";
import { motion, useTransform, useViewportScroll } from "framer-motion";
import YouTube from 'react-youtube';
import Image from "next/image";
import { usePopupContext } from "utils/context/PopupContext";
import SectionLayout from "layout/section";
import { Flex } from "rebass";

const VideoContainer = styled(Flex)`


  div, iframe {
    width: 100%;
    height: 50vw;
  }
`

function ElevatedVideoPlayer() {
  const { scrollYProgress } = useViewportScroll();
  const scale = useTransform(scrollYProgress, [0, 0.05], [0.8, 1]);
  const { addPopup } = usePopupContext();

  const handleClickLogin = useCallback(() => {
    addPopup({
      title: "",
      element: <SectionLayout variant="content-overflow-1">
        <VideoContainer width="100%" >
          <YouTube className="video" videoId="RIZjZFoDhRc" opts={{
            playerVars: {
              rel: 0,
              showinfo: 0,
              enablejsapi: 1,
              autoplay: 1
            }
          }} />
        </VideoContainer>
      </SectionLayout>,
      showOnlyBody: true,
    });
  }, []);

  return (
    <Frame style={{ scale }}>
      <div className="youtube-thumbnail">
        <Image src="https://img.youtube.com/vi/RIZjZFoDhRc/maxresdefault.jpg" alt="thumbnail" width="auto" height="auto" />
      </div>
      {/* play button click motion */}
      <PlayButtonFrame whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.1 }} onClick={handleClickLogin}>
        <PlayButton name="videoPlay" />
      </PlayButtonFrame>
    </Frame>
  );
}

const Frame = styled(motion.div)`
  will-change: transform;
  background: #ffffff;
  /* landingpage/video-elevation */
  box-shadow: 0px 4px 128px 32px rgba(0, 0, 0, 0.08);
  border-radius: 24px;
  max-width: 1040px;
  max-height: 540px;
  width: 80vw;
  height: 50vw;

  .youtube-thumbnail {
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 24px;
    
    div {
      width: 100% !important;
      height: 100% !important;

      img {
    border-radius: 24px;

      }
    }
  }
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
