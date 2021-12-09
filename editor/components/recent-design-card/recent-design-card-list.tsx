import styled from "@emotion/styled";
import router from "next/router";
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

  const oncardclick = (id: string, d: RecentDesign) => {
    console.log("click", id);
    router.push(`/to-code/${id}`); // fixme id is not a param
    //
  };

  return (
    <ListWrap>
      <ImportNewDesignCard />
      <BuiltinDemoDesignCard />
      {recents.map((recentDesign) => {
        return (
          <RecentDesignCard
            key={recentDesign.id}
            data={recentDesign}
            onclick={oncardclick}
          />
        );
      })}
    </ListWrap>
  );
}

const ListWrap = styled.div`
  display: flex;
  flex-direction: row;
  gap: 20px;
`;
