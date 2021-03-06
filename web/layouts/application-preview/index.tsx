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
`