import React, { useRef, useState } from "react";
import { NodeViewWrapper } from "@boringso/react-core";
import { useAddPage, useDispatch } from "@core/app-state";
import { RemoteSubmitForm } from "../remote-submit-form";
import { ImportedScreenTemplate } from "../../../built-in-template-pages";
import { figmaloader } from "./figma-loader";
import { DesignImporterLoaderResult } from "./o";
import { analyzeDesignUrl } from "@design-sdk/url-analysis";
import { designToCode } from "@designto/code";
import { input } from "@designto/config";
import { hasLinkedFigmaAccount } from "@app/fapi/accounts/linked-accounts";
import { show_dialog_import_figma_design_after_authentication } from "../../../modals/import-figma-design-after-authentication";

export function ImportDesignWithUrl() {
  const addPage = useAddPage();

  /** pass if design url is defined and parsable (recognized as one of the supported platforms) */
  const validation = (url: string) => analyzeDesignUrl(url) !== "unknown";

  const onsubmitcomplete = async (_, v: DesignImporterLoaderResult) => {
    const _design = v;
    const _res_flutter = designToCode(
      input.DesignInput.fromDesign(_design.node),
      {
        framework: "flutter",
      }
    );

    const _res_react = designToCode(
      input.DesignInput.fromDesign(_design.node),
      {
        framework: "react",
      }
    );

    const _code = {
      flutter: {
        raw: _res_flutter.code.raw,
      },
      react: {
        raw: _res_react.code.raw,
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
        const cancontinue = await hasLinkedFigmaAccount();
        if (cancontinue) {
          // load the design
        } else {
          const explicitfigmaauthentication =
            await show_dialog_import_figma_design_after_authentication();
          // const explicitfigmaauthentication = await showDialog(
          //   undefined
          // );
          console.log(
            "explicitfigmaauthentication",
            explicitfigmaauthentication
          );
        }
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
        validation={validation}
        onSubmitComplete={onsubmitcomplete}
        loader={loader}
      />
    </NodeViewWrapper>
  );
}
