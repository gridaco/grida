import React from "react";
import { RecentDesignCard } from "./recent-design-card";
import moment from "moment";
import router from "next/router";
import { formToCodeUrl } from "../../../url";

const _id =
  "https://www.figma.com/file/x7RRK6RwWtZuNakmbMLTVH/examples?node-id=1%3A120";
const defaultdemodesign = {
  id: _id,
  name: "WNV Main screen",
  provider: "figma",
  addedAt: moment().toDate(),
  lastUpdatedAt: moment().toDate(),
  previewUrl:
    "https://example-project-manifest.s3.us-west-1.amazonaws.com/app-wnv/cover.png",
};

export function BuiltinDemoFileCard() {
  const onclick = () => {
    const _path = formToCodeUrl({
      design: _id,
    });
    router.push(_path);
  };
  return (
    <>
      <RecentDesignCard key={_id} onclick={onclick} data={defaultdemodesign} />
    </>
  );
}
