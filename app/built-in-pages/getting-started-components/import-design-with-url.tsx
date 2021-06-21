import React, { useRef, useState } from "react";
import { NodeViewWrapper } from "@boringso/react-core";
import { useDispatch } from "@core/app-state";
import { RemoteSubmitForm } from "./remote-submit-form";

export function ImportDesignWithUrl() {
  const dispatch = useDispatch();

  const onsubmit = () => {
    // create new page
    dispatch({
      type: "add-page",
      name: "new component",
    });
  };

  const loader = async () => {
    return "";
  };

  return (
    <NodeViewWrapper>
      <RemoteSubmitForm
        actionName="Load from Url"
        placeholder="https://figma.com/files/1234/app?node-id=5678"
        onSubmit={onsubmit}
        loader={loader}
      />
    </NodeViewWrapper>
  );
}
