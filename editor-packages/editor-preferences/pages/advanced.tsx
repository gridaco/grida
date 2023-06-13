import React, { useState, useEffect } from "react";
import { PageContentLayout } from "../layouts";
import type { Preference, PreferencePageProps } from "../core";
import { PreferenceItem } from "../components/preference-item";
import { useWorkspace, useWorkspaceState } from "editor/core/states";

const ppi_debug_mode = "workbench.debug-mode.enabled";

const preference_debug_mode: Preference = {
  identifier: "editor.debug-mode",
  title: "Enable Debug Mode",
  properties: {
    [ppi_debug_mode]: {
      type: "boolean",
      description:
        "Experimental: Enabling Debug Mode will provide advanced tooling for deeper inspections and monotor activities behind the scene.",
      default: false,
    },
  },
};

export default function AdvancedPreferencesPage({
  state,
  dispatch,
}: PreferencePageProps) {
  const { debugMode } = useWorkspaceState();
  const { setDebugMode } = useWorkspace();

  return (
    <>
      <PageContentLayout>
        <h1>Advanced</h1>
        <main>
          <section>
            <PreferenceItem
              {...preference_debug_mode}
              values={{
                [ppi_debug_mode]: debugMode,
              }}
              onChange={(k, v: boolean) => {
                if (k == ppi_debug_mode) {
                  setDebugMode(v);
                }
              }}
            />
          </section>
        </main>
      </PageContentLayout>
    </>
  );
}
