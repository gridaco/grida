"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { HistoryIcon, Loader2, XIcon } from "lucide-react";
import { Button } from "@app/ui/components/button";
import { Label } from "@app/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@app/ui/components/select";
import { Browser } from "@/lib/desktop/browser";
import { BrowserHistory } from "@/lib/desktop/browser-history";
import { BrowserLinkPreferences } from "@/lib/desktop/browser-link-preferences";
import { SettingsBrowser } from "@/lib/desktop/settings-browser";
import { SettingsGroup, SettingsSection } from "./settings-layout";

const LINK_DESTINATION_SETTINGS = [
  {
    kind: "web",
    label: "Open web links in",
    description: "Website links from a workspace.",
  },
  {
    kind: "local",
    label: "Open local links in",
    description: "Local development links, such as localhost.",
  },
] as const;

function BrowserLinkOpeningSettings() {
  const preferences = useSyncExternalStore(
    BrowserLinkPreferences.subscribe,
    BrowserLinkPreferences.read,
    () => BrowserLinkPreferences.defaults
  );
  const [saveFailed, setSaveFailed] = useState(false);

  function setDestination(
    kind: keyof BrowserLinkPreferences.Snapshot,
    destination: string
  ) {
    if (destination !== "grida" && destination !== "system") return;
    try {
      BrowserLinkPreferences.set(kind, destination);
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    }
  }

  return (
    <SettingsGroup role="region" aria-label="Link opening">
      {LINK_DESTINATION_SETTINGS.map(({ kind, label, description }) => {
        const id = `browser-link-destination-${kind}`;
        return (
          <div
            key={kind}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
          >
            <div className="min-w-44 flex-1">
              <Label htmlFor={id} className="leading-normal">
                {label}
              </Label>
              <p
                id={`${id}-description`}
                className="mt-1 text-xs text-muted-foreground"
              >
                {description}
              </p>
            </div>
            <Select
              value={preferences[kind]}
              onValueChange={(destination) => setDestination(kind, destination)}
            >
              <SelectTrigger
                id={id}
                aria-describedby={`${id}-description`}
                size="sm"
                className="w-40 shrink-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                <SelectItem value="grida">Grida</SelectItem>
                <SelectItem value="system">Default browser</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );
      })}
      {saveFailed && (
        <p role="alert" className="px-4 py-3 text-sm text-destructive">
          Couldn’t save where links open. Try again.
        </p>
      )}
    </SettingsGroup>
  );
}

