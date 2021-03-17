import { css } from "@emotion/core";
import styled from "@emotion/styled";
import { Box } from "rebass";
import { media } from "./media";
import { ThemeInterface } from "./theme";

export const resetUl = css`
  list-style: none;
  padding: 0;
  margin: 0;
`;

export const center = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export const DesktopView = styled.div`
  display: flex;

  .gradient-view {
    position: absolute;
    filter: blur(10px);
    top: -45%;
    right: -20%;
    z-index: -1;

    div {
      width: 1040px !important;
      height: 1027px !important;
    }
  }

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    display: none;
  }
`;

export const MobileView = styled.div`
  display: none;

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    display: flex;
    align-items: center;
    justify-content: center;

    .gradient-view {
      position: absolute;
      filter: blur(10px);
      top: -20%;
      z-index: -1;

      div {
        width: 768px !important;
        height: 520px !important;
      }
    }
  }
`;

export const BodyCustomStyleInAbosulteSectionLayout = styled(Box)`
  .design-to-code-absoulte-view {
    height: 600px;

    ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
      height: 1200px;
    }
  }

  .button-detect-lottie-motion {
    height: 636px;

    ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
      height: auto;
    }

    ${props =>
      media(
        (props.theme as ThemeInterface).breakpoints[0],
        (props.theme as ThemeInterface).breakpoints[1],
      )} {
      height: 423px;
    }

    ${props =>
      media(
        (props.theme as ThemeInterface).breakpoints[1],
        (props.theme as ThemeInterface).breakpoints[2],
      )} {
      height: 529px;
    }
  }

  .gradient-row-tab {
    height: 94px;

    ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
      height: 37px;
    }

    ${props =>
      media(
        (props.theme as ThemeInterface).breakpoints[0],
        (props.theme as ThemeInterface).breakpoints[2],
      )} {
      height: 74px;
    }

    ${props =>
      media(
        (props.theme as ThemeInterface).breakpoints[2],
        (props.theme as ThemeInterface).breakpoints[3],
      )} {
      height: 92px;
    }
  }

  .bottom-application-notification {
    height: 739px;

    .full-width {
      bottom: 11%;

      ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
        bottom: 7%;
      }

      ${props =>
        media(
          (props.theme as ThemeInterface).breakpoints[0],
          (props.theme as ThemeInterface).breakpoints[2],
        )} {
        bottom: 11%;
      }

      ${props =>
        media(
          (props.theme as ThemeInterface).breakpoints[2],
          (props.theme as ThemeInterface).breakpoints[3],
        )} {
        bottom: 12%;
      }
    }
  }
`;
