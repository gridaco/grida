import React from "react";

interface ProviderAnySnapshotViewProps {
  /**
   * snapshot image file uri
   */
  snapshot: string;
}

export function ProviderAnySnapshotView(props: ProviderAnySnapshotViewProps) {
  return (
    <>
      <img src={props.snapshot} />
    </>
  );
}
