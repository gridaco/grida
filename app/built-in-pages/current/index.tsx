import React, { useEffect, useState } from "react";
import { BoringScaffold } from "../../boring-scaffold";

import { hooks } from "@core/app-state";
import { getting_started_document } from "../getting-started/getting-started";
import { PageStore } from "@core/store";
import { Page } from "@core/model";

export function CurrentPage() {
  const page = hooks.useCurrentPage();

  if (!page) {
    return <>ERROR</>;
  }

  // region - temporary static prebuilt-pages router
  if (page.id == "built-in/getting-started") {
    return <BoringScaffold initial={getting_started_document} />;
  }
  // endregion - temporary static prebuilt-pages router

  return <BoringScaffold key={page.id} initial={page.document.id} />;
}
