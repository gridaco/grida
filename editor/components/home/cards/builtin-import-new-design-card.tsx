import { useRouter } from "next/router";
import React from "react";
import { RecentDesignCard } from "./recent-design-card";

const _id = "--new--";
const importnewdesingcarddata = {
  id: _id,
  name: "New Design",
  addedAt: new Date(),
  provider: "unknown",
  previewUrl:
    "https://example-project-manifest.s3.us-west-1.amazonaws.com/app-new/cover.png",
};

export function ImportNewDesignCard() {
  const router = useRouter();
  const onclick = () => {
    router.push("/import");
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
