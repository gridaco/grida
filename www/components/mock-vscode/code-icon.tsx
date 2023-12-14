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
          alt="dummy"
        />
      );
    }
    case "react": {
      return (
        <Image
          width={size}
          height={size}
          src={`/assets/platform-icons/react/${color}.png`}
          alt="react"
        />
      );
    }
    case "flutter": {
      return (
        <Image
          width={size}
          height={size}
          src={`/assets/platform-icons/flutter/${color}.png`}
          alt="flutter"
        />
      );
    }
    case "html": {
      return (
        <Image
          width={size}
          height={size}
          src={`/assets/platform-icons/html/${color}.png`}
          alt="html"
        />
      );
    }
    case "css": {
      return (
        <Image
          width={size}
          height={size}
          src={`/assets/platform-icons/css/${color}.png`}
          alt="css"
        />
      );
    }
    case "webcomponents": {
      return (
        <Image
          width={size}
          height={size}
          src={`/assets/platform-icons/webcomponents/${color}.png`}
          alt="webcomponents"
        />
      );
    }
    case "vscode": {
      return (
        <Image
          width={size}
          height={size}
          src={`/assets/platform-icons/vscode/${color}.png`}
          alt="vscode"
        />
      );
    }
    case "figma": {
      return (
        <Image
          width={size}
          height={size}
          src={`/assets/platform-icons/figma/${color}.png`}
          alt="figma"
        />
      );
    }
    case "grida": {
      return (
        <Image
          width={size}
          height={size}
          src={`/assets/platform-icons/grida/${color}.png`}
          alt="grida"
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
      alt="dummy"
    />
  );
}
