import React from "react";
import styled from "@emotion/styled";
import { Flex } from "rebass";
import Icon from "components/icon";

const DocsSearchBar = () => {
  return (
    <SearcBarWrapper>
      <Icon
        name="search"
        mx="10px"
        height="100%"
        isClickable
        isVerticalMiddle
      />
      <input placeholder="Search in Docs.." />
    </SearcBarWrapper>
  );
};

export default DocsSearchBar;

const SearcBarWrapper = styled(Flex)`
  height: 40px;
  border: 1px solid #c1c1c1;
  width: 100%;
  border-radius: 4px;
  input {
    width: 100%;
    border: none;
    outline: none;
    font-size: 16px;
    border-radius: 4px;
  }
`;
