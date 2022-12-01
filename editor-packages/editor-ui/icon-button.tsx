import React from "react";
import styled from "@emotion/styled";

export const IconButton = React.forwardRef(function (
  { children, ...props }: React.PropsWithChildren<{}>,
  ref: React.Ref<HTMLButtonElement>
) {
  return (
    <IconButtonContainer ref={ref} {...props}>
      {children}
    </IconButtonContainer>
  );
});

const IconButtonContainer = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  border-radius: 4px;
  color: white;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  &:active {
    background: rgba(255, 255, 255, 0.2);
  }

  &:focus {
    outline: 1px solid rgba(255, 255, 255, 0.5);
  }
`;
