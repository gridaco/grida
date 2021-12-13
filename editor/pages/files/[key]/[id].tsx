import { useRouter } from "next/router";
import React from "react";
import { Editor } from "scaffolds/editor";

export default function FileEntryEditor() {
  const router = useRouter();
  const { key, id } = router.query;

  // 1. validate the file
  // 2. set up the editor
  // return <Editor />;
  return <></>;
}
