import React, { useEffect } from "react";
import { PageContentLayout } from "../layouts";
import type { Preference, PreferencePageProps } from "../core";
import { PreferenceItem } from "../components/preference-item";

const preference_debug_mode: Preference = {
  identifier: "editor.debug-mode",
  title: "Debug Mode",
  properties: {
    "editor.debug-mode.enabled": {
      type: "boolean",
      description: "Enable debug mode",
      default: false,
    },
  },
};

export default function AdvancedPreferencesPage({
  state,
  dispatch,
}: PreferencePageProps) {
  return (
    <>
      <PageContentLayout>
        <h1>Advanced</h1>
        <main>
          <section>
            <PreferenceItem {...preference_debug_mode} />
          </section>
        </main>
      </PageContentLayout>
    </>
  );
}
