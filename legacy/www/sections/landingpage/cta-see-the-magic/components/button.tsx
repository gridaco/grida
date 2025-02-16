import styled from "@emotion/styled";
import Image from "next/image";
import React from "react";

import { breakpoints } from "sections/landingpage/_breakpoints";

export function MagicButton({ onClick }: { onClick?: () => void }) {
  return (
    <Button onClick={onClick}>
      <Texts>
        <Image
          width={46}
          height={46}
          src="/assets/magic-wond-emoji.png"
          alt="image of EmojiWond"
        />
      </Texts>
    </Button>
  );
}

const Button = styled.button`
  cursor: pointer;
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: center;
  flex: none;
  align-self: stretch;
  gap: 10px;
  box-shadow: 0px 4px 48px rgba(0, 0, 0, 0.12);
  border: solid 1px rgba(210, 210, 210, 1);
  border-radius: 4px;
  height: 83px;
  background-color: rgba(0, 0, 0, 1);
  box-sizing: border-box;
  padding: 12px 12px;
  :hover {
    opacity: 0.8;
  }

  @media ${breakpoints.xl} {
    width: 200px;
  }
  @media ${breakpoints.lg} {
    width: 200px;
  }
  @media ${breakpoints.md} {
    width: 200px;
  }
  @media ${breakpoints.sm} {
    width: 200px;
  }
  @media ${breakpoints.xs} {
  }
`;

const Texts = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 8px;
  width: 191px;
  height: 46px;
  box-sizing: border-box;
`;
