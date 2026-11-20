"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type {
  DesktopBridge,
  DesktopPersonalizationSettings,
} from "@grida/desktop-bridge";
import {
  NativeSelect,
  NativeSelectOption,
} from "@app/ui/components/native-select";
import { Switch } from "@app/ui/components/switch";
import { SettingsPersonalization } from "@/lib/desktop/settings-personalization";

const searchModes = {
  disabled: {
    label: "Off",
    description: "Keep web search off for all messages.",
  },
  onDemand: {
    label: "On demand",
    description:
      "Choose Web search in the composer for the messages that need it.",
  },
  cached: {
    label: "Cached",
    description:
      "Let the agent search pre-indexed results on supported models.",
  },
  indexed: {
    label: "Indexed",
    description:
      "Let the agent fetch live pages when the search index allows it.",
  },
  live: {
    label: "Live",
    description:
      "Let the agent search the live web when a message needs current information.",
  },
} satisfies Record<
  DesktopPersonalizationSettings["webSearch"],
  { label: string; description: string }
>;

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
    <section
      data-testid="settings-personalization"
      className="@container max-w-3xl space-y-5"
    >
      <header>
        <h2 className="text-lg font-semibold tracking-tight">
          Personalization
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose how the agent responds in your chats.
        </p>
      </header>
      {controller ? (
        <PreferenceRows controller={controller} legacy={!api} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Update Desktop to configure your chat preferences.
        </p>
      )}
    </section>
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
  const disabled = !preference || state.saving;
  if (state.unavailable)
    return (
      <p className="text-sm text-muted-foreground">
        Chat preferences are unavailable in this Desktop session.
      </p>
    );
  return (
    <>
      <div className="divide-y border-y">
        {!legacy && (
          <PreferenceRow
            id="fast-mode"
            label="Fast mode"
            description="Show faster response speeds for eligible ChatGPT subscription models. Faster speeds use more of your allowance."
          >
            <Switch
              id="fast-mode"
              aria-describedby="fast-mode-description"
              disabled={disabled}
              checked={preference?.fastMode ?? false}
              onCheckedChange={(fastMode) => void controller.set({ fastMode })}
            />
          </PreferenceRow>
        )}
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
            description={
              preference
                ? searchModes[preference.webSearch].description
                : "Choose when supported ChatGPT subscription models may search the web."
            }
          >
            <NativeSelect
              id="web-search"
              size="sm"
              aria-describedby="web-search-description"
              value={preference?.webSearch ?? ""}
              disabled={disabled}
              onChange={(event) => {
                const mode = event.currentTarget
                  .value as DesktopPersonalizationSettings["webSearch"];
                if (Object.hasOwn(searchModes, mode))
                  void controller.set({ webSearch: mode });
              }}
            >
              {!preference && (
                <NativeSelectOption value="">Loading…</NativeSelectOption>
              )}
              {Object.entries(searchModes).map(([value, mode]) => (
                <NativeSelectOption key={value} value={value}>
                  {mode.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </PreferenceRow>
        )}
      </div>
      {legacy && (
        <p className="text-sm text-muted-foreground">
          Update Desktop to configure fast mode and web search.
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
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-4">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <p
        id={id + "-description"}
        className="col-span-2 row-start-2 max-w-prose text-sm text-muted-foreground @sm:col-span-1"
      >
        {description}
      </p>
      <div className="col-start-2 row-start-1 justify-self-end @sm:row-span-2">
        {children}
      </div>
    </div>
  );
}
