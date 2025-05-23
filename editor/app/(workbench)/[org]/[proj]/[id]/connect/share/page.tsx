"use client";

import { CopyToClipboardInput } from "@/components/copy-to-clipboard-input";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxHeader,
  Sector,
  SectorBlocks,
  SectorDescription,
  SectorHeader,
  SectorHeading,
} from "@/components/preferences";
import { useEditorState } from "@/scaffolds/editor";
import { AboutThisForm } from "@/scaffolds/settings/about-this-form";
import React from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function WithLink() {
  const [state] = useEditorState();
  const { form } = state;

  const { data } = useSWR(`/private/editor/${form.form_id}/share`, fetcher);

  const { url, url_tenant, submit, embed } = data || {};

  return (
    <main className="max-w-2xl mx-auto">
      <Sector>
        <AboutThisForm form_id={form.form_id} />
      </Sector>
      <Sector>
        <SectorHeader>
          <SectorHeading>Share the link</SectorHeading>
          <SectorDescription>
            We provide built-in page URL, although you can build your own
            frontend page.
          </SectorDescription>
        </SectorHeader>
        <SectorBlocks>
          <PreferenceBox>
            <PreferenceBoxHeader heading={<>Built-in Page URL</>} />
            <PreferenceBody>
              <div className="w-full flex flex-col gap-4">
                <div className="grid gap-2">
                  <label className="text-sm text-muted-foreground">
                    Your custom domain URL (may change)
                  </label>
                  <CopyToClipboardInput value={url_tenant} />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm text-muted-foreground">
                    Static URL (always available)
                  </label>
                  <CopyToClipboardInput value={url} />
                </div>
              </div>
            </PreferenceBody>
          </PreferenceBox>
          <PreferenceBox>
            <PreferenceBoxHeader heading={<>Embedding</>} />
            <PreferenceBody>
              <CopyToClipboardInput value={build_embed_code(embed)} />
            </PreferenceBody>
          </PreferenceBox>
        </SectorBlocks>
      </Sector>
      <Sector>
        <SectorHeader>
          <SectorHeading>Headless usage</SectorHeading>
          <SectorDescription>
            Using <code className="font-mono">/v1/submit</code> api, you can
            start collecting forms without the need of backend
          </SectorDescription>
        </SectorHeader>
        <SectorBlocks>
          <PreferenceBox>
            <PreferenceBoxHeader heading={<>Action URL</>} />
            <PreferenceBody>
              <p className="mb-2 opacity-80">
                Use this URL to action on your html form to collect data
                directly to the backend.
              </p>
              <CopyToClipboardInput value={submit} />
            </PreferenceBody>
          </PreferenceBox>
        </SectorBlocks>
      </Sector>
    </main>
  );
}

function build_embed_code(url: string) {
  return `<iframe src="${url}" width="100%" height="600px" frameBorder="0"></iframe>`;
}
