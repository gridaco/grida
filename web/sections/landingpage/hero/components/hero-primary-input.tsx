import styled from "@emotion/styled";
import React from "react";

export function HeroPrimaryInput({
  onChange,
  onSubmit,
}: {
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit?: (e: React.FormEvent<HTMLInputElement>) => void;
}) {
  const _handleKeyDown = e => {
    if (e.key === "Enter") {
      onSubmit?.(e);
    }
  };

  return (
    <RootWrapperHeroPrimaryInput
      type="email"
      autoComplete="on"
      onKeyDown={_handleKeyDown}
      onChange={onChange}
      // "Enter your Figma design url"
      placeholder="Enter your Email address"
    />
  );
}

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
    font-family: "Helvetica Neue", sans-serif;
    font-weight: 400;
    line-height: 98%;
    text-align: left;
  }
  text-overflow: ellipsis;
  font-size: 18px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  line-height: 98%;
  text-align: left;
`;
