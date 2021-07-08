import React, { useRef, useState } from "react";
import { NodeViewWrapper } from "@boringso/react-core";
import { useAddPage, useDispatch } from "@core/app-state";
import { RemoteSubmitForm } from "../remote-submit-form";
import { TemplateInitial } from "@boring.so/loader";
import { ImportedScreenTemplate } from "../../../built-in-template-pages";
import { figmaloader } from "./figma-loader";
import { DesignImporterLoaderResult } from "./o";
import { analyzeDesignUrl } from "@design-sdk/url-analysis";
export function ImportDesignWithUrl() {
  const addPage = useAddPage();

  const onsubmit = (url: string) => {
    const validurl = analyzeDesignUrl(url) !== "unknown";
    const isFigmaAuthenticated = true; // todo -> add figma authenticator between fetching. user need to authorized grida to access their' design.
    return validurl && isFigmaAuthenticated;
  };

  const onsubmitcomplete = (_, v: DesignImporterLoaderResult) => {
    // create new page
    addPage({
      name: `Screen : ${v.name}`,
      initial: new ImportedScreenTemplate({
        screen: v,
      }),
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
      <RemoteSubmitForm<DesignImporterLoaderResult>
        actionName="Load from Url"
        placeholder="https://figma.com/files/1234/app?node-id=5678"
        onSubmit={onsubmit}
        onSubmitComplete={onsubmitcomplete}
        loader={loader}
      />
    </NodeViewWrapper>
  );
}
