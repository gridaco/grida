import React, { useRef, useState } from "react";
import { NodeViewWrapper } from "@boringso/react-core";
import { useAddPage, useDispatch } from "@core/app-state";
import { RemoteSubmitForm } from "./remote-submit-form";
import { TemplateInitial } from "@boring.so/loader";

export function ImportDesignWithUrl() {
  const addPage = useAddPage();

  const onsubmit = () => {
    // create new page
    addPage({
      name: "new component",
      initial: new TemplateInitial(),
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
