import React from "react";
import { BoringScaffold } from "../../boring-scaffold";
import { BuiltIn_GettingStarted } from "../getting-started/getting-started";
import { useApplicationState } from "@core/app-state";

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
      initial={
        new BoringDocument({
          // todo: implement router and load content
          title: new BoringTitle("."),
          content: new BoringContent(""),
        })
      }
    />
  );
}
