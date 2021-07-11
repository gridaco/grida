import React from "react";
import { useRouter } from "next/router";
export function DesignToCodeUniversalPage() {
  const router = useRouter();
  const designParam: string = router.query["design"] as string;
  return <>{"design = " + designParam}</>;
}
