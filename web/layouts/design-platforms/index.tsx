import React, { useState } from 'react'
import { Box, Flex } from 'rebass'
import styled from '@emotion/styled';
import Image from 'next/image'
import { media } from 'utils/styled/media';
import { ThemeInterface } from 'utils/styled/theme';

const renderPlatforms = ["figma", "sketch", "adobexd"];

const DesignPlatforms = () => {
  const [currentPlatform, setCurrentPlatform] = useState("figma");

  return (
    <AbosulteView width="50%">
      <PlatformView>
        <div className="platform-image">
          <Image
            alt="platform"
            src={`/assets/design-platforms/${currentPlatform}.png`}
            width="auto"
            height="auto"
          />
        </div>
        <div className="platforms">
          {renderPlatforms.map(i => (
            <Image
              alt="platform"
              key={i}
              className="cursor"
              onClick={() => setCurrentPlatform(i)}
              src={`/assets/platform-icons/${i}/${currentPlatform === i ? "default" : "grey"
                }.png`}
              width="24"
              height="24"
            />
          ))}
        </div>
        <div className="preview">

        </div>
      </PlatformView>
    </AbosulteView>
  )
}

export default DesignPlatforms

const AbosulteView = styled(Flex)`
  position: absolute;
  top: 5%;
  left: 15%;

  .platform-image > div {
    box-shadow: 0px 4px 128px 32px rgba(0, 0, 0, 0.08);
    max-width: none !important;
    width: 904px !important;
    height: 565px !important;
  }

  .platforms > div {
    width: 24px;
    height: 24px;
    margin-right: 28px !important;
  }

  .platforms {
    width: 110%;
    left: 85%;
    position: absolute;
    bottom: -100px;
  }
  
  .preview {
    box-shadow: 0px 4px 128px 32px rgba(0, 0, 0, 0.08);
    position: absolute;
    width: 440px;
    height: 540px;
    background-color:#F3F3F3;
    border-radius: 12px;
    right: 12.5%;
    bottom: -7.5%;
  }

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    right: 5%;

    .platform-image > div {
      width: 507px !important;
      height: 317px !important;
    }

    .platforms {
      bottom: -150px;
      left: 0%;
    }

    .preview {
      left: 0%;
      bottom: -30%;
      width: 280px;
      height: 349px;
    }
  }

  ${props => media((props.theme as ThemeInterface).breakpoints[0], (props.theme as ThemeInterface).breakpoints[1])} {
    left: -60%;

    .platforms {
      left: 130%;
    }

    .preview {
      left: 105%;
      bottom: -7.5%;
    }
  }

  ${props => media((props.theme as ThemeInterface).breakpoints[1], (props.theme as ThemeInterface).breakpoints[2])} {
    left: -30%;

    .platforms {
      left: 70%;
    }

    .preview {
      left: 65%;
      bottom: -7.5%;
    }
  }

  ${props => media((props.theme as ThemeInterface).breakpoints[2], (props.theme as ThemeInterface).breakpoints[3])} {
    left: -15%;

    .platforms {
      left: auto;
      right: -65%;
    }

    .preview {
      left: 55%;
      bottom: -7.5%;
    }
  }

  ${props => media((props.theme as ThemeInterface).breakpoints[3], "")} {
    left: 5%;

    .preview {
      left: 40%;
      bottom: -7.5%;
    }
  }

  
`

const Platforms = styled(Box)`
  margin-left: auto;
  position: absolute;
  right: 28%;
  bottom: -10%;
  div {
    width: 24px;
    height: 24px;
    margin-right: 28px !important;
  }
`;

const PlatformView = styled(Flex)`
  flex-direction: column;
  position: relative;
`;
