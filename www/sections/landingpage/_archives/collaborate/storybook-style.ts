import styled from "@emotion/styled";

import LandingpageText from "components/landingpage/text";
import { media } from "utils/styled/media";

export const Description = styled(LandingpageText)`
  margin-top: 36px;
  margin-left: 120px;
  max-width: 655px;

  /* ${props => media("0px", props.theme.breakpoints[0])} {
    max-width: 100%;
    margin-left: 20px;
  }

  ${props => media(props.theme.breakpoints[0], props.theme.breakpoints[1])} {
    margin-left: 20px;
  }

  ${props => media(props.theme.breakpoints[1], props.theme.breakpoints[2])} {
    margin-left: 100px;
  }

  ${props => media(props.theme.breakpoints[2], props.theme.breakpoints[3])} {
    margin-left: 120px;
  } */

`;
