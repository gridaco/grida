/* eslint-disable import-helpers/order-imports */
import styled from "@emotion/styled";
import React from "react";

import { BackgroundGradient } from "./styles/background";
import DesignOnceRunAnywhereScaffold from "./scaffold";

const DesignOnceRunAnywhere = () => (
  <Container>
    <DesignOnceRunAnywhereScaffold />
  </Container>
);

const Container = styled.div`
  ${BackgroundGradient}
`;

export default DesignOnceRunAnywhere;
