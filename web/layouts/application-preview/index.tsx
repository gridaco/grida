import React from 'react'
import { Box, Flex } from 'rebass';
import styled from "@emotion/styled"
import Image from 'next/image';

const ApplicationPreview = () => {
  return (
    <Postioner>
      <Image
        className="app"
        src="/assets/iPhone12-frame-blank.png"
        width="390"
        height="788"
        alt="frame_iphone"
      />
      <Preview>
        {/* <AppUI /> */}
        <Image
          className="app"
          src="/assets/source.png"
          width="390"
          height="788"
          alt="frame_iphone"
        />
      </Preview>
    </Postioner>
  )
}

export default ApplicationPreview

const Postioner = styled(Flex)`
  position: relative;
  align-items: center;
  justify-content: center;
  z-index: 1;
`

const Preview = styled(Flex)`
  width: 90%;
  height: 95%;
  position: absolute;
  border-radius: 30px;
`