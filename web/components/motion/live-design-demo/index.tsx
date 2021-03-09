import React, { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { Flex } from "rebass";
import useOnScreen from "utils/hooks/use-on-screen";
import ReactPlayer from "react-player";
import animationData from "public/animations/live-demo-app-design-motion/comp.json";

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
    <DesignFramePreview bg="#F5F5F5" ref={ref} className="preview">
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
      <ReactPlayer
        url={require('public/videos/loop_landingpage-210306-motionsource-section-2-1.mp4')}
        loop
        playing
        muted
      />
    </DesignFramePreview>
  );
}

const DesignFramePreview = styled(Flex)`
  box-shadow: 0px 4px 128px 32px rgba(0, 0, 0, 0.08);
  width: 350px;
  height: 542px;
  top: 15%;
  position: absolute;
  border-radius: 12px;
  left: 40%;
  align-items: center;
  justify-content: center;

  div {
    height: 100% !important;

  }
`;
