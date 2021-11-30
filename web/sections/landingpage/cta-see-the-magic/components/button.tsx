import styled from "@emotion/styled";
import React from "react";

import { breakpoints } from "sections/landingpage/_breakpoints";

export function MagicButton() {
  return (
    <Button>
      <Texts>
        <EmojiWond
          src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/4341/1554/128f94840d219df83cb481ca2ddd4a50"
          alt="image of EmojiWond"
        ></EmojiWond>
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

const EmojiWond = styled.img`
  width: 46px;
  height: 46px;
  object-fit: cover;
`;

const Label = styled.span`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 24px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 500;
  letter-spacing: -1px;
  line-height: 98%;
  text-align: left;
`;
