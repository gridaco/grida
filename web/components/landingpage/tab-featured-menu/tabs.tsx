import styled from "@emotion/styled";
import React, { useState } from "react";

import { NamedCodeIcons } from "components/mock-vscode/code-icon";

import { FeaturedMenuTab } from "./tab";

export function Tabs({
  theme = "light",
  gap = 27,
  tabs = [],
  initialSelection,
}: {
  theme?: "light" | "dark";
  gap?: number;
  initialSelection?: string;
  tabs: { id: string; title: string; icon: NamedCodeIcons }[];
}) {
  const [selection, setSelection] = useState<string>(
    initialSelection ?? tabs[0]?.id,
  );

  const onClick = (id: string) => {
    setSelection(id);
  };

  return (
    <Switches gap={gap}>
      {tabs.map(({ id, title, icon }) => {
        return (
          <FeaturedMenuTab
            onClick={() => {
              onClick(id);
            }}
            key={id}
            icon={icon}
            title={title}
            theme={theme}
            selected={id == selection}
          />
        );
      })}
    </Switches>
  );
}

const Switches = styled.div<{ gap: number }>`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: stretch;
  align-self: stretch;
  flex: none;
  gap: ${p => p.gap}px;
  box-sizing: border-box;
`;
