import { css } from "@emotion/core";
import styled from '@emotion/styled';
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
  justifyContent: "center"
}

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
`

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
`