import { useRouter } from "next/router";
import React from "react";
import { FileCard } from "./card-variant-file";

const _id = "--new--";
const importnewdesingcarddata = {
  type: "file" as "file",
  key: _id,
  name: "New Design",
  thumbnailUrl:
    "https://example-project-manifest.s3.us-west-1.amazonaws.com/app-new/cover.png",
};

export function ImportNewDesignCard() {
  const router = useRouter();
  const onclick = () => {
    // router.push("/import");
    router.push("https://grida.co");
  };

  return (
    <>
      <FileCard key={_id} onClick={onclick} data={importnewdesingcarddata} />
    </>
  );
}
