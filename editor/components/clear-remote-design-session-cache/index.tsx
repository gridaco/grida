import React from "react";
import { RemoteDesignSessionCacheStore } from "../../store";

export function ClearRemoteDesignSessionCache(
  props:
    | { url: string }
    | {
        file: string;
        node: string;
      }
) {
  const clearCache = () => {
    new RemoteDesignSessionCacheStore(props).clear();
    alert("cleared - " + JSON.stringify(props));
  };

  return (
    <button onClick={clearCache}>
      Clear remote design cache on this design
    </button>
  );
}
