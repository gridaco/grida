import styled from "@emotion/styled";

import { breakpoints } from "../../_breakpoints";

export const MagicCtaContainer = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: start;
  flex: 1;
  gap: 24px;
  align-self: stretch;
  box-sizing: border-box;

  @media ${breakpoints.xl} {
  }
  @media ${breakpoints.lg} {
  }
  @media ${breakpoints.md} {
  }
  @media ${breakpoints.sm} {
  }
  @media ${breakpoints.xs} {
    flex-direction: column;
  }
`;
