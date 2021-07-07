import React, { useRef, useState } from "react";
import { NodeViewWrapper } from "@boringso/react-core";
import { useAddPage, useDispatch } from "@core/app-state";
import { RemoteSubmitForm } from "../remote-submit-form";
import { TemplateInitial } from "@boring.so/loader";
import { ImportedScreenTemplate } from "../../../built-in-template-pages";
import { figmaloader } from "./figma-loader";
import { LoaderResult } from "./o";
import { analyzeDesignUrl } from "@design-sdk/url-analysis";
export function ImportDesignWithUrl() {
  const addPage = useAddPage();

  const onsubmit = (url: string) => {
    // skip
  };

  const onsubmitcomplete = (url: string, v: LoaderResult) => {
    // create new page
    addPage({
      name: `Screen : ${v.name}`,
      initial: new ImportedScreenTemplate(),
    });
  };

  const loader = async (url: string) => {
    switch (analyzeDesignUrl(url)) {
      case "figma":
        return await figmaloader(url);
      default:
        throw "not ready";
    }
  };

  return (
    <NodeViewWrapper>
      <RemoteSubmitForm<LoaderResult>
        actionName="Load from Url"
        placeholder="https://figma.com/files/1234/app?node-id=5678"
        onSubmit={onsubmit}
        onSubmitComplete={onsubmitcomplete}
        loader={loader}
      />
    </NodeViewWrapper>
  );
}
