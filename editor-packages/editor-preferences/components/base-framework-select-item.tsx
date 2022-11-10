import React from "react";
import styled from "@emotion/styled";
import { config } from "@grida/builder-config";
import {
  ExpoIcon,
  FlutterIcon,
  Html5Icon,
  ReactIcon,
  SolidJsIcon,
} from "@code-editor/module-icons";

type BaseFramework = config.FrameworkConfig["framework"];

export function BaseFrameworkSelectItem({
  framework,
  selected,
  onClick,
}: {
  framework: BaseFramework;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <SelectWrapper data-selected={selected} onClick={onClick}>
      <IconContainer data-selected={selected}>
        <FrameworkIcon type={framework} />
      </IconContainer>
      <Label>{frameworkdisplaynamemap[framework]}</Label>
    </SelectWrapper>
  );
}

function FrameworkIcon({ type }: { type: BaseFramework }) {
  const props = {
    size: 36,
    color: "white",
  };
  switch (type) {
    case "flutter":
      return <FlutterIcon {...props} />;
    case "react":
      return <ReactIcon {...props} />;
    case "vanilla":
      return <Html5Icon {...props} />;
    case "react-native":
      return <ExpoIcon {...props} />;
    case "solid-js":
      return <SolidJsIcon {...props} color="white" />;
    default:
      return <></>;
  }
}

const frameworkdisplaynamemap = {
  react: "React",
  "react-native": "React Native",
  flutter: "Flutter",
  "solid-js": "Solid.js",
  vanilla: "Vanilla",
} as const;

const SelectWrapper = styled.div`
  cursor: pointer;
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  flex: none;
  gap: 6px;
  box-sizing: border-box;

  &[data-selected="true"] {
    opacity: 1;
  }

  &[data-selected="false"] {
    opacity: 0.5;
  }

  &:hover {
    opacity: 0.8;
  }

  transition: all 0.2s ease-in-out;
`;

const IconContainer = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 10px;
  border-radius: 8px;
  background-color: black;
  box-sizing: border-box;
  padding: 20px;

  &[data-selected="true"] {
    outline: solid 1px white;
    box-shadow: 0px 4px 24px 0px rgba(0, 0, 0, 0.2);
  }

  &[data-selected="false"] {
    outline: none;
    box-shadow: none;
  }
`;

const Label = styled.span`
  color: white;
  text-overflow: ellipsis;
  font-size: 12px;
  font-family: Inter, sans-serif;
  font-weight: 400;
  text-align: left;
`;
