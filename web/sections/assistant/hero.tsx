import styled from "@emotion/styled";
import React from "react";
import Image from "next/image";
import { FigmaLogoIcon, GitHubLogoIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import herobackground from "../../public/_/assistant/hero-background.png";

const figma_plugin_url =
  "https://www.figma.com/community/plugin/896445082033423994";

const stats_manually_updated = {
  github_stars: 400,
  installs: "8K",
};

export function HeroSection() {
  return (
    <HeroWrapper>
      <div className="background" style={{ width: 1100 }}>
        <Image
          layout="fill"
          src={herobackground}
          placeholder="blur"
          width={1100}
          height={1100}
          objectFit="cover"
          objectPosition="center"
        />
      </div>

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
  overflow: hidden;
  position: relative;
  padding: 240px 40px;
  min-height: 1100px;

  .background {
    z-index: -1;
    -webkit-user-drag: none;
    -khtml-user-drag: none;
    -moz-user-drag: none;
    -o-user-drag: none;
    pointer-events: none;
    user-select: none;
    position: absolute;
    height: 100%;
    overflow: hidden;
  }

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
    <a target="_blank" href={figma_plugin_url}>
      <RootWrapperInstallOnFigmaAsButton>
        <FigmaLogoIcon />
        Install on Figma
      </RootWrapperInstallOnFigmaAsButton>
    </a>
  );
}

const RootWrapperInstallOnFigmaAsButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

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
      <Link target="_blank" href="https://github.com/gridaco/assistant">
        <Item>
          <GitHubLogoIcon />
          <Label>{stats_manually_updated.github_stars} Stars</Label>
        </Item>
      </Link>
      <Link
        target="_blank"
        href="https://www.figma.com/community/plugin/896445082033423994/"
      >
        <Item>
          <FigmaLogoIcon />
          <Label>{stats_manually_updated.installs} Installs</Label>
        </Item>
      </Link>
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
  cursor: pointer;
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
