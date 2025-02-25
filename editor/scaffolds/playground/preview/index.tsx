"use client";

import { JSONFormRaw, parse } from "@/types/schema";
import { FormRenderTree } from "@/lib/forms";
import { GridaFormsFormView } from "@/scaffolds/e/form";
import { useEffect, useRef, useState } from "react";
import resources from "@/i18n";
import { nanoid } from "nanoid";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import useVariablesCSS from "../use-variables-css";
import { FormsPageLanguage } from "@/types";
import { useTheme } from "next-themes";
import type {
  FormEventMessage,
  PlaygroundWindowMessageAction,
} from "@/lib/forms/messages";
import { FormAgentGlobalWindowMessagingInterface } from "@/scaffolds/e/form/interface";

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

function compile(value?: string | JSONFormRaw) {
  const schema = parse(value);
  if (!schema) {
    return;
  }

  const renderer = new FormRenderTree(
    nanoid(),
    schema.title,
    schema.description,
    schema.lang,
    schema.fields ?? [],
    schema.blocks ?? [],
    {
      blocks: {
        when_empty: {
          header: {
            title_and_description: {
              enabled: true,
            },
          },
        },
      },
    }
  );

  return renderer;
}

function useRenderer(raw?: string | JSONFormRaw | null) {
  // use last valid schema
  const [valid, setValid] = useState<FormRenderTree>();
  const [invalid, setInvalid] = useState<boolean>(false);

  useEffect(() => {
    if (raw) {
      const o = compile(raw);
      if (o) {
        setValid(o);
        setInvalid(false);
      } else {
        setInvalid(true);
      }
    }
  }, [raw]);

  return [valid, invalid] as const;
}

export function PlaygroundPreviewSlave() {
  const { theme, setTheme } = useTheme();

  const [schema, setSchema] = useState<string | null>(null);
  const [variablescss, setVariablescss] = useState<string | null>(null);

  useVariablesCSS(variablescss);

  useEffect(() => {
    const cb = (event: MessageEvent<PlaygroundWindowMessageAction>) => {
      switch (event.data?.type) {
        case "set_schema":
          setSchema(event.data.schema);
          break;
        case "set_variablescss":
          setVariablescss(event.data.variablescss);
          break;
        case "set_dark_mode":
          setTheme(event.data.dark ? "dark" : "light");
          break;
      }
    };

    window.addEventListener("message", cb);

    return () => {
      window.removeEventListener("message", cb);
    };
  }, []);

  const [renderer, invalid] = useRenderer(schema);
  const lang: FormsPageLanguage = (renderer?.lang ?? "en") as FormsPageLanguage;

  return (
    <>
      <FormAgentGlobalWindowMessagingInterface>
        {renderer ? (
          <>
            {invalid && (
              <div className="absolute top-2 right-2 bg-red-500 p-2 rounded shadow">
                <ExclamationTriangleIcon />
              </div>
            )}
            <GridaFormsFormView
              form_id={renderer.id}
              fields={renderer.fields()}
              blocks={renderer.blocks()}
              tree={renderer.tree()}
              translation={resources[lang].translation as any}
              config={{
                is_powered_by_branding_enabled: true,
              }}
            />
          </>
        ) : (
          <>
            <div className="grow flex items-center justify-center p-4 text-center text-gray-500">
              Invalid schema
            </div>
          </>
        )}
      </FormAgentGlobalWindowMessagingInterface>
    </>
  );
}
