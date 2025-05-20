"use client";

import { useEffect, useRef, useState } from "react";
import type {
  FormEventMessage,
  PlaygroundWindowMessageAction,
} from "@/grida-forms/lib/messages";

type EventHandlersMap = Partial<{
  [K in FormEventMessage["type"]]: (
    event: MessageEvent<Extract<FormEventMessage, { type: K }>>
  ) => void;
}>;

export default function PlaygroundPreview({
  schema,
  css,
  dark,
  onMessage,
  onEvent,
}: {
  schema: string;
  css: string;
  dark?: boolean;
  onMessage?: (event: MessageEvent<FormEventMessage>) => void;
  onEvent?: EventHandlersMap;
}) {
  const [ready, setReady] = useState(false);
  const ref = useRef<HTMLIFrameElement>(null);

  const message = (data: PlaygroundWindowMessageAction) => {
    ref.current?.contentWindow?.postMessage(data, "*");
  };

  useEffect(() => {
    if (ref.current) {
      message({ type: "set_schema", schema });
    }
  }, [schema, ready]);

  useEffect(() => {
    if (ref.current) {
      message({ type: "set_variablescss", variablescss: css });
    }
  }, [css, ready]);

  useEffect(() => {
    if (ref.current) {
      message({ type: "set_dark_mode", dark: dark || false });
    }
  }, [dark, ready]);

  // forward messages
  useEffect(() => {
    const cb = (event: MessageEvent<FormEventMessage>) => {
      if (
        "namespace" in event.data &&
        event.data.namespace.includes("grida.co")
      ) {
        onMessage?.(event);
        onEvent?.[event.data.type]?.(event as any);

        switch (event.data.type) {
          case "messaging_interface_ready":
            setReady(true);
            break;
        }
      } else {
        // 3rd party junks
      }
    };

    window.addEventListener("message", cb);

    return () => {
      window.removeEventListener("message", cb);
    };
  }, [onMessage]);

  return <iframe ref={ref} width="100%" height="100%" src="/preview" />;
}
