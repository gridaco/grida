/* eslint-disable import-helpers/order-imports */
import styled from "@emotion/styled";
import React from "react";

import { BackgroundGradient } from "./styles/background";

import { BreakPoints } from "../_breakpoints";
import LG from "./lg";
import MD from "./md";
import SM from "./sm";
import XL from "./xl";
import XS from "./xs";

const DesignOnceRunAnywhere = () => (
  <Container>
    <BreakPoints.xl>
      <XL />
    </BreakPoints.xl>
    <BreakPoints.lg>
      <LG />
    </BreakPoints.lg>
    <BreakPoints.md>
      <MD />
    </BreakPoints.md>
    <BreakPoints.sm>
      <SM />
    </BreakPoints.sm>
    <BreakPoints.xs>
      <XS />
    </BreakPoints.xs>
  </Container>
);

const Container = styled.div`
  ${BackgroundGradient}
`;

export default DesignOnceRunAnywhere;
