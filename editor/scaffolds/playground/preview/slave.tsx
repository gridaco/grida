"use client";

import React, { useEffect, useState } from "react";
import { JSONFormRaw, parse } from "@/types/schema";
import { FormRenderTree } from "@/lib/forms";
import { GridaFormsFormView } from "@/scaffolds/e/form";
import resources from "@/i18n";
import { nanoid } from "nanoid";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import useVariablesCSS from "../use-variables-css";
import type { FormsPageLanguage } from "@/grida-forms/hosted/types";
import { useTheme } from "next-themes";
import type { PlaygroundWindowMessageAction } from "@/lib/forms/messages";
import { FormAgentGlobalWindowMessagingInterface } from "@/scaffolds/e/form/interface";

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

export default function PlaygroundPreviewSlave() {
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
              <div className="absolute top-2 right-2 bg-red-500 p-2 rounded-sm shadow">
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
