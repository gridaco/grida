import React from "react";
import { RemoteDesignSessionCacheStore } from "../../store";

export function ClearRemoteDesignSessionCache(props: { url: string }) {
  const clearCache = () => {
    new RemoteDesignSessionCacheStore({ url: props.url }).clear();
    alert("cleared - " + props.url);
  };

  return (
    <button onClick={clearCache}>
      Clear remote design cache on this design
    </button>
  );
}
