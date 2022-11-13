import React from "react";
import styled from "@emotion/styled";

export function TextField({
  placeholder,
  value,
  disabled,
}: {
  placeholder?: string;
  value?: string;
  disabled?: boolean;
}) {
  return (
    <InputWrapper
      disabled={disabled}
      value={value}
      placeholder={placeholder}
    ></InputWrapper>
  );
}

const InputWrapper = styled.input`
  position: relative;
  padding: 8px 16px;
  background-color: rgba(0, 0, 0, 0.4);
  border-radius: 4px;
  border: none;
  outline: none;

  text-overflow: ellipsis;
  font-size: 12px;
  font-family: Inter, sans-serif;
  font-weight: initial;
  text-align: left;

  color: white;

  &:disabled {
    color: rgba(255, 255, 255, 0.5);
  }

  ::placeholder {
  }
`;
