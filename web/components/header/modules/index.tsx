import styled from "@emotion/styled";
import Image from "next/image";
import React from "react";

export function ModuleItem({ label, icon }: { label: string; icon: string }) {
  return (
    <Wrapper>
      <Image width={28} height={28} src={icon} alt={label} />
      <Name>{label}</Name>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  max-width: 210px;
  width: fit-content;
  padding: 8px;
  cursor: pointer;
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 8px;
  box-sizing: border-box;

  :hover {
    background-color: rgba(0, 0, 0, 0.05);
  }

  transition: all 0.1s ease-in-out;
`;

const Name = styled.span`
  color: rgba(0, 0, 0, 0.8);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: Inter, sans-serif;
  font-weight: 600;
  text-align: left;
`;
