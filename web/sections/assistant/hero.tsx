import styled from "@emotion/styled";
import React from "react";
import { FigmaLogoIcon, GitHubLogoIcon } from "@radix-ui/react-icons";

export function HeroSection() {
  return (
    <HeroWrapper>
      <span className="scribble">Early Access</span>
      <h1>
        Your Figma
        <br />
        Assistant
      </h1>
      <h6>Your AI powered Design Assistant</h6>

      <InstallOnFigmaAsButton />
      <span style={{ height: 32 }} />
      <Stats />
    </HeroWrapper>
  );
}

const HeroWrapper = styled.div`
  padding: 240px 40px;

  /* tmp */
  background-color: black;

  color: white !important;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;

  .scribble {
    font-size: 32px;
    font-family: Caveat, sans-serif;
    font-weight: 700;
    line-height: 96%;
  }

  h1 {
    font-size: 64px;
    font-family: Inter, sans-serif;
    font-weight: 800;
    line-height: 96%;
    text-align: center;
  }

  h6 {
    font-size: 18px;
    font-family: Inter, sans-serif;
    font-weight: 500;
    line-height: 96%;
  }
`;

function InstallOnFigmaAsButton() {
  return (
    <RootWrapperInstallOnFigmaAsButton>
      Install on Figma
    </RootWrapperInstallOnFigmaAsButton>
  );
}

const RootWrapperInstallOnFigmaAsButton = styled.button`
  box-shadow: 0px 4px 16px 0px rgba(0, 0, 0, 0.04);
  background-color: rgba(255, 255, 255, 0.1);
  border: solid 1px white;
  border-radius: 4px;
  padding: 10px;
  color: white;
  font-size: 15px;
  font-family: Inter, sans-serif;
  font-weight: 500;
  outline: none;
  cursor: pointer;

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
`;

function Stats() {
  return (
    <RootWrapperStats>
      <Item>
        <GitHubLogoIcon />
        <Label>430 Stars</Label>
      </Item>
      <Item>
        <FigmaLogoIcon />
        <Label>10K Installs</Label>
      </Item>
    </RootWrapperStats>
  );
}

const RootWrapperStats = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: flex-start;
  flex: none;
  gap: 28px;
  box-sizing: border-box;
`;

const Item = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 8px;
  box-sizing: border-box;
`;

const Label = styled.span`
  color: white;
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: Inter, sans-serif;
  font-weight: 400;
  text-align: center;
`;
