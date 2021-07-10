import React, { useEffect, useState } from "react";
import { RecentDesignsStore, RecentDesign } from "../../store";
import { RecentDesignCard } from "./recent-design-card";

export function RecentDesignCardList() {
  const [recents, setRecents] = useState<RecentDesign[]>();
  useEffect(() => {
    const _loads = new RecentDesignsStore().load();
    setRecents(_loads);
  }, []);
  return (
    <>
      {recents.map((recentDesign) => {
        return <RecentDesignCard key={recentDesign.id} data={recentDesign} />;
      })}
    </>
  );
}
