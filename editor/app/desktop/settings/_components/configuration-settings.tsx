"use client";

import { Button } from "@app/ui/components/button";
import { useSettingsHooks } from "@/lib/desktop/settings-hooks-react";
import { SettingsGroup, SettingsSection } from "./settings-layout";

export function ConfigurationSettings() {
  const { controller, state } = useSettingsHooks();
  const { inspection, loading, supported } = state;
  const opening = state.action === "open";
  const create = inspection?.exists === false;
  const fileAction = create ? "Create" : "Open";
  const label = opening
    ? create
      ? "Creating…"
      : "Opening…"
    : loading
      ? "Checking…"
      : inspection
        ? fileAction
        : "Retry";

  return (
    <SettingsSection title="Configuration" data-testid="settings-configuration">
      <SettingsGroup>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">Configuration file</h3>
            <p className="text-sm text-muted-foreground">
              {!supported && !loading
                ? "Opening config.toml is unavailable in this version of Grida Desktop."
                : "Customize your agent experience across workspaces."}
            </p>
          </div>
          {(supported || loading) && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={loading || opening}
              onClick={() =>
                void (inspection
                  ? controller.openConfig()
                  : controller.refresh())
              }
            >
              {label}
            </Button>
          )}
        </div>
      </SettingsGroup>
      <p className="text-sm text-muted-foreground">
        Restart Grida Desktop after editing <code>config.toml</code> to apply
        agent configuration changes to new messages.
      </p>
      {inspection && (
        <p className="break-all font-mono text-xs text-muted-foreground">
          {inspection.configPath}
        </p>
      )}
      {inspection?.configDiagnostics?.map((message, index) => (
        <p key={index} role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      ))}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </SettingsSection>
  );
}
