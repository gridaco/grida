import styled from "@emotion/styled";
import { LinkWithDocsFallback } from "components/fixme";
import React from "react";

export function LineItem({ label, href }: { label: string; href: string }) {
  return (
    <LinkWithDocsFallback href={href}>
      <Label>{label}</Label>
    </LinkWithDocsFallback>
  );
}

const Label = styled.label`
  cursor: pointer;
  color: rgba(0, 0, 0, 0.7);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: Inter, sans-serif;
  font-weight: 600;
  max-width: 200px;
  padding: 12px;
  border-radius: 4px;

  :hover {
    background-color: rgba(0, 0, 0, 0.03);
  }

  transition: all 0.1s ease-in-out;
`;
