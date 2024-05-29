"use client";

import { JSONFormRaw, parse } from "@/types/schema";
import { FormRenderTree } from "@/lib/forms";
import { FormView } from "@/scaffolds/e/form";
import { useEffect, useRef, useState } from "react";
import resources from "@/i18n";
import { nanoid } from "nanoid";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import useVariablesCSS from "../use-variables-css";
import { FormsPageLanguage } from "@/types";
import { useTheme } from "next-themes";

export default function PlaygroundPreview({
  schema,
  css,
  dark,
}: {
  schema: string;
  css: string;
  dark?: boolean;
}) {
  const ref = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.contentWindow?.postMessage(
        { type: "set_schema", schema },
        "*"
      );
    }
  }, [schema]);

  useEffect(() => {
    if (ref.current) {
      ref.current.contentWindow?.postMessage(
        { type: "set_variablescss", variablescss: css },
        "*"
      );
    }
  }, [css]);

  useEffect(() => {
    if (ref.current) {
      ref.current.contentWindow?.postMessage(
        { type: "set_dark_mode", dark },
        "*"
      );
    }
  }, [dark]);

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

export function PlaygroundPreviSlave() {
  const { theme, setTheme } = useTheme();

  const [schema, setSchema] = useState<string | null>(null);
  const [variablescss, setVariablescss] = useState<string | null>(null);

  useVariablesCSS(variablescss);

  useEffect(() => {
    const cb = (event: MessageEvent) => {
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
      {renderer ? (
        <>
          {invalid && (
            <div className="absolute top-2 right-2 bg-red-500 p-2 rounded shadow">
              <ExclamationTriangleIcon />
            </div>
          )}
          <FormView
            title={"Form"}
            form_id={renderer.id}
            fields={renderer.fields()}
            blocks={renderer.blocks()}
            tree={renderer.tree()}
            translation={resources[lang].translation as any}
            options={{
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
    </>
  );
}
