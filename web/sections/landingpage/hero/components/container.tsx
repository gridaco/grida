import styled from "@emotion/styled";
import { motion } from "framer-motion";

import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";

export const HeroCtaContainer = styled(motion.div)`
  padding-top: 24px;
  padding-bottom: 24px;
  align-self: stretch;
  justify-content: flex-start;
  display: flex;
  align-items: start;
  flex: none;
  gap: 14px;

  ${props => media((props.theme as ThemeInterface).breakpoints[3])} {
    flex-direction: row;
  }

  ${props =>
    media(
      (props.theme as ThemeInterface).breakpoints[2],
      (props.theme as ThemeInterface).breakpoints[3],
    )} {
    flex-direction: row;
  }

  ${props =>
    media(
      (props.theme as ThemeInterface).breakpoints[1],
      (props.theme as ThemeInterface).breakpoints[2],
    )} {
    flex-direction: row;
  }

  ${props =>
    media(
      (props.theme as ThemeInterface).breakpoints[0],
      (props.theme as ThemeInterface).breakpoints[1],
    )} {
    flex-direction: row;
  }

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    flex-direction: column;
    flex: 1;
    align-self: stretch;
  }
`;