export function BrowserSettings() {
  const [controller] = useState(
    () => new SettingsBrowser.Controller(Browser.getBridge)
  );
  const [history] = useState(
    () => new BrowserHistory.Controller(() => Browser.getBridge()?.history, 100)
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  const historyState = useSyncExternalStore(
    history.subscribe,
    history.read,
    history.read
  );
  useEffect(() => {
    const refresh = () => {
      controller.refresh();
      void history.refresh();
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      controller.cancel();
      history.cancel();
    };
  }, [controller, history]);
  const busy = state.clearing || state.action !== null;

  return (
    <SettingsSection
      title="Browser"
      description="Choose where links open and manage website data."
      data-testid="settings-browser"
    >
      <BrowserLinkOpeningSettings />
      {state.managementSupported && (
        <SettingsGroup>
          <section className="space-y-4 px-4 py-4" aria-label="Downloads">
            <div>
              <h3 className="text-sm font-medium">Downloads</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Files save to your chosen folder and continue downloading when a
                tab closes.
              </p>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm">Location</p>
                <p className="truncate text-xs text-muted-foreground">
                  {state.downloads?.directoryName ?? "System Downloads folder"}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void controller.chooseDownloadDirectory()}
              >
                Change…
              </Button>
            </div>
            <label className="flex items-center justify-between gap-4 text-sm">
              Ask where to save each download
              <input
                type="checkbox"
                checked={state.downloads?.askBeforeDownload ?? false}
                disabled={busy || !state.downloads}
                onChange={(event) =>
                  void controller.setDownloadPrompt(event.currentTarget.checked)
                }
                className="size-4 accent-primary"
              />
            </label>
          </section>
          <section
            className="flex items-center justify-between gap-4 px-4 py-4"
            aria-label="Site permissions"
          >
            <div>
              <h3 className="text-sm font-medium">Site permissions</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Reset website choices and reload open pages to stop active
                access.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void controller.resetPermissions()}
            >
              Reset permissions
            </Button>
          </section>
          <section
            className="flex items-center justify-between gap-4 px-4 py-4"
            aria-label="Browser cache"
          >
            <div>
              <h3 className="text-sm font-medium">Browser cache</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Clear cached responses while keeping tabs, history and website
                sign-ins.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void controller.clearCache()}
            >
              Clear cache
            </Button>
          </section>
        </SettingsGroup>
      )}
      {!state.supported ? (
        <p className="text-sm text-muted-foreground">
          Update Desktop to manage browser data in Settings.
        </p>
      ) : (
        <SettingsGroup>
          <div className="space-y-1 px-4 py-3">
            <h3 className="text-sm font-medium">Cookies and site data</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Website data is shared across all built-in browser tabs and
              windows. Clearing it closes all browser tabs and removes website
              sign-ins, history, storage and cache.
            </p>
          </div>
          <div className="px-4 py-4">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void controller.clear()}
            >
              {state.clearing && <Loader2 className="size-3.5 animate-spin" />}
              Clear browsing data…
            </Button>
          </div>
        </SettingsGroup>
      )}
      {state.result === "cleared" && (
        <p role="status" className="text-sm text-muted-foreground">
          Browsing data cleared.
        </p>
      )}
      {state.result === "cancelled" && (
        <p role="status" className="text-sm text-muted-foreground">
          Clearing cancelled.
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {state.notice}
        </p>
      )}
      {state.supported && (
        <section aria-labelledby="browser-history-title" className="space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <h3 id="browser-history-title" className="text-sm font-medium">
                History
              </h3>
              {state.managementSupported && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void controller.clearHistory()}
                >
                  Clear history
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Recent pages are shared across all browser tabs and windows.
              Removing an entry keeps its open page and website sign-in.
            </p>
          </div>
          {!historyState.supported ? (
            <p className="text-sm text-muted-foreground">
              Update Desktop to manage browsing history.
            </p>
          ) : (
            <>
              <input
                type="search"
                aria-label="Search browsing history"
                placeholder="Search history"
                value={historyState.query}
                disabled={busy}
                onChange={(event) =>
                  history.setQuery(event.currentTarget.value)
                }
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {historyState.error && (
                <p role="alert" className="text-sm text-destructive">
                  {historyState.error}
                </p>
              )}
              <div aria-live="polite" className="text-xs text-muted-foreground">
                {historyState.loading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2
                      aria-hidden="true"
                      className="size-3 animate-spin"
                    />
                    Loading history…
                  </span>
                ) : !historyState.error && !historyState.entries.length ? (
                  historyState.query ? (
                    "No matching history."
                  ) : (
                    "No browsing history yet."
                  )
                ) : null}
              </div>
              {historyState.entries.length > 0 && (
                <ul
                  aria-label="Browsing history"
                  aria-busy={historyState.loading}
                  className="max-h-80 divide-y overflow-y-auto rounded-xl border"
                >
                  {historyState.entries.map((entry) => (
                    <li
                      key={entry.url}
                      className="flex items-center gap-3 px-3 py-3"
                    >
                      <HistoryIcon
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                      <div className="min-w-0 flex-1">
                        {state.canOpenHistory ? (
                          <button
                            type="button"
                            className="block max-w-full truncate text-left text-sm hover:underline"
                            title={entry.title}
                            disabled={busy}
                            onClick={() =>
                              void controller.openHistory(entry.url)
                            }
                          >
                            {entry.title || entry.url}
                          </button>
                        ) : (
                          <p className="truncate text-sm" title={entry.title}>
                            {entry.title || entry.url}
                          </p>
                        )}
                        <p
                          className="truncate text-xs text-muted-foreground"
                          title={entry.url}
                        >
                          {entry.url}
                        </p>
                        <time
                          dateTime={new Date(entry.lastVisitedAt).toISOString()}
                          className="text-xs text-muted-foreground"
                        >
                          {new Date(entry.lastVisitedAt).toLocaleString()}
                        </time>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Remove from history"
                        aria-label={`Remove ${entry.title || entry.url} from history`}
                        disabled={busy || historyState.removing.has(entry.url)}
                        onClick={() => void history.remove(entry.url)}
                      >
                        {historyState.removing.has(entry.url) ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <XIcon className="size-3.5" />
                        )}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Website permission choices last for this Desktop session. Restart
        Desktop to fully reset development certificate exceptions.
      </p>
    </SettingsSection>
  );
}
