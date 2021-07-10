import React, { useRef, useState } from "react";
import { NodeViewWrapper } from "@boringso/react-core";
import { useAddPage, useDispatch } from "@core/app-state";
import { RemoteSubmitForm } from "../remote-submit-form";
import { ImportedScreenTemplate } from "../../../built-in-template-pages";
import { figmaloader } from "./figma-loader";
import { DesignImporterLoaderResult } from "./o";
import { analyzeDesignUrl } from "@design-sdk/url-analysis";
import { flutter, react, token } from "@designto/code";

// temporary image repository setup.
import { MainImageRepository } from "@design-sdk/core/assets-repository";
import { ImageRepositories } from "@design-sdk/figma/asset-repository";
// temporary image repository setup.

MainImageRepository.instance = new ImageRepositories();

export function ImportDesignWithUrl() {
  const addPage = useAddPage();

  const onsubmit = (url: string) => {
    const validurl = analyzeDesignUrl(url) !== "unknown";
    const isFigmaAuthenticated = true; // todo -> add figma authenticator between fetching. user need to authorized grida to access their' design.
    return validurl && isFigmaAuthenticated;
  };

  const onsubmitcomplete = (_, v: DesignImporterLoaderResult) => {
    const _design = v;
    const _token = token.tokenize(v.node);
    const _flutterwidget = flutter.buildApp(v.node);
    const _reactwidget = react.buildReactWidget(_token);
    const _reactapp = react.buildReactApp(_reactwidget, {
      template: "cra",
    });
    const _code = {
      flutter: {
        raw: _flutterwidget.widget.build().finalize(),
      },
      react: {
        raw: _reactapp.code,
      },
    };
    const template = new ImportedScreenTemplate({
      screen: {
        name: v.name,
        design: _design,
        code: _code,
      },
    });
    // create new page
    addPage({
      name: `Screen : ${v.name}`,
      initial: template,
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
