import styled from "@emotion/styled";
import Icon from "components/icon";
import React, { useCallback, useState } from "react";
import { motion, useTransform, useViewportScroll } from "framer-motion";
import { usePopupContext } from "utils/context/PopupContext";
import { Flex } from "rebass";
import ReactPlayer from "react-player";

const VideoContainer = styled(Flex)`
  div,
  iframe {
    width: 100%;
    height: 50vw;

    max-height: 690px;
  }
`;

function ElevatedVideoPlayer() {
  const { scrollYProgress } = useViewportScroll();
  const scale = useTransform(scrollYProgress, [0, 0.05], [0.8, 1]);
  const [actualVideoPlaying, setActualVideoPlaying] = useState(false);
  const { addPopup } = usePopupContext();

  // region event handlers
  const handleOnYoutubePlayStart = () => {
    setActualVideoPlaying(true);
  };
  const handleOnYoutubePlayEnd = () => {
    setActualVideoPlaying(false);
  };
  const handlePopupClose = () => {
    setActualVideoPlaying(false);
  };
  // endregion event handlers

  const handleClickLogin = useCallback(() => {
    addPopup({
      title: "",
      element: (
        <VideoContainer width="calc(100vw - 40px)" height="100%">
          <ReactPlayer
            url="https://www.youtube.com/watch?v=RIZjZFoDhRc&ab_channel=Bridged"
            width="100%"
            height="100%"
            playing
            loop
            muted
            onStart={handleOnYoutubePlayStart}
            onEnded={handleOnYoutubePlayEnd}
          />
        </VideoContainer>
      ),
      onDismiss: handlePopupClose,
      height: "50vw",
    });
  }, []);

  return (
    <Frame style={{ scale }}>
      <div className="youtube-thumbnail">
        <ReactPlayer
          url={require("public/videos/promotion-video-preview.mp4")}
          loop
          playing={!actualVideoPlaying}
          muted
        />
      </div>
      {/* play button click motion */}
      <PlayButtonFrame
        whileTap={{ scale: 0.9 }}
        whileHover={{ scale: 1.1 }}
        onClick={handleClickLogin}
      >
        <PlayButton name="videoPlay" />
      </PlayButtonFrame>
    </Frame>
  );
}

const Frame = styled(motion.div)`
  position: relative;
  will-change: transform;
  background: #ffffff;
  /* landingpage/video-elevation */
  box-shadow: 0px 4px 128px 32px rgba(0, 0, 0, 0.08);
  border-radius: 24px;
  max-width: 1040px;
  max-height: 585px;
  width: 80vw;
  height: 50vw;

  .youtube-thumbnail {
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 24px;
    overflow: hidden;
    div {
      width: 100% !important;
      height: 100% !important;

      video {
        object-fit: cover;
      }
    }
  }
`;

const PlayButtonFrame = styled(motion.div)`
  cursor: pointer;
  position: relative;
  width: 112px;
  height: 112px;
  left: calc(50% - 112px / 2);
  top: calc(50% - 112px / 2);
`;

const PlayButton = styled(Icon)``;

export default ElevatedVideoPlayer;
