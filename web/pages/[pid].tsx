import React from "react";
import { useRouter } from "next/router";

export default function Page() {
  const router = useRouter();
  return <>{JSON.stringify(router.query)}</>;
}
