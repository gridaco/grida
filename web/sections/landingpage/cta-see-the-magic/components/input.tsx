import styled from "@emotion/styled";
import React from "react";

import { breakpoints } from "sections/landingpage/_breakpoints";

export const MagicInput = React.forwardRef(
  (
    {
      onChange,
      onSubmit,
    }: {
      onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
      onSubmit?: (e: React.FormEvent<HTMLInputElement>) => void;
    },
    ref?: React.RefObject<HTMLInputElement>,
  ) => {
    const _handleKeyDown = e => {
      if (e.key === "Enter") {
        onSubmit?.(e);
      }
    };

    return (
      <StyledInput
        ref={ref}
        onKeyDown={_handleKeyDown}
        placeholder="https://www.figma.com/file/xxxx/xxxx?node-id=1234%3A5678"
        onChange={onChange}
      />
    );
  },
);

export const StyledInput = styled.input`
  height: 80px;
  max-width: 1040px;
  padding: 24px;
  align-self: stretch;
  overflow: hidden;
  background-color: rgba(255, 255, 255, 1);
  border: solid 1px rgba(210, 210, 210, 1);
  border-radius: 4px;
  position: relative;
  box-shadow: 0px 4px 48px rgba(0, 0, 0, 0.12);
  font-size: 21px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  ::placeholder {
    color: rgba(210, 210, 210, 1);
  }

  @media ${breakpoints.xl} {
    flex: 1;
  }
  @media ${breakpoints.lg} {
    flex: 1;
  }
  @media ${breakpoints.md} {
    flex: 1;
  }
  @media ${breakpoints.sm} {
    flex: 1;
  }
  @media ${breakpoints.xs} {
    flex: none;
  }
`;
