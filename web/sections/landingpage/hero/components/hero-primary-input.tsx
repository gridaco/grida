import styled from "@emotion/styled";
import React from "react";

export const HeroPrimaryInput = React.forwardRef(
  (
    {
      onChange,
      onSubmit,
      placeholder,
    }: {
      onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
      onSubmit?: (e: React.FormEvent<HTMLInputElement>) => void;
      placeholder?: string;
    },
    ref?: React.RefObject<HTMLInputElement>,
  ) => {
    const _handleKeyDown = e => {
      if (e.key === "Enter") {
        onSubmit?.(e);
      }
    };

    return (
      <RootWrapperHeroPrimaryInput
        ref={ref}
        onKeyDown={_handleKeyDown}
        onChange={onChange}
        placeholder={placeholder}
      />
    );
  },
);

const RootWrapperHeroPrimaryInput = styled.input`
  flex: 3;
  box-shadow: 0px 4px 48px rgba(0, 0, 0, 0.12);
  border: solid 1px rgba(210, 210, 210, 1);
  border-radius: 4px;
  background-color: rgba(255, 255, 255, 1);
  box-sizing: border-box;
  align-self: stretch;
  padding: 24px 24px;
  ::placeholder {
    color: rgba(181, 181, 181, 1);
    text-overflow: ellipsis;
    font-size: 18px;
    font-family: "Inter", sans-serif;
    font-weight: 400;
    line-height: 98%;
    text-align: left;
  }
  font-size: 18px;
  font-family: "Inter", sans-serif;
  font-weight: 400;
  line-height: 98%;
  text-align: left;
`;
