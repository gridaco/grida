import React from "react";
import { RecentDesignCard } from "./recent-design-card";
export function ImportNewDesignCard() {
  return (
    <>
      <RecentDesignCard
        data={{
          id: "--new--",
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
