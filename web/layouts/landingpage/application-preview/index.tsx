import styled from "@emotion/styled";
import Image from "next/image";
import React from "react";
import { Box, Flex } from "rebass";

import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";

const ApplicationPreview = () => {
  return (
    <Postioner>
      <Image
        loading="eager"
        className="app"
        src="/assets/sample-app-as-image.png"
        width="390px"
        height="788px"
        alt="Grida demo app - design to code"
      />
      {/* <Preview>
        <AppUI />
        <Image
          className="app"
          src="/assets/source.png"
          width="390px"
          height="788px"
          alt="frame_iphone"
        />
      </Preview> */}
    </Postioner>
  );
};

export default ApplicationPreview;

const Postioner = styled(Flex)`
  position: relative;
  align-items: center;
  justify-content: center;
  z-index: 1;
  width: 390px !important;
  max-height: 788px;
  height: auto;
`;

const Preview = styled(Flex)`
  width: 90%;
  height: 95%;
  position: absolute;
  border-radius: 30px;

  ${props =>
    media(
      (props.theme as ThemeInterface).breakpoints[0],
      (props.theme as ThemeInterface).breakpoints[1],
    )} {
    height: 90%;
  }
`;
