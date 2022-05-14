import React from "react";
import styled from "@emotion/styled";
import { TableTabItem } from "@app/blocks/table-tab-item";

const tabs = [
  {
    id: "index",
    label: "Design",
  },
  {
    id: "connect",
    label: "Connect",
  },
  {
    id: "developer",
    label: "Developer",
  },
  {
    id: "share",
    label: "Share",
  },
  {
    id: "results",
    label: "Results",
  },
];

export default function FormDesignPage() {
  const [tab, setTab] = React.useState("index");

  return (
    <>
      <Tabs>
        {tabs.map((t) => (
          <TableTabItem
            key={t.id}
            selected={tab === t.id}
            onClick={() => {
              setTab(t.id);
            }}
          >
            {t.label}
          </TableTabItem>
        ))}
      </Tabs>
    </>
  );
}

const Tabs = styled.div`
  height: 60px;
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  gap: 21px;
  align-self: stretch;
  box-sizing: border-box;
  flex-shrink: 0;
`;
