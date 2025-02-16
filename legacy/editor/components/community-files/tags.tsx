import React from "react";
import styled from "@emotion/styled";
import Link from "next/link";

export function Tag({ children }: { children: string }) {
  return (
    <Link
      href={{
        pathname: "/community/tag/[tag]/files",
        query: { tag: children },
      }}
    >
      <TagWrapper>
        <span>{children}</span>
      </TagWrapper>
    </Link>
  );
}

const TagWrapper = styled.div`
  display: inline-block;
  padding: 4px 8px;
  font-size: 14px;
  color: rgba(0, 0, 0, 0.8);
  font-weight: 500;
  border-radius: 4px;
  background: transparent;
  border: 1px solid rgba(0, 0, 0, 0.2);
  cursor: pointer;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
  }

  transition: all 0.1s ease-in-out;
`;
