import React from "react";
export * from "./scaling-container";
export * from "./scaling-content-iframe";

import { ScalingContent, ScalingContentProps } from "./scaling-container";

type VanillaPreviewProps = ScalingContentProps;

function VanillaPreview(props: VanillaPreviewProps) {
  switch (props.type) {
    case "scaling":
      return <ScalingContent {...props} />;
  }
}

export { ScalingContent as ScalingVanillaPreview };
export default VanillaPreview;
