import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";

export default function SceneScreen(props: {
  //
}) {
  useEffect(() => {
    //
  });
  console.log(props);
  const router = useRouter();
  console.log(router.query.sid);

  return <>Hi?</>;
}
