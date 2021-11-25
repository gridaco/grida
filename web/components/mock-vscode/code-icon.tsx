import React from "react";

export type NamedCodeIcons = "dummy" | "react" | "flutter" | "html";

export function CodeIcon({
  icon = "dummy",
  size = 14,
  color = "origin",
}: {
  icon?: NamedCodeIcons;
  size?: number;
  color?: "origin" | "grey";
}) {
  switch (icon) {
    case "dummy": {
      return <></>;
    }
    case "react": {
      return <></>;
    }
    case "flutter": {
      return <></>;
    }
    case "html": {
      return <></>;
    }
  }
  return <></>;
}
