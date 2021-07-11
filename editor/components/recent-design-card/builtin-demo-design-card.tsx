import React from "react";
import { RecentDesign } from "../../store";
import { RecentDesignCard } from "./recent-design-card";
import moment from "moment";
import router from "next/router";

const _id = "demo/1";
const defaultdemodesign: RecentDesign = {
  id: _id,
  name: "WNV Main screen",
  provider: "figma",
  addedAt: moment("2021-01-01T00:00:00.000Z").toDate(),
  lastUpdatedAt: moment("2021-01-01T00:00:00.000Z").toDate(),
  previewUrl: "",
};

export function BuiltinDemoDesignCard() {
  const onclick = () => {
    router.push("/to-code");
  };
  return (
    <>
      <RecentDesignCard key={_id} onclick={onclick} data={defaultdemodesign} />
    </>
  );
}
