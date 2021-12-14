import React from "react";
import moment from "moment";
import router from "next/router";
import { formToCodeUrl } from "../../../url";
import { FileCard } from "./card-variant-file";

const _id =
  "https://www.figma.com/file/x7RRK6RwWtZuNakmbMLTVH/examples?node-id=1%3A120";
const defaultdemodesign = {
  type: "file" as "file",
  key: "x7RRK6RwWtZuNakmbMLTVH",
  name: "WNV Main screen",
  provider: "figma",
  lastUsed: moment().toDate(),
  lastUpdatedAt: moment().toDate(),
  thumbnailUrl:
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
      <FileCard key={_id} onClick={onclick} data={defaultdemodesign} />
    </>
  );
}
