import React, { useState } from 'react'
import { Flex, Button, Text, Box } from 'rebass';
import styled from '@emotion/styled';
import Image from 'next/image';
import Icon from 'components/icon';

const renderPlatforms = ["flutter", "react", "svelte", "html"]

const CodeFrameworks = () => {
  const [currentPlatform, setCurrentPlatform] = useState("flutter");
  
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
      <Platforms >
        {renderPlatforms.map(i => <PlatformIcon key={i} className="cursor" onClick={() => setCurrentPlatform(i)} isActive={currentPlatform === i} src={`/platform-icons/${i}.png`} width="24" height="24"  />)}
      </Platforms>
      <BlankArea />
    </Flex>
  )
}

export default CodeFrameworks

const Platforms = styled(Box)`
  div {
    width: 24px;
    height: 24px;
    margin-left: 28px !important;
  }
`

const PlatformIcon = styled(Image)<{ isActive : boolean }>`
    ${p => p.isActive ? 'filter: saturate(100%);' : 'filter: saturate(0);'}
`

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
    right: -38% !important;
  }

  @media (max-width: 720px) {
    width: 100%;
    height: 410px;
    top: auto;
    bottom: 5% !important;
    right: 0% !important;
  }
  
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

  @media (max-width: 720px) {
    display: none;
  }
`