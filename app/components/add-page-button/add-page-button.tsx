import styled from "@emotion/styled";
import React from "react";

export function AddPageButton() {
  return (
    <Button
      onClick={() => {
        console.warn("todo >> implement add apge");
      }}
    >
      + Add Page
    </Button>
  );
}

const Button = styled.button`
  width: 100%;
  border: none;
  background: none;
`;
