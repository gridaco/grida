import React from "react";
import styled from "@emotion/styled";

export function RoundPrimaryButton({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  theme?: {
    backgroundColor?: React.CSSProperties["color"];
    borderRadius?: React.CSSProperties["borderRadius"];
  };
}) {
  return (
    <PrimaryButton disabled={disabled} onClick={onClick}>
      {children}
    </PrimaryButton>
  );
}

const PrimaryButton = styled.button<{
  backgroundColor?: React.CSSProperties["color"];
  borderRadius?: React.CSSProperties["borderRadius"];
}>`
  cursor: pointer;
  border: none;
  outline: none;
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  height: 32px;
  /* background-color: ${(props) =>
    props.backgroundColor ?? "rgb(35, 77, 255)"};
  border-radius: ${(props) => props.borderRadius ?? "20px"}; */
  background-color: ${(props) =>
    /* @ts-ignore */
    props.theme?.app_posts_cms?.colors?.button_primary ?? "rgb(35, 77, 255)"};
  border-radius: 20px;
  box-sizing: border-box;
  padding: 0px 12px;
  color: white;
  text-overflow: ellipsis;
  font-size: 13px;
  font-family: Inter, sans-serif;
  font-weight: 400;
  text-align: left;

  :hover {
    opacity: 0.8;
  }

  :disabled {
    opacity: 0.5;
  }

  :active {
    opacity: 1;
  }

  :focus {
  }
  transition: opacity 0.2s ease-in-out;
`;
