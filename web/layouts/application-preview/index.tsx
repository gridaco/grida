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
      {/* <Application>
        <AppUI />
      </Application> */}
    </Postioner>
  )
}

export default ApplicationPreview

const Postioner = styled(Flex)`
  position: relative;
  align-items: center;
  justify-content: center;
`