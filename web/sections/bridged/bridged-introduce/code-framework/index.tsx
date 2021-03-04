import React from 'react'
import { Flex, Button, Text, Box } from 'rebass';
import styled from '@emotion/styled';
import Image from 'next/image';
import Icon from 'components/icon';

const CodeFrameworks = () => {
  return (
    <Flex flex={1} flexDirection="column" alignItems="flex-end" justifyContent="flex-end">
      <CodeView width="460px" height="770px" bg="#212121">
        <header>
          <span />
          <span />
          <span />
        </header>
        <div className="body">
          <main>
            Code section
              </main>
        </div>

      </CodeView>
      <Box>
        <Icon name="bridged" width={24} height={24} />
        <Icon name="bridged" width={24} height={24} ml="28px" />
        <Icon name="bridged" width={24} height={24} ml="28px" />
        <Icon name="bridged" width={24} height={24} ml="28px" />
      </Box>
      <BlankArea />
    </Flex>
  )
}

export default CodeFrameworks

const CodeView = styled(Box)`
  position: absolute;
  top: -35%;
  right: -20%;
  border-radius: 12px;

  @media (max-width: 940px) {
    top: -35%;
    right: -33% !important;
  }

  @media (max-width: 800px) {
    top: -35%;
    right: -42% !important;
  }
/* 
  @media (max-width: 320px) {
    width: 280px;
    height: 410px;
    top: 45% !important;
    right: -0% !important;
  } */
  
  header {
    display: flex;
    align-items: center;
    height: 50px;
    padding: 0px 20px;
    border-top-left-radius: 12px;
    border-top-right-radius: 12px;

    span {
      background-color:#3D3D3D;
      width: 16px;
      height: 16px;
      margin-right: 10px;
      border-radius: 50%;
    }
  }

  .body {
    width:100%;
    height: calc(100% - 50px);
    display: flex;
    align-items: center;
    justify-content: center;

    main {
      width: 95%;
      height: 95%;
      background-color: #fff;
    }
  }
  
`

const BlankArea = styled(Box)`
  height: 200px;
  width:100%;
`