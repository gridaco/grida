"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { DesktopBridge } from "@grida/desktop-bridge";
import { Switch } from "@app/ui/components/switch";
import { SettingsPersonalization } from "@/lib/desktop/settings-personalization";
import { SettingsGroup, SettingsSection } from "./settings-layout";

export function PersonalizationSettings({
  api,
  legacyPredictions,
}: {
  api?: DesktopBridge["personalization"];
  legacyPredictions?: DesktopBridge["composerPredictions"];
}) {
  const [controller] = useState(() =>
    api
      ? new SettingsPersonalization(api)
      : legacyPredictions
        ? SettingsPersonalization.fromPredictions(legacyPredictions)
        : null
  );
  return (
    <SettingsSection
      title="Personalization"
      description="Choose how the agent responds in your chats."
      data-testid="settings-personalization"
      className="@container"
    >
      {controller ? (
        <PreferenceRows controller={controller} legacy={!api} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Update Desktop to configure your chat preferences.
        </p>
      )}
    </SettingsSection>
  );
}

function PreferenceRows({
  controller,
  legacy,
}: {
  controller: SettingsPersonalization;
  legacy: boolean;
}) {
  useEffect(() => {
    const disconnect = controller.connect();
    window.addEventListener("focus", controller.refresh);
    return () => {
      window.removeEventListener("focus", controller.refresh);
      disconnect();
    };
  }, [controller]);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  const preference = state.preference;
  const webSearch = preference?.webSearch;
  const disabled = !preference || state.saving;
  if (state.unavailable)
    return (
      <p className="text-sm text-muted-foreground">
        Chat preferences are unavailable in this Desktop session.
      </p>
    );
  return (
    <>
      <SettingsGroup>
        <PreferenceRow
          id="suggested-prompts"
          label="Suggested prompts"
          description="Suggest a follow-up after a reply. Suggestions use an extra model request and may count toward your provider’s usage limits."
        >
          <Switch
            id="suggested-prompts"
            aria-describedby="suggested-prompts-description"
            disabled={disabled}
            checked={preference?.suggestedPrompts ?? false}
            onCheckedChange={(suggestedPrompts) =>
              void controller.set({ suggestedPrompts })
            }
          />
        </PreferenceRow>
        {!legacy && (
          <PreferenceRow
            id="web-search"
            label="Web search"
            description="Let the agent search the web when it needs current information."
          >
            <Switch
              id="web-search"
              aria-describedby="web-search-description"
              disabled={disabled}
              checked={webSearch === "live"}
              onCheckedChange={(automatic) =>
                void controller.set({
                  webSearch: automatic ? "live" : "disabled",
                })
              }
            />
          </PreferenceRow>
        )}
      </SettingsGroup>
      {legacy && (
        <p className="text-sm text-muted-foreground">
          Update Desktop to configure web search.
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </>
  );
}

function PreferenceRow({
  id,
  label,
  description,
  children,
}: {
  id: string;
  label: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <p
        id={id + "-description"}
        className="col-span-2 row-start-2 max-w-prose text-xs text-muted-foreground @sm:col-span-1"
      >
        {description}
      </p>
      <div className="col-start-2 row-start-1 justify-self-end @sm:row-span-2">
        {children}
      </div>
    </div>
  );
}
