import styled from "@emotion/styled";
import React from "react";
import { DocsRoute } from "utils/docs/model";

function DocsNavigationMobile(props: { route: DocsRoute }) {
  return <Wrapper>Menu</Wrapper>;
}

export default DocsNavigationMobile;

const Wrapper = styled.div`
  width: 100%;
  height: 100px;
`;
