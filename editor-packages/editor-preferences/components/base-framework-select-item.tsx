import React from "react";
import { config } from "@grida/builder-config";
import {
  ExpoIcon,
  FlutterIcon,
  Html5Icon,
  ReactIcon,
  SolidJsIcon,
} from "@code-editor/module-icons";
import { SelectItemCard } from "./select-item-card";

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
    <SelectItemCard selected={selected} onClick={onClick}>
      <div className="preview-container">
        <FrameworkIcon type={framework} />
      </div>
      <label>{frameworkdisplaynamemap[framework]}</label>
    </SelectItemCard>
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
