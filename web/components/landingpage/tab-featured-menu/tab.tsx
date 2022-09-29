import styled from "@emotion/styled";
import React from "react";

import { CodeIcon, NamedCodeIcons } from "components/mock-vscode/code-icon";

export function FeaturedMenuTab({
  title = "Title",
  theme = "light",
  selected = false,
  icon,
  iconsize,
  onClick,
}: {
  theme?: "light" | "dark";
  title?: string;
  selected?: boolean;
  icon?: NamedCodeIcons;
  iconsize?: number;
  onClick?: () => void;
}) {
  return (
    <RootWrapperBaseTabFeaturedMenu
      onClick={onClick}
      _theme={theme}
      border={BaseTheme[selected ? "selected" : "default"]["border"][theme]}
      background={
        BaseTheme[selected ? "selected" : "default"]["background"][theme]
      }
      shadow={BaseTheme[selected ? "selected" : "default"]["shadow"][theme]}
    >
      <Contents>
        <CodeIcon
          size={iconsize}
          icon={icon}
          color={selected ? "default" : "grey"}
        />
        <Title color={TitleTheme[selected ? "selected" : "default"][theme]}>
          {title}
        </Title>
      </Contents>
    </RootWrapperBaseTabFeaturedMenu>
  );
}

const BaseTheme = {
  default: {
    background: {
      light: "#FFFFFF",
      dark: "#303234",
    },
    shadow: {
      dark: null,
      light: null,
    },
    border: {
      light: null,
      dark: null,
    },
  },
  selected: {
    shadow: {
      light: "0px 4px 32px rgba(0, 0, 0, 0.04)",
      dark: "0px 4px 32px rgba(0, 0, 0, 0.04)",
    },
    background: {
      light: "#FAFAFA",
      dark: "#2E2E2E",
    },
    border: {
      light: "#F1F1F1",
      dark: "#3A3A3A",
    },
  },
};

const TitleTheme = {
  default: {
    light: "#878787",
    dark: "#878787",
  },
  selected: {
    light: "#878787",
    dark: "#F3F3F3",
  },
};

const RootWrapperBaseTabFeaturedMenu = styled.div<{
  _theme: string;
  background: string;
  shadow: string;
  border: string;
}>`
  cursor: pointer;
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 10px;
  border-radius: 4px;
  background-color: ${p => p.background};
  box-sizing: border-box;
  padding: 16px 21px;
  box-shadow: ${p => p.shadow};
  border: ${p => p.border && `1px solid ${p.border}`};
  :hover {
    background-color: ${p => BaseTheme.selected.background[p._theme]};
    box-shadow: ${p => BaseTheme.selected.background[p._theme]};
  }
`;

const Contents = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: 1;
  gap: 16px;
  align-self: stretch;
  box-sizing: border-box;
`;

const LeadingIcon = styled.div`
  width: 32px;
  height: 32px;
`;

const Title = styled.span<{ color: string }>`
  color: ${p => p.color};
  text-overflow: ellipsis;
  font-size: 21px;
  font-family: "Inter", sans-serif;
  font-weight: 400;
  line-height: 160%;
  text-align: left;
`;
