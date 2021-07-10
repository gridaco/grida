import React from "react";
import { RecentDesign } from "../../store";
import { RecentDesignCard } from "./recent-design-card";
import moment from "moment";

const defaultdemodesign: RecentDesign = {
  id: "demo/1",
  name: "WNV Main screen",
  provider: "figma",
  addedAt: moment("2021-01-01T00:00:00.000Z").toDate(),
  lastUpdatedAt: moment("2021-01-01T00:00:00.000Z").toDate(),
  previewUrl: "",
};

export function BuiltinDemoDesignCard() {
  return (
    <>
      <RecentDesignCard data={defaultdemodesign} />
    </>
  );
}
