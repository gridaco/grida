import React from "react";
import styled from "@emotion/styled";

export function TextField({
  placeholder,
  value,
  disabled,
  fullWidth,
  onChange,
  onSubmit,
}: {
  placeholder?: string;
  value?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  onChange?: (value: string) => void;
  onSubmit?: () => void;
}) {
  return (
    <InputWrapper
      disabled={disabled}
      value={value}
      placeholder={placeholder}
      onChange={(e) => {
        onChange(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          onSubmit?.();
        }
      }}
      style={{
        width: fullWidth ? "100%" : "auto",
      }}
    ></InputWrapper>
  );
}

const InputWrapper = styled.input`
  position: relative;
  padding: 8px 12px;
  background-color: rgba(0, 0, 0, 0.4);
  border-radius: 4px;
  border: none;
  outline: none;
  box-sizing: border-box;
  -webkit-box-sizing: border-box;
  -moz-box-sizing: border-box;

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
