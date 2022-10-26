import { InspectorSection } from "components/inspector";
import { useTargetContainer } from "hooks/use-target-node";
import React from "react";

export function AssetsSection() {
  // if the node itself is exportable
  // if the node has a complex gradient which is more effective to use asset than style code
  // if the node has a image fill

  const { target } = useTargetContainer();
  if (!(target?.images?.length > 0)) {
    return <></>;
  }

  return (
    <InspectorSection label="Assets" borderTop>
      {target.images.map((img) => (
        <Preview src={"https://via.placeholder.com/150"} />
      ))}
    </InspectorSection>
  );
}

function Preview({ src }: { src: string }) {
  return (
    <div
      style={{
        background: "grey",
        width: 100,
        height: 100,
      }}
    >
      <img
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
        }}
        src={src}
      />
    </div>
  );
}
