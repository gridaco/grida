import styled from "@emotion/styled";
import React, { useEffect, useRef, useState } from "react";
import { Flex } from "rebass";

import animationData from "public/animations/live-demo-app-design-motion/comp.json";
import useOnScreen from "utils/hooks/use-on-screen";
import { media } from "utils/styled/media";

export default function LiveDesignDemoFrame() {
  const [isStopped, setIsStopped] = useState(true);
  const ref = useRef();
  const isVisible = useOnScreen(ref, {
    threshold: 0.8,
  });

  useEffect(() => {
    if (isVisible) {
      setIsStopped(false);
    }
  }, [isVisible, ref]);

  const defaultMotionOptions = {
    loop: false,
    autoplay: false,
    isClickToPauseDisabled: true,
    animationData: animationData,
    rendererSettings: {
      preserveAspectRatio: "xMidYMid slice",
    },
  };

  return (
    <DesignFramePreview ref={ref} className="preview">
      {/* <Lottie
        options={defaultMotionOptions}
        isStopped={isStopped}
        onClick={event => {
          event.preventDefault();
          if (isStopped == true) {
            setIsStopped(false);
          }
        }}
      /> */}

      {/* READ ./ios-15-safari-video-issue.md */}
      {/* https://github.com/cookpete/react-player/issues/1344 */}
      <video
        src={
          "https://player.vimeo.com/progressive_redirect/playback/749854935/rendition/360p/file.mp4?loc=external&signature=a265cb5c5d96e6f2c46cce9c57c1abcef90d1437e7cde0ab1ffa7cccc838f35e"
        }
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      />
    </DesignFramePreview>
  );
}

const DesignFramePreview = styled(Flex)`
  width: 350px !important;
  height: 580px !important;
  align-items: center;
  justify-content: center;
  border-radius: 12px;

  div {
    height: 100% !important;
    width: 350px !important;
  }

  video {
    box-shadow: 0px 4px 128px 32px rgba(0, 0, 0, 0.08);
    border-radius: 12px;
  }

  ${props => media("0px", props.theme.breakpoints[0])} {
    width: 280px !important;
    height: 465px !important;
    div {
      width: 280px !important;
    }
  }
`;
