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
import { AboutThisForm } from "@/scaffolds/settings/about-this-form";
import React from "react";

const HOST = process.env.HOST;

async function getData(id: string) {
  const res = await fetch(`${HOST}/v1/${id}/share`);
  // The return value is *not* serialized
  // You can return Date, Map, Set, etc.

  if (!res.ok) {
    // This will activate the closest `error.js` Error Boundary
    throw new Error("Failed to fetch data");
  }

  return res.json();
}

export default async function WithLink({ params }: { params: { id: string } }) {
  const { id } = params;
  const data = await getData(id);

  const { url, submit, embed } = data;

  return (
    <main className="max-w-2xl mx-auto">
      <Sector>
        <AboutThisForm form_id={id} />
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
              <p className="mb-2 opacity-80">
                Share this link with your users to let them fill out the form.
                <br />
              </p>
              <CopyToClipboardInput value={url} />
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
            Using <code className="font-mono">/submit</code> api, you can start
            collecting forms without the need of backend
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
