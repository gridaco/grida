import styled from "@emotion/styled";
import { media } from "utils/styled/media";

export function Title({ children }) {
  return <StyledH1>{children}</StyledH1>;
}

const StyledH1 = styled.h1`
  margin-top: 0;

  ${props => media(props.theme.breakpoints[2], null)} {
    font-size: 64px;
    line-height: 88.19%;
    letter-spacing: -0.02em;
  }

  ${props => media(null, props.theme.breakpoints[2])} {
    font-size: 64px;
    line-height: 64px;
  }

  ${props => media(null, props.theme.breakpoints[1])} {
    font-size: 64px;
    line-height: 88.19%;
    /* or 56px */

    letter-spacing: -0.02em;
  }

  ${props => media(null, props.theme.breakpoints[0])} {
    font-size: 64px;
    line-height: 88.19%;

    letter-spacing: -0.02em;
  }

  ${media(null, "320px")} {
    font-size: 36px;
    line-height: 100.69%;
  }
`;
