import styled from "@emotion/styled";
import React from "react";

export function HeroPrimaryInput({
  onChange,
}: {
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <RootWrapperHeroPrimaryInput
      onChange={onChange}
      placeholder="Enter your Figma design url"
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
