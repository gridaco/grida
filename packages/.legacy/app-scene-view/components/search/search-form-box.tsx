import React, { useRef } from "react";
import styled from "@emotion/styled";

import IconButton from "../icon-button";

interface ISearchFormBox extends React.InputHTMLAttributes<HTMLInputElement> {
  containerStyle?: React.CSSProperties;
  placeholder?: string;
}

export default function SearchFormBox({
  containerStyle,
  placeholder = "Search here screen",
  ...inputProps
}: ISearchFormBox) {
  const inputRef = useRef<HTMLInputElement>(null);

  const onClickInputWrapper = () => inputRef?.current?.focus();

  return (
    <Form>
      <InputWrapper style={containerStyle} onClick={onClickInputWrapper}>
        <Input
          ref={inputRef}
          placeholder={placeholder}
          aria-label={placeholder}
          {...inputProps}
        />
        <IconButton type="submit" aria-label="search">
          <IconImage src="/assets/icons/mdi_search.svg" />
        </IconButton>
      </InputWrapper>
    </Form>
  );
}

const Form = styled.form``;

const InputWrapper = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  margin: 0 auto;
  border-radius: 8px;
  padding: 12px 16px;
  /* padding: 14px 16px; */
  width: 400px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const Input = styled.input`
  border: 0;
  background-color: transparent;
  font-weight: 500;
  font-size: 14px;
  line-height: 1.14;
  display: flex;
  align-items: center;
  flex: 1;

  &::placeholder {
    color: #cbcbcb;
  }

  &:active,
  &:focus {
    outline: 0;
  }
`;

const IconImage = styled.img`
  width: 24px;
  height: 24px;
`;
