import React from "react";
import { Scaffold as BoringScaffold } from "@boringso/react-core";
import { BuiltIn_GettingStarted } from "../getting-started/getting-started";
import { useApplicationState } from "@core/app-state";
import { extensions } from "../../app-blocks";
import { DocumentInitial } from "../../../boring/packages/boring-loader";
import {
  BoringContent,
  BoringDocument,
  BoringTitle,
} from "@boring.so/document-model";

export function CurrentPage() {
  const [state] = useApplicationState();
  const page = state.selectedPage;

  // region - temporary static prebuilt-pages router
  if (page == "getting-started") {
    return <BuiltIn_GettingStarted />;
  }
  // endregion - temporary static prebuilt-pages router

  // add routing.
  return (
    <BoringScaffold
      initialDocument={
        new BoringDocument({
          // todo: implement router and load content
          title: new BoringTitle("."),
          content: new BoringContent(""),
        })
      }
      extensions={extensions}
    />
  );
}
