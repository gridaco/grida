import React from "react";
import { useRouter } from "next/router";
import { designToCode } from "@designto/code";
import { useDesign } from "../../query/to-code";

export default function DesignToCodeUniversalPage() {
  const design = useDesign();
  if (!design) {
    return <>Loading..</>;
  }

  designToCode(design); // fixme
  return <>{"design = " + design}</>;
}
