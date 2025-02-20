import React from "react";

const _resting_color = "#787878";

export function EditorAppbarIconButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return <div onClick={onClick}>{children}</div>;
}
