import React from "react";
import { useRouter } from "next/router";

export default function SceneScreen() {
  const router = useRouter();
  console.log(router.query.sid);

  return <>Hi?</>;
}
