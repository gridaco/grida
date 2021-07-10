import styled from "@emotion/styled";
import React, { useEffect, useState } from "react";
import { RecentDesignsStore, RecentDesign } from "../../store";
import { BuiltinDemoDesignCard } from "./builtin-demo-design-card";
import { ImportNewDesignCard } from "./import-new-design-card";
import { RecentDesignCard } from "./recent-design-card";

export function RecentDesignCardList() {
  const [recents, setRecents] = useState<RecentDesign[]>([]);
  useEffect(() => {
    const _loads = new RecentDesignsStore().load();
    setRecents(_loads);
  }, []);
  return (
    <ListWrap>
      <ImportNewDesignCard />
      <BuiltinDemoDesignCard />
      {recents.map((recentDesign) => {
        return <RecentDesignCard key={recentDesign.id} data={recentDesign} />;
      })}
    </ListWrap>
  );
}

const ListWrap = styled.div`
  display: flex;
  flex-direction: row;
`;
