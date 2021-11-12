import styled from "@emotion/styled";
import { Flex } from "rebass";

import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";

import Meta from "./meta";

export default function Layout({ children }) {
  return (
    <>
      <Meta />
      <Flex alignItems="center" justifyContent="center">
        <DocsWrapper width={["100%", "730px", "985px", "1040px"]} my="80px">
          {children}
        </DocsWrapper>
      </Flex>
    </>
  );
}

const DocsWrapper = styled(Flex)`
  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    display: flex;
    flex-direction: column;
    margin-top: 0px;
  }
`;
