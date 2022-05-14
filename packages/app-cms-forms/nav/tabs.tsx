import React from "react";
import styled from "@emotion/styled";
import { TableTabItem } from "@app/blocks/table-tab-item";
import { useRouter } from "next/router";

const tabs: { id: TabType; label: string }[] = [
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

type TabType = "index" | "connect" | "developer" | "share" | "results";

export function FormsDetailNavigationTabs({
  initial,
  onClick,
  badges,
}: {
  initial: TabType;
  onClick?: (tab: TabType) => void;
  badges?: {
    results?: string;
  };
}) {
  const router = useRouter();
  const { id } = router.query;
  const [tab, setTab] = React.useState<TabType>(initial);

  const handleClick = (tab: TabType) => {
    setTab(tab);
    if (onClick) {
      onClick(tab);
    } else {
      if (tab === "index") {
        router.push(`/forms/${id}`);
      } else {
        router.push(`/forms/${id}/${tab}`);
      }
    }
  };

  return (
    <>
      <TabsBase>
        {tabs.map((t) => (
          <TableTabItem
            key={t.id}
            selected={tab === t.id}
            badge={badges?.[t.id]}
            onClick={() => {
              handleClick(t.id);
            }}
          >
            {t.label}
          </TableTabItem>
        ))}
      </TabsBase>
    </>
  );
}

const TabsBase = styled.div`
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
