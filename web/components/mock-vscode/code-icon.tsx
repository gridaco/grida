import Image from "next/image";
import React from "react";

export type NamedCodeIcons =
  | "empty"
  | "grida"
  | "dummy"
  | "react"
  | "flutter"
  | "html"
  | "css"
  | "figma"
  | "webcomponents"
  | "vscode"
  | "figma";

export function CodeIcon({
  icon = "dummy",
  size = 14,
  color = "default",
}: {
  icon?: NamedCodeIcons;
  size?: number;
  color?: "default" | "grey" | "white";
}) {
  switch (icon) {
    case "dummy": {
      return (
        <Image
          width={size}
          height={size}
          src="/assets/platform-icons/dummy/default.png"
        />
      );
    }
    case "react": {
      return (
        <Image
          width={size}
          height={size}
          src={`/assets/platform-icons/react/${color}.png`}
        />
      );
    }
    case "flutter": {
      return (
        <Image
          width={size}
          height={size}
          src={`/assets/platform-icons/flutter/${color}.png`}
        />
      );
    }
    case "html": {
      return (
        <Image
          width={size}
          height={size}
          src={`/assets/platform-icons/html/${color}.png`}
        />
      );
    }
    case "css": {
      return (
        <Image
          width={size}
          height={size}
          src={`/assets/platform-icons/css/${color}.png`}
        />
      );
    }
    case "webcomponents": {
      return (
        <Image
          width={size}
          height={size}
          src={`/assets/platform-icons/webcomponents/${color}.png`}
        />
      );
    }
    case "vscode": {
      return (
        <Image
          width={size}
          height={size}
          src={`/assets/platform-icons/vscode/${color}.png`}
        />
      );
    }
    case "figma": {
      return (
        <Image
          width={size}
          height={size}
          src={`/assets/platform-icons/figma/${color}.png`}
        />
      );
    }
    case "grida": {
      return (
        <Image
          width={size}
          height={size}
          src={`/assets/platform-icons/grida/${color}.png`}
        />
      );
    }
    case "empty":
    default: {
      return <></>;
    }
  }

  // return dummy
  return (
    <Image
      width={size}
      height={size}
      src="/assets/platform-icons/dummy/default.png"
    />
  );
}
