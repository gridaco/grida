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

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    display: none;
  }
`

export const MobileView = styled.div`
  display: none;

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    display: flex;
  }
`