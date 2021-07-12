import React from "react";
import { RecentDesign } from "../../store/recent-designs-store";
import { RecentDesignCard } from "./recent-design-card";

const _id = "--new--";
const importnewdesingcarddata: RecentDesign = {
  id: _id,
  name: "New Design",
  lastUpdatedAt: new Date(),
  addedAt: new Date(),
  provider: "unknown",
  previewUrl:
    "https://example-project-manifest.s3.us-west-1.amazonaws.com/app-new/cover.png",
};

export function ImportNewDesignCard() {
  const onclick = () => {
    // TODO: import design
  };

  return (
    <>
      <RecentDesignCard
        key={_id}
        onclick={onclick}
        data={importnewdesingcarddata}
      />
    </>
  );
}
