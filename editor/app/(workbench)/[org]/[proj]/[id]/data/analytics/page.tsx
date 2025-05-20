"use client";

import LiveWorldAnalytics from "@/scaffolds/analytics/world/live-world-analytics";
import {
  FormResponseFeedProvider,
  FormResponseSessionFeedProvider,
} from "@/scaffolds/editor/feed";
import { useEditorState } from "@/scaffolds/editor";
import { useMemo } from "react";
import { EditorSymbols } from "@/scaffolds/editor/symbols";
import type { Analytics } from "@/lib/analytics";
import type { GridaSchemaTableVirtualRow } from "@/scaffolds/editor/state";
import type { FormResponseSession } from "@/grida-forms-hosted/types";

function useAnalyticsEventStreams(
  response_stream: GridaSchemaTableVirtualRow[],
  session_stream: FormResponseSession[]
): Analytics.EventStream[] {
  const RECENT_N = 50;

  const responseEvents: Analytics.AnyEvent[] = useMemo(() => {
    if (!response_stream || response_stream.length === 0) return [];
    const sorted = response_stream
      .slice()
      .sort((a, b) => a.meta.local_index - b.meta.local_index);
    return sorted.slice(-RECENT_N).map((r) => {
      const latitude = r.meta.geo?.latitude
        ? parseFloat(r.meta.geo.latitude)
        : null;
      const longitude = r.meta.geo?.longitude
        ? parseFloat(r.meta.geo.longitude)
        : null;
      return {
        id: r.id,
        at: new Date(r.meta.created_at),
        raw: r,
        geo: latitude && longitude ? { latitude, longitude } : null,
      } as Analytics.AnyEvent;
    });
  }, [response_stream]);

  const sessionEvents: Analytics.AnyEvent[] = useMemo(() => {
    if (!session_stream || session_stream.length === 0) return [];
    return session_stream.map((s) => ({
      id: s.id,
      at: new Date(s.created_at),
      raw: s,
      geo: null,
    })) as Analytics.AnyEvent[];
  }, [session_stream]);

  return useMemo(
    () => [
      {
        name: "Responses",
        description: "Responses in Last 15 Minutes",
        data: responseEvents,
        showonmap: true,
      },
      {
        name: "Sessions",
        description: "Sessions in Last 15 Minutes",
        data: sessionEvents,
        showonmap: false,
      },
    ],
    [responseEvents, sessionEvents]
  );
}

export default function DataAnalyticsPage() {
  const [state] = useEditorState();
  const response_stream =
    state.tablespace[EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID]
      ?.stream || [];
  const session_stream =
    state.tablespace[EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID]
      ?.stream || [];

  const eventStreams = useAnalyticsEventStreams(
    response_stream,
    session_stream
  );

  return (
    <FormResponseFeedProvider>
      <FormResponseSessionFeedProvider forceEnableRealtime>
        <LiveWorldAnalytics eventStreams={eventStreams} />
      </FormResponseSessionFeedProvider>
    </FormResponseFeedProvider>
  );
}
