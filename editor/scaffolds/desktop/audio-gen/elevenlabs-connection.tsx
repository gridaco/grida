"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { Button } from "@app/ui/components/button";
import { secrets } from "@/lib/desktop/bridge";
import { ElevenLabsConnection } from "./elevenlabs-connection-state";

export const ELEVENLABS_SETTINGS_HREF =
  "/desktop/settings#provider-elevenlabs" as const;

/**
 * Secret-free presence check shared by ElevenLabs audio composers.
 *
 * `refresh` returns the observed state so callers can re-check after a failed
 * generation without depending on custom error fields surviving Electron's
 * promise serialization.
 */
export function useElevenLabsConnection(): {
  state: ElevenLabsConnection.State;
  refresh: () => Promise<ElevenLabsConnection.State>;
} {
  const [state, setState] = useState(ElevenLabsConnection.initial);

  const refresh = useCallback(async (): Promise<ElevenLabsConnection.State> => {
    const next = await ElevenLabsConnection.probe(() =>
      secrets.hasKey("elevenlabs")
    );
    setState(next);
    return next;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, refresh };
}

export function ElevenLabsSetupNotice({
  feature,
}: {
  feature: "sound effects" | "voice";
}) {
  return (
    <div
      data-testid="notice-elevenlabs-setup"
      className="mx-auto w-full max-w-2xl rounded-2xl border bg-background p-4 shadow-lg"
      role="status"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <KeyRound className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Connect ElevenLabs</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add an ElevenLabs API key in Settings to generate {feature}. Grida
            Desktop stores the key locally for ElevenLabs requests.
          </p>
          <Button asChild size="sm" className="mt-3">
            <Link href={ELEVENLABS_SETTINGS_HREF}>
              Open ElevenLabs settings
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
