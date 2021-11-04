import React, { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { Flex } from "rebass";
import useOnScreen from "utils/hooks/use-on-screen";
import ReactPlayer from "react-player";
import animationData from "public/animations/live-demo-app-design-motion/comp.json";
import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";

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
        src={require("public/videos/landingpage-section2-live-design-demo.min.mp4")}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      />
      {/* <ReactPlayer
        url={require("public/videos/landingpage-section2-live-design-demo.min.mp4")}
        loop
        playing
        muted
        playsinline
        config={{
          file: {
            attributes: {
              preload: "auto",
            },
          },
        }}
      /> */}
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

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    width: 280px !important;
    height: 465px !important;
    div {
      width: 280px !important;
    }
  }
`;
