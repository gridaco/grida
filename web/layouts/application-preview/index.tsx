import React from 'react'
import { Box, Flex } from 'rebass';
import styled from "@emotion/styled"
import Image from 'next/image';
import AppUI from 'components/app-ui';

const AppPreview = () => {
  return (
    <Postioner>
      <Image
        className="app"
        src="/iPhone12-frame-blank.png"
        width="390"
        height="788"
        alt="frame_iphone"
      />
      <Application>
        <AppUI />
      </Application>
    </Postioner>
  )
}

export default AppPreview

const Postioner = styled(Flex)`
  position: relative;
  align-items: center;
  justify-content: center;
`

const Application = styled(Box)`
  position: absolute;
  width: 90%;
  height: 95%;
  z-index: 1;

  @media (max-width: 768px) {

    h1 {
      font-size: 20px;
    }

    .profile {
      width: 40px !important;
      height: 40px !important;
    }

    .comment {
      font-size: 10px;
    }

    .playing {
      font-size: 11px;
    }

    .music-profile {
      width: 50px !important;
      height: 50px !important;
      margin: 0px !important;
    }

    .music-title {
      font-size: 12px !important;
    }

    .music-info {
      font-size: 11px !important;
    }

    .play {
      width: 24px;
    }

    .album-info {
      font-size: 10px;
      letter-spacing: -1.5%;
    }
  }
`