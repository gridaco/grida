import React from "react";
import { RecentDesignCard } from "./recent-design-card";

const _id = "--new--";
export function ImportNewDesignCard() {
  const onclick = () => {
    // TODO: import design
  };

  return (
    <>
      <RecentDesignCard
        key={_id}
        onclick={onclick}
        data={{
          id: _id,
          name: "New Design",
          lastUpdatedAt: new Date(),
          addedAt: new Date(),
          provider: "unknown",
          previewUrl: "",
        }}
      />
    </>
  );
}
